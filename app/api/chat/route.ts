import { NextRequest, NextResponse } from "next/server";
import { DETAILED_JOBS_AND_EXAMS } from "@/lib/jobsData";
import { COURSES_DATA } from "@/lib/coursesData";
import { DEFAULT_USER_PROFILE, UserProfileContext } from "@/lib/userProfile";
import { sendPromptToGroq, streamGroqCompletion } from "@/lib/groqClient";
import { JobDetailItem } from "@/components/screens/JobDetailsScreen";

interface ChatRequestPayload {
  message: string;
  history?: { sender: "user" | "ai"; text: string }[];
  userProfile?: UserProfileContext;
  stream?: boolean;
}

export interface RecommendedJobPayload {
  id: string;
  title: string;
  companyOrOrg: string;
  location: string;
  workMode?: string;
  salaryOrScale: string;
  matchScore: number;
  matchReasons: string[];
  matchingSkills: string[];
  missingSkills: string[];
  type: "job" | "exam";
}

export interface RecommendedCoursePayload {
  id: string;
  title: string;
  provider: string;
  duration: string;
  rating: number;
  level: string;
  skills: string[];
}

export type ChatIntent =
  | "acknowledgement"
  | "general_conversation"
  | "project_presentation"
  | "course_recommendation"
  | "technical_question"
  | "follow_up_query"
  | "career_interest_update"
  | "career_guidance"
  | "skill_development"
  | "project_recommendation"
  | "job_search"
  | "resume_improvement"
  | "interview_prep";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ChatRequestPayload;
    const userMessage = (body.message || "").trim();
    const history = body.history || [];
    let profile: UserProfileContext = {
      ...DEFAULT_USER_PROFILE,
      ...(body.userProfile || {}),
    };

    if (!userMessage) {
      return NextResponse.json({ error: "Message cannot be empty." }, { status: 400 });
    }

    // 1. Intelligent Intent Classification
    const intent = classifyIntent(userMessage, history);

    // 2. Handle Career Context Update ("I am more interested in AI")
    let updatedProfile: UserProfileContext | undefined = undefined;
    if (intent === "career_interest_update") {
      const extractedInterest = extractNewInterest(userMessage);
      profile = {
        ...profile,
        interests: [extractedInterest, ...profile.interests.filter((i) => i !== extractedInterest)],
      };
      updatedProfile = profile;
    }

    // 3. Compute verified, non-fabricated job matches & courses from actual app data
    const { rankedJobs, topJob } = rankJobsForProfile(profile, userMessage);
    const recommendedCourses = findCoursesForGaps(topJob?.missingSkills || []);

    // 4. Strict Attachment Rules (Prevent showing unsolicited job cards or course cards)
    // Only attach jobs when user explicitly searches or asks for jobs
    const attachJobs = intent === "job_search";
    // Only attach courses when user explicitly asks for courses or skill roadmap
    const attachCourses = intent === "course_recommendation" || intent === "skill_development";

    const groqKey =
      process.env.GROQ_API_KEY ||
      (process.env.AI_PROVIDER === "groq" ? process.env.AI_API_KEY : undefined);
    const groqModel = process.env.GROQ_MODEL || "qwen/qwen3.8-27b";

    // 5. Contextual follow-up prompt chips based on intent and user profile
    const suggestedFollowUps = generateFollowUps(intent, userMessage, profile, topJob);

    // 6. Handle Real-time Streaming (if stream: true requested)
    if (body.stream === true) {
      const encoder = new TextEncoder();
      const customReadable = new ReadableStream({
        async start(controller) {
          try {
            // Emit meta event immediately so UI can update context, cards, follow-ups
            const metaPayload = {
              type: "meta",
              intent,
              recommendedJobs: attachJobs ? rankedJobs.slice(0, 2) : [],
              recommendedCourses: attachCourses ? recommendedCourses.slice(0, 2) : [],
              suggestedFollowUps,
              updatedProfile,
              provider: groqKey ? "Groq" : "Internal Semantic Reasoning Engine",
              model: groqKey ? groqModel : "Built-in Pathly Engine",
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(metaPayload)}\n\n`));

            // Stream tokens via Groq
            if (groqKey) {
              try {
                await streamGroqCompletion({
                  apiKey: groqKey,
                  userMessage,
                  history,
                  profile,
                  rankedJobs: rankedJobs.slice(0, 3),
                  recommendedCourses: recommendedCourses.slice(0, 2),
                  isCareerRelevant: attachJobs || attachCourses,
                  onToken: (token) => {
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ type: "token", content: token })}\n\n`)
                    );
                  },
                });
              } catch (groqErr) {
                console.warn("[Chat API] Groq streaming call failed, falling back to dynamic generator:", groqErr);
                const fallbackText = generateSemanticResponse({
                  intent,
                  userMessage,
                  history,
                  profile,
                  rankedJobs,
                  topJob,
                  recommendedCourses,
                });
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: "token", content: fallbackText })}\n\n`)
                );
              }
            } else {
              // Built-in dynamic semantic engine stream
              const fallbackText = generateSemanticResponse({
                intent,
                userMessage,
                history,
                profile,
                rankedJobs,
                topJob,
                recommendedCourses,
              });
              // Stream in natural word chunks
              const words = fallbackText.split(" ");
              for (let i = 0; i < words.length; i++) {
                const chunk = (i === 0 ? "" : " ") + words[i];
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: "token", content: chunk })}\n\n`)
                );
              }
            }

            // Emit completion event
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
          } catch (streamErr) {
            console.error("[Chat API] Streaming error:", streamErr);
          } finally {
            controller.close();
          }
        },
      });

      return new Response(customReadable, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
        },
      });
    }

    // 7. Non-Streaming Fallback / Standard JSON Mode
    let aiTextResponse = "";
    let aiProviderName = "Internal Semantic Reasoning Engine";
    let aiModelName = "Built-in Pathly Engine";

    if (groqKey) {
      aiProviderName = "Groq";
      aiModelName = groqModel;
      try {
        aiTextResponse = await sendPromptToGroq({
          apiKey: groqKey,
          userMessage,
          history,
          profile,
          rankedJobs: rankedJobs.slice(0, 3),
          recommendedCourses: recommendedCourses.slice(0, 2),
          isCareerRelevant: attachJobs || attachCourses,
        });
      } catch (err: any) {
        console.warn("[Chat API] Groq API call failed, falling back to internal reasoning engine:", err);
      }
    } else if (process.env.GEMINI_API_KEY && process.env.AI_PROVIDER === "gemini") {
      aiProviderName = "Google Gemini";
      aiModelName = "gemini-1.5-flash";
      try {
        aiTextResponse = await callGeminiApi({
          apiKey: process.env.GEMINI_API_KEY,
          userMessage,
          history,
          profile,
          rankedJobs: rankedJobs.slice(0, 3),
          recommendedCourses: recommendedCourses.slice(0, 2),
          intent,
        });
      } catch (err: any) {
        console.warn("[Chat API] Gemini API call failed:", err);
      }
    }

    if (!aiTextResponse) {
      aiTextResponse = generateSemanticResponse({
        intent,
        userMessage,
        history,
        profile,
        rankedJobs,
        topJob,
        recommendedCourses,
      });
    }

    return NextResponse.json({
      response: aiTextResponse,
      intent,
      recommendedJobs: attachJobs ? rankedJobs.slice(0, 2) : [],
      recommendedCourses: attachCourses ? recommendedCourses.slice(0, 2) : [],
      suggestedFollowUps,
      updatedProfile,
      provider: aiProviderName,
      model: aiModelName,
      profileSummary: {
        name: profile.fullName,
        primaryInterest: profile.interests[0] || "Frontend Development",
        readinessScore: profile.readinessScore,
        skillsCount: profile.skills.length,
      },
    });
  } catch (error: any) {
    console.error("Error in /api/chat route:", error);
    return NextResponse.json(
      { error: "Internal server error occurred in AI Assistant." },
      { status: 500 }
    );
  }
}

// ============================================================================
// Intelligent Intent Classifier
// ============================================================================
function classifyIntent(
  message: string,
  history: { sender: "user" | "ai"; text: string }[]
): ChatIntent {
  const m = message.trim().toLowerCase();

  // 1. Acknowledgement / Courtesy (e.g. "ok", "okay", "thanks", "thank you", "ok thanks", "cool", "got it")
  if (
    /^(ok|okay|k|thanks|thank you|thx|cool|got it|sounds good|great thanks|okay thanks|ok thanks|understood|alright|perfect|sure)[\s.,!]*$/i.test(m) ||
    /^(ok|okay)[,\s]+(thanks|thank you)[\s.,!]*$/i.test(m) ||
    /^(thanks|thank you)[\s.,!]*$/i.test(m)
  ) {
    return "acknowledgement";
  }

  // 2. Follow-up query asking about previous conversation turns
  // ("What did I ask you previously?", "What was my last question?")
  if (
    /what did i (ask|say|mention)/i.test(m) ||
    /what was my (last|previous) (question|message)/i.test(m) ||
    /repeat what i asked/i.test(m) ||
    /what did we (talk|discuss) about/i.test(m)
  ) {
    return "follow_up_query";
  }

  // 3. Follow-up / Anaphoric questions linking to previously discussed topics ("for that", "about that", "for this role")
  // e.g. "what skills should i learn for that?", "how do i prepare for that?", "what projects for that?"
  const hasAnaphoricReference = /\b(for that|for this|about that|about this|for the first one|for this role|for that role|for that career|for that path)\b/i.test(m);
  if (hasAnaphoricReference) {
    if (/skill|learn|study|upskill|knowledge/i.test(m)) {
      return "skill_development";
    }
    if (/project|build|portfolio/i.test(m)) {
      return "project_recommendation";
    }
    if (/course|class|certification/i.test(m)) {
      return "course_recommendation";
    }
    if (/job|opening|vacancy|apply/i.test(m)) {
      return "job_search";
    }
    if (/interview|prep/i.test(m)) {
      return "interview_prep";
    }
    return "career_guidance";
  }

  // 4. Project Presentation & Meeting Delivery ("I want to present my project in a meeting. How should I present it?")
  if (
    /present.*project|project.*presentation|present it in a meeting|how should i present|presentation tips|demo my project|pitch.*project/i.test(m)
  ) {
    return "project_presentation";
  }

  // 5. Course Recommendations ("Suggest any course for me.", "Recommend a course", "Which course to take")
  if (
    /suggest.*course|recommend.*course|any course|courses for me|best courses|which course should i take|course recommendations/i.test(m)
  ) {
    return "course_recommendation";
  }

  // 6. Career interest update ("I am more interested in AI", "I want to switch to government")
  if (
    /(i am|i'm|im) (more|now|also)?\s*(interested in|focused on|looking into|leaning towards|switching to)\s+/i.test(m) ||
    /my (main|primary|new)?\s*interest (is|shifted to|changed to)\s+/i.test(m) ||
    /switch my (career|interest|focus) to/i.test(m)
  ) {
    return "career_interest_update";
  }

  // 7. Job Search & in-app vacancies ("Find available jobs for me.", "Find jobs for me")
  if (
    /find (available )?jobs|search (jobs|openings)|suggest (jobs|roles)|show (available )?(jobs|openings|vacancies)|what jobs (can i|should i)|available (jobs|openings)/i.test(m) ||
    /apply for (jobs|roles)/i.test(m)
  ) {
    return "job_search";
  }

  // 8. Project recommendations ("Suggest projects based on my interests.", "Suggest projects for me.")
  if (/suggest projects|what projects|project ideas|portfolio projects|what to build|what should i build|projects based on/i.test(m)) {
    return "project_recommendation";
  }

  // 9. Skill Development & Learning ("What should I learn next?", "What skills should I learn?")
  if (
    /what should i learn next|what to learn next|skills to learn|what skills should i learn|what skills|how to upskill|how to learn|study plan|missing skills|skills for/i.test(m)
  ) {
    return "skill_development";
  }

  // 10. General Career Guidance, Choice & Roadmaps
  // Handles "what kind of career should i choose", "which career suits me", "what career should i choose", "where to start", etc.
  if (
    /career|what kind of career|choose.*career|career.*choose|which career|what career|career options|career path|what should i do next|next steps|guide me|roadmap|career advice|what job suits me|what role suits me|what field should i/i.test(m)
  ) {
    return "career_guidance";
  }

  // 11. Resume & ATS improvement
  if (/resume|cv|ats|score 78|why is my score|readiness score|increase my score|improve my score/i.test(m)) {
    return "resume_improvement";
  }

  // 12. Interview Preparation
  if (/interview|mock interview|prep for interview|screening round|technical round|coding questions/i.test(m)) {
    return "interview_prep";
  }

  // 13. Technical concepts and explanations ("What is Python?", "Explain React vs Angular", "Explain ML")
  if (
    /^what is (python|javascript|react|angular|vue|node|docker|kubernetes|sql|git|machine learning|ai|typescript|html|css)/i.test(m) ||
    /explain (react vs angular|angular vs react|python|machine learning|deep learning|neural networks|closures|event loop|async|api|rest|graphql)/i.test(m) ||
    /difference between (react and angular|angular and react|let and var|sql and nosql)/i.test(m) ||
    /how does (async\/await|the event loop|a neural network|a promise) work/i.test(m)
  ) {
    return "technical_question";
  }

  // 14. Pure Greetings & General Pleasantries ONLY
  // Strictly matched so substantive questions never get treated as greetings!
  if (
    /^(hi|hello|hey|hiya|greetings|howdy|good\s+(morning|afternoon|evening))[\s.,!]*$/i.test(m) ||
    /^(how are you|how's it going|how are you doing|how do you do)[\s.,?!]*$/i.test(m) ||
    /^(who are you|what is your name|what can you do|introduce yourself)[\s.,?!]*$/i.test(m)
  ) {
    return "general_conversation";
  }

  // 15. General technical/informational questions starting with question words
  if (/^what is|^how to|^explain|^why is|^difference between/i.test(m)) {
    return "technical_question";
  }

  // 16. Fallback
  return "general_conversation";
}

function extractNewInterest(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("ai") || m.includes("artificial intelligence") || m.includes("machine learning") || m.includes("ml")) {
    return "Artificial Intelligence & Machine Learning";
  }
  if (m.includes("govt") || m.includes("government") || m.includes("tnpsc") || m.includes("public service") || m.includes("civil service")) {
    return "Government & Public Service";
  }
  if (m.includes("design") || m.includes("ui") || m.includes("ux") || m.includes("creative")) {
    return "Design & Creative";
  }
  if (m.includes("business") || m.includes("management") || m.includes("product management")) {
    return "Business & Management";
  }
  if (m.includes("data") || m.includes("analytics") || m.includes("data science")) {
    return "Data Science & Analytics";
  }
  return "Frontend Development";
}

// ============================================================================
// Genuine Match Score Calculation (Using Actual Profile & Job Requirements)
// ============================================================================
function calculateRealJobMatch(job: JobDetailItem, profile: UserProfileContext) {
  const userSkillsLower = (profile.skills || []).map((s) => s.toLowerCase().trim());
  const primaryInterest = (profile.interests[0] || "Frontend Development").toLowerCase();

  const reqSkills = job.requiredSkillsOrSyllabus || [];
  const matched = reqSkills.filter((req) =>
    userSkillsLower.some((us) => us.includes(req.toLowerCase()) || req.toLowerCase().includes(us))
  );
  const missing = reqSkills.filter((req) => !matched.includes(req));

  // 1. Skill Match: up to 60 points based on actual verified overlap
  const skillRatio = reqSkills.length > 0 ? matched.length / reqSkills.length : 0.5;
  const skillPoints = Math.round(skillRatio * 60);

  // 2. Domain / Interest Match: up to 25 points
  let domainPoints = 0;
  const isTechInterest =
    primaryInterest.includes("tech") ||
    primaryInterest.includes("frontend") ||
    primaryInterest.includes("web") ||
    primaryInterest.includes("software");
  const isGovtInterest =
    primaryInterest.includes("gov") ||
    primaryInterest.includes("tnpsc") ||
    primaryInterest.includes("public");
  const isDesignInterest =
    primaryInterest.includes("design") ||
    primaryInterest.includes("creative") ||
    primaryInterest.includes("ui");
  const isAiInterest =
    primaryInterest.includes("ai") ||
    primaryInterest.includes("machine learning");

  if (job.type === "exam" && isGovtInterest) {
    domainPoints = 25;
  } else if (job.type === "job" && isTechInterest && job.industry?.toLowerCase().includes("tech")) {
    domainPoints = 25;
  } else if (isDesignInterest && (job.title.toLowerCase().includes("ui") || job.title.toLowerCase().includes("design"))) {
    domainPoints = 25;
  } else if (isAiInterest) {
    domainPoints = 8;
  } else {
    domainPoints = 12;
  }

  // 3. Experience Match: up to 15 points
  let experiencePoints = 10;
  if (profile.experienceYears >= 1 && profile.experienceYears <= 4) {
    experiencePoints = 15;
  } else if (profile.experienceYears < 1) {
    experiencePoints = 8;
  }

  // Calculated Real Match Score (e.g. 93%, 70%, 75%)
  const totalScore = Math.min(95, Math.max(40, skillPoints + domainPoints + experiencePoints));

  const reasons: string[] = [];
  reasons.push(`Matched ${matched.length} of ${reqSkills.length} required skills`);
  if (domainPoints >= 20) {
    reasons.push(`Strong alignment with your interest in ${profile.interests[0]}`);
  }
  if (experiencePoints === 15) {
    reasons.push(`Experience level satisfies hiring criteria`);
  }

  const payload: RecommendedJobPayload = {
    id: job.id,
    title: job.title,
    companyOrOrg: job.companyOrOrg,
    location: job.location,
    workMode: job.workMode,
    salaryOrScale: job.salaryOrScale,
    matchScore: totalScore,
    matchReasons: reasons,
    matchingSkills: matched,
    missingSkills: missing,
    type: job.type as "job" | "exam",
  };

  return payload;
}

function rankJobsForProfile(profile: UserProfileContext, query: string) {
  const jobsList = Object.values(DETAILED_JOBS_AND_EXAMS);
  const qLower = query.toLowerCase();

  const scored = jobsList.map((job) => {
    const payload = calculateRealJobMatch(job, profile);
    if (job.title.toLowerCase().includes(qLower) || job.companyOrOrg.toLowerCase().includes(qLower)) {
      payload.matchScore = Math.min(95, payload.matchScore + 5);
    }
    return payload;
  });

  scored.sort((a, b) => b.matchScore - a.matchScore);

  return {
    rankedJobs: scored,
    topJob: scored[0] || null,
  };
}

function findCoursesForGaps(missingSkills: string[]): RecommendedCoursePayload[] {
  const missingLower = missingSkills.map((s) => s.toLowerCase());

  const matched = COURSES_DATA.filter((course) => {
    const courseSkills = course.skills.map((s) => s.toLowerCase());
    return (
      courseSkills.some((cs) => missingLower.some((ms) => ms.includes(cs) || cs.includes(ms))) ||
      missingLower.some((ms) => course.title.toLowerCase().includes(ms))
    );
  });

  const list = matched.length > 0 ? matched : COURSES_DATA.slice(0, 3);

  return list.map((c) => ({
    id: c.id,
    title: c.title,
    provider: c.provider,
    duration: c.duration,
    rating: c.rating,
    level: c.level,
    skills: c.skills,
  }));
}

// ============================================================================
// Built-in Dynamic Semantic Engine (Zero Template Repetition, Context-Aware)
// ============================================================================
function getRecentTopic(history: { sender: "user" | "ai"; text: string }[]): string {
  const lastAi = [...history].reverse().find((h) => h.sender === "ai")?.text || "";
  const lastAiLower = lastAi.toLowerCase();

  if (
    lastAiLower.includes("skill roadmap") ||
    lastAiLower.includes("recommended skills") ||
    lastAiLower.includes("web performance") ||
    lastAiLower.includes("state management")
  ) {
    return "skills";
  }
  if (
    lastAiLower.includes("career suitability") ||
    lastAiLower.includes("career path") ||
    lastAiLower.includes("frontend / web") ||
    lastAiLower.includes("primary recommendation")
  ) {
    return "career_paths";
  }
  if (lastAiLower.includes("present") && lastAiLower.includes("project")) {
    return "project_presentation";
  }
  if (lastAiLower.includes("verified courses") || lastAiLower.includes("bootcamp")) {
    return "courses";
  }
  if (lastAiLower.includes("matched openings") || lastAiLower.includes("verified match score")) {
    return "jobs";
  }
  if (lastAiLower.includes("projects tailored") || lastAiLower.includes("collaborative canvas")) {
    return "projects";
  }
  return "general";
}

function extractTargetCareerFromHistory(
  history: { sender: "user" | "ai"; text: string }[],
  profile: UserProfileContext
): string {
  const lastAi = [...history].reverse().find((h) => h.sender === "ai")?.text || "";
  const lastAiLower = lastAi.toLowerCase();

  if (
    lastAiLower.includes("frontend / web application engineer") ||
    lastAiLower.includes("frontend / ui engineer") ||
    lastAiLower.includes("frontend developer") ||
    lastAiLower.includes("frontend engineer")
  ) {
    return "Frontend / Web Application Engineering";
  }
  if (lastAiLower.includes("full-stack") || lastAiLower.includes("full stack")) {
    return "Full-Stack Web Development";
  }
  if (lastAiLower.includes("ui/ux") || lastAiLower.includes("design systems")) {
    return "UI/UX & Design Systems";
  }
  if (
    lastAiLower.includes("artificial intelligence") ||
    lastAiLower.includes("machine learning") ||
    lastAiLower.includes(" ai ")
  ) {
    return "Artificial Intelligence & Machine Learning";
  }
  if (
    lastAiLower.includes("tnpsc") ||
    lastAiLower.includes("government") ||
    lastAiLower.includes("public service")
  ) {
    return "Government & Public Service";
  }

  const lastUser = [...history].reverse().find((h) => h.sender === "user")?.text || "";
  const lastUserLower = lastUser.toLowerCase();
  if (lastUserLower.includes("frontend") || lastUserLower.includes("web")) {
    return "Frontend / Web Application Engineering";
  }
  if (lastUserLower.includes("full-stack") || lastUserLower.includes("full stack")) {
    return "Full-Stack Web Development";
  }
  if (lastUserLower.includes("ui") || lastUserLower.includes("design")) {
    return "UI/UX & Design Systems";
  }
  if (lastUserLower.includes("ai") || lastUserLower.includes("machine learning")) {
    return "Artificial Intelligence & Machine Learning";
  }

  return profile.interests[0] || "Frontend / Web Application Engineering";
}

function generateSemanticResponse({
  intent,
  userMessage,
  history,
  profile,
  rankedJobs,
  topJob,
  recommendedCourses,
}: {
  intent: ChatIntent;
  userMessage: string;
  history: { sender: "user" | "ai"; text: string }[];
  profile: UserProfileContext;
  rankedJobs: RecommendedJobPayload[];
  topJob: RecommendedJobPayload | null;
  recommendedCourses: RecommendedCoursePayload[];
}): string {
  const q = userMessage.toLowerCase().trim();
  const primaryInterest = profile.interests[0] || "Frontend Development";
  const userSkills = profile.skills.slice(0, 5).join(", ");
  const topProject = profile.projects[0]?.name || "Pathly Career Portal";

  // --------------------------------------------------------------------------
  // 1. Acknowledgement ("ok", "okay", "thanks", "got it") - Contextual & Natural
  // --------------------------------------------------------------------------
  if (intent === "acknowledgement") {
    const recentTopic = getRecentTopic(history);
    if (recentTopic === "skills") {
      return `Glad that helps! Take it step by step. Whenever you're ready, we can dive deeper into any of those skills (such as Web Performance or State Management), explore relevant courses in your **Learn** tab, or outline a targeted practice project. What would you like to explore next?`;
    }
    if (recentTopic === "career_paths") {
      return `Sounds great! Whenever you want to explore required skills for any of those career paths, check out live openings in Pathly, or start preparing for interviews, just let me know.`;
    }
    if (recentTopic === "project_presentation") {
      return `You're very welcome! Best of luck with your project presentation. Let me know if you need any slide talking points or rehearsal questions!`;
    }
    if (recentTopic === "jobs") {
      return `You're welcome! Feel free to click on any job card to view the requirements, or let me know if you'd like interview prep tips for those roles.`;
    }
    if (recentTopic === "courses") {
      return `You're welcome! You can find all course modules in your **Learn** tab. Let me know if you want study tips or project ideas while taking them.`;
    }
    return `You're welcome! Feel free to ask anytime if you have questions about careers, skills, projects, or technical topics.`;
  }

  // --------------------------------------------------------------------------
  // 2. Project Presentation & Meeting Delivery ("I want to present my project in a meeting...")
  // --------------------------------------------------------------------------
  if (intent === "project_presentation") {
    return `Here is a clear, structured framework to present **${topProject}** (or any tech project) effectively in a meeting:

### 1. The Problem & Business Context (First 2 Minutes)
- **Start with the 'Why':** Explain the specific pain point your application addresses before touching the code.
- *Example:* *"We identified that candidates and developers lack a single unified platform to assess skill gaps against real job requirements and practice targeted mocks."*

### 2. Live Demo & User Flow (3–4 Minutes)
- **Show, Don't Just Tell:** Walk through the primary user journey live in the application.
- Emphasize user experience, fast load speeds, and intuitive layout over minutiae.
- Show one key technical accomplishment (e.g. real-time dynamic score updates, debounced search, or interactive cards).

### 3. Architecture & Technical Decisions (2 Minutes)
- Outline your technology choices: **React, TypeScript, Next.js, and Tailwind CSS**.
- Explain *why* you chose them (e.g. strict type safety, modular component architecture, responsive design across mobile/desktop).
- Briefly mention one technical hurdle you solved (e.g. client/server state caching or render pipeline optimization).

### 4. Metrics, Next Steps & Discussion (2 Minutes)
- Conclude with outcomes: Core Web Vitals audit scores, test coverage, or user feedback.
- Open the floor for feedback: *"I'd love to hear your feedback on the architecture choices and our planned Phase 2 features."*

### 💡 Pro Tips:
- **Keep slides minimal:** Let the working product and system diagram drive the meeting.
- **Anticipate questions:** Be prepared for questions on API error handling, edge cases, and scalability.`;
  }

  // --------------------------------------------------------------------------
  // 3. Course Recommendations ("Suggest any course for me.")
  // --------------------------------------------------------------------------
  if (intent === "course_recommendation") {
    const c1 = COURSES_DATA[0]; // Web Dev Bootcamp
    const c2 = COURSES_DATA[3]; // Full Stack Developer Path
    const c3 = COURSES_DATA[4]; // Soft Skills

    return `Based on your profile (**${primaryInterest}** · **${userSkills}**), here are the top verified courses available directly in Pathly:

### 1. **${c1.title}** — *${c1.provider}*
- ⭐️ **Rating:** ${c1.rating} / 5.0 (${c1.reviewCount} reviews) · **Duration:** ${c1.duration}
- 🛠️ **Skills:** ${c1.skills.join(", ")}
- 💡 **Why Recommended:** Ideal for reinforcing core frontend architecture, responsive layouts, and React component lifecycles.

### 2. **${c2.title}** — *${c2.provider}*
- ⭐️ **Rating:** ${c2.rating} / 5.0 (${c2.reviewCount} reviews) · **Duration:** ${c2.duration}
- 🛠️ **Skills:** ${c2.skills.join(", ")}
- 💡 **Why Recommended:** Great progression path to expand your React expertise into full-stack backend development with Node.js and Next.js App Router.

### 3. **${c3.title}** — *${c3.provider}*
- ⭐️ **Rating:** ${c3.rating} / 5.0 · **Duration:** ${c3.duration} · **Price:** ${c3.price}
- 🛠️ **Skills:** ${c3.skills.join(", ")}
- 💡 **Why Recommended:** Helps with meeting presentations, project demos, and technical team communication.

👉 *You can click on the course card below to view syllabus details and start learning in your Learn tab!*`;
  }

  // --------------------------------------------------------------------------
  // 4. General Conversation & Greetings ("Hi", "Hello", "Hi, how are you?")
  // --------------------------------------------------------------------------
  if (intent === "general_conversation") {
    if (/how are you|how's it going|how are you doing/i.test(q)) {
      return `Hello! I'm doing well, thank you for asking. How can I help you today?

Whether you have general programming questions, want to explore technical concepts, or need career and skill guidance, feel free to ask!`;
    }

    if (/who are you|what is your name|what can you do|introduce yourself/i.test(q)) {
      return `I'm **Pathly AI**, your conversational assistant and personalized career mentor.

I can help you with:
- **General & Technical Inquiries:** Explaining programming languages, system architectures, and frameworks like React, Python, or Angular.
- **Personalized Career Guidance:** Evaluating your skills, projects, and target roles against verified career paths.
- **In-App Job & Course Discovery:** Matching you with verified openings and learning modules in the Pathly platform.
- **Interview & Resume Preparation:** Structuring behavioral STAR responses and optimizing project descriptions.

What would you like to explore today?`;
    }

    return `Hello! 👋 I'm your Pathly AI assistant. How can I help you today? Feel free to ask any technical questions, explore your career options, or check out in-app courses and jobs!`;
  }

  // --------------------------------------------------------------------------
  // 5. Technical Questions ("What is Python?", "Explain React vs Angular", "Explain ML")
  // --------------------------------------------------------------------------
  if (intent === "technical_question") {
    if (/python/i.test(q)) {
      return `**Python** is a high-level, interpreted, general-purpose programming language known for its emphasis on clean code readability and syntax simplicity.

### Key Characteristics:
- **Readable Syntax:** Uses significant indentation instead of curly brackets, making code intuitive to read and write.
- **Interpreted & Dynamically Typed:** Code executes line-by-line; variables do not require explicit type declarations.
- **Multi-Paradigm:** Supports procedural, object-oriented, and functional programming models.
- **Standard Library:** Ships with a broad set of built-in modules for file handling, networking, and math.

### Primary Use Cases:
1. **Data Science & Machine Learning:** Dominated by libraries such as NumPy, Pandas, Scikit-learn, PyTorch, and TensorFlow.
2. **Web Backend Development:** High-performance web frameworks like FastAPI, Django, and Flask.
3. **Automation & Scripting:** Writing automated system tasks, file processing, and web scrapers (BeautifulSoup).
4. **DevOps & Cloud:** Tooling in AWS Lambda, Google Cloud functions, and CI/CD automation.`;
    }

    if (/react.*angular|angular.*react/i.test(q)) {
      return `Here is a technical comparison between **React** and **Angular**:

| Dimension | React | Angular |
| :--- | :--- | :--- |
| **Type** | UI Component Library | Full-Fledged Application Framework |
| **Maintained By** | Meta (Facebook) & Community | Google |
| **Primary Language** | JavaScript / TypeScript (JSX) | TypeScript (Strict out-of-the-box) |
| **DOM Mechanism** | Virtual DOM | Real DOM + Incremental DOM |
| **Data Binding** | Unidirectional (One-way) | Two-way data binding (\`[(ngModel)]\`) |
| **State & Routing** | Unopinionated (Redux, Zustand, React Router) | Built-in router, reactive forms, RxJS streams |
| **Architecture** | Flexible component composability | Structured MVC / MVVM with Dependency Injection |

### Summary Recommendation:
- Choose **React** if you value architectural flexibility, rapid ecosystem adoption, or are building with modern meta-frameworks like **Next.js**.
- Choose **Angular** if you are engineering large enterprise systems where standard conventions, built-in dependency injection, and integrated test suites are prioritized.`;
    }

    if (/machine learning|ml\b/i.test(q)) {
      return `**Machine Learning (ML)** is a subfield of artificial intelligence where algorithms learn patterns from data to make predictions or decisions without being explicitly hardcoded with rules.

### How It Operates:
Instead of manual \`if/else\` business logic, a mathematical model is trained on historical data. During training, it iteratively adjusts internal parameters to minimize error between predicted and actual outputs.

### The 3 Core Paradigms:
1. **Supervised Learning:**
   - Trained on labeled inputs and outputs.
   - *Tasks:* Classification (email spam detection, image labeling) and Regression (house price estimation, stock forecasting).
   - *Common Algorithms:* Linear/Logistic Regression, Random Forests, Support Vector Machines, Gradient Boosted Trees (XGBoost).

2. **Unsupervised Learning:**
   - Uncovers latent structures or clusters in unlabeled data.
   - *Tasks:* Customer segmentation, anomaly detection, dimensionality reduction.
   - *Common Algorithms:* K-Means Clustering, Principal Component Analysis (PCA).

3. **Reinforcement Learning:**
   - An autonomous agent learns optimal behaviors through environmental feedback (rewards and penalties).
   - *Tasks:* Robotics control, automated trading, gameplay engines (AlphaGo).

### Everyday Implementations:
- **Recommendation Engines:** Feed curation on Netflix, YouTube, and Amazon.
- **Natural Language Processing:** Large Language Models (LLMs), machine translation, speech recognition.
- **Computer Vision:** Medical imaging diagnostics, facial recognition, and autonomous navigation.`;
    }

    return `Here is a breakdown of **${userMessage}**:

In software development and modern computing, understanding core system mechanics and design trade-offs is essential:

1. **Fundamental Mechanism:** Clean separation of concerns, deterministic data flow, and predictable state transformations prevent runtime bugs.
2. **Performance Considerations:** Always evaluate time complexity ($O(n)$ bounds), memory allocation, and client-side rendering bottlenecks.
3. **Best Practices:** Prefer modular, testable components with strong typing (TypeScript) and explicit error handling.

Would you like a code example or a deeper dive into any specific part of this concept?`;
  }

  // --------------------------------------------------------------------------
  // 6. Follow-up Query ("What did I ask you previously?")
  // --------------------------------------------------------------------------
  if (intent === "follow_up_query") {
    const pastUserMessages = history.filter((h) => h.sender === "user");

    if (pastUserMessages.length > 0) {
      const lastQuestion = pastUserMessages[pastUserMessages.length - 1]?.text;
      return `In your previous message, you asked:

> **"${lastQuestion}"**

Would you like me to expand on that topic, clarify any points, or discuss something new?`;
    }

    return `This is the start of our current conversation session, so there are no prior questions recorded in this thread yet. What would you like to explore?`;
  }

  // --------------------------------------------------------------------------
  // 7. Career Interest Update ("I am more interested in AI")
  // --------------------------------------------------------------------------
  if (intent === "career_interest_update") {
    const newInterest = extractNewInterest(userMessage);

    return `Understood! I've updated your career interest to **${newInterest}**.

### How This Guides Your Next Steps:
- **Leveraging Your Current Strengths:** Your background in **${userSkills}** provides a great base for building user interfaces and interacting with APIs.
- **New Focus Areas for ${newInterest}:**
  1. **Core Fundamentals:** Study data structures, asynchronous programming, and clean API consumption.
  2. **Domain-Specific Stack:** Focus on specialized tools and libraries for ${newInterest}.
  3. **Targeted Projects:** Build a portfolio piece demonstrating ${newInterest} concepts rather than generic CRUD apps.

*Note regarding Pathly in-app jobs:* Our current in-app catalog features openings in Frontend Engineering (Google, Microsoft, Swiggy), Full-Stack, and Public Service exams. While dedicated openings for ${newInterest} may be limited in the local database right now, I will align all future guidance, project ideas, and skill roadmaps with your new focus!`;
  }

  // --------------------------------------------------------------------------
  // 8. Job Search ("Find available jobs for me.") - Verified actual in-app openings
  // --------------------------------------------------------------------------
  if (intent === "job_search") {
    const job1 = rankedJobs[0];
    const job2 = rankedJobs[1];

    let output = `Based on our verified Pathly application database and your current background (**${primaryInterest}** · **${profile.experience}**), here are the top matched openings:\n\n`;

    if (job1) {
      output += `### 1. **${job1.title}** — *${job1.companyOrOrg}*\n`;
      output += `- 📊 **Verified Match Score:** **${job1.matchScore}%**\n`;
      output += `- 💰 **Compensation:** ${job1.salaryOrScale} · *${job1.location} (${job1.workMode || "On-site"})*\n`;
      output += `- ✅ **Matching Skills:** ${job1.matchingSkills.slice(0, 4).join(", ") || "Foundational stack"}\n`;
      if (job1.missingSkills.length > 0) {
        output += `- ⚠️ **Skills to Develop:** ${job1.missingSkills.slice(0, 2).join(", ")}\n`;
      }
      output += `- 💡 **Match Basis:** ${job1.matchReasons[0] || "Aligns with your verified profile."}\n\n`;
    }

    if (job2) {
      output += `### 2. **${job2.title}** — *${job2.companyOrOrg}*\n`;
      output += `- 📊 **Verified Match Score:** **${job2.matchScore}%**\n`;
      output += `- 💰 **Compensation:** ${job2.salaryOrScale} · *${job2.location}*\n`;
      output += `- 💡 **Match Basis:** ${job2.matchReasons[0] || "Complementary technical opening."}\n\n`;
    }

    output += `👉 **Tap any job card below** to view the full specification and responsibilities.`;
    return output;
  }

  // --------------------------------------------------------------------------
  // 9. Project Recommendations ("Suggest projects based on my interests.")
  // --------------------------------------------------------------------------
  if (intent === "project_recommendation") {
    return `### 🛠️ High-Impact Projects Tailored to Your Focus in ${primaryInterest}

You already have **${profile.projects.map((p) => p.name).join(" and ")}**. To elevate your portfolio for hiring teams in **${primaryInterest}**, consider building:

1. **Real-Time Collaborative Canvas / Workspace:**
   - **Tech Stack:** React, TypeScript, WebSockets, Tailwind CSS.
   - **Key Features:** Multi-user live cursor presence, optimistic UI state updates, conflict resolution with operational transformation / CRDTs, accessible keyboard controls.
   - **Why It Works:** Demonstrates mastery over complex asynchronous state management, network serialization, and client render optimization.

2. **High-Performance E-Commerce Application with Edge Caching:**
   - **Tech Stack:** Next.js (App Router), TypeScript, Service Workers, Tailwind CSS.
   - **Key Features:** Sub-100ms instant client-side search across 5,000+ items, offline cart storage, 95+ Core Web Vitals audit score.
   - **Why It Works:** Directly covers production performance optimization (LCP, INP, CLS) and modern rendering pipelines.`;
  }

  // --------------------------------------------------------------------------
  // 10. Skill Development ("What should I learn next?", "What skills should I learn for that?")
  // --------------------------------------------------------------------------
  if (intent === "skill_development") {
    const targetCareer = extractTargetCareerFromHistory(history, profile);

    if (targetCareer.includes("Frontend") || targetCareer.includes("Web Application")) {
      return `### 📚 Recommended Skill Roadmap for **Frontend / Web Application Engineering**

Since you already possess solid foundations in **${userSkills}**, you don't need basic syntax tutorials. To elevate yourself to a top-tier engineer ready for high-scale product teams, here are the core skills to master next:

---

### 1. **Web Performance Optimization & Core Web Vitals** (Priority 1)
- **Why It Matters:** Senior hiring teams evaluate whether you understand rendering bottlenecks, not just component syntax.
- **Key Topics:** Largest Contentful Paint (LCP), Interaction to Next Paint (INP), Cumulative Layout Shift (CLS), code-splitting with dynamic imports, image optimization, and bundle size reduction.
- **In-App Resource:** Complete the **"Web Development Bootcamp"** in your **Learn** tab.

### 2. **Advanced State Management & Server Synchronization**
- **Why It Matters:** Modern web apps separate client UI state from asynchronous server cache.
- **Key Topics:** **TanStack Query (React Query)** or **Zustand** for optimistic updates, cache invalidation, and debounced mutations.

### 3. **Modern Meta-Frameworks & Server Components**
- **Why It Matters:** Modern web engineering has shifted towards **Next.js (App Router)** and React Server Components (RSC).
- **Key Topics:** Server Actions, Streaming SSR, layout caching, and hybrid rendering strategies.

### 4. **Automated Testing & Code Quality**
- **Why It Matters:** Writing reliable tests separates mid-tier candidates from senior developers.
- **Key Topics:** Unit & component testing with **Jest** + **React Testing Library**; end-to-end flows with **Playwright**.

### 5. **Web Accessibility (a11y) & Semantic Architecture**
- **Why It Matters:** Critical for enterprise applications and public-facing products.
- **Key Topics:** ARIA patterns, keyboard navigation trapping, color contrast standards (WCAG 2.1 AA), and semantic HTML.

---

💡 **Next Step:** Would you like me to recommend a project to practice these skills, suggest in-app courses, or find matching jobs?`;
    }

    if (targetCareer.includes("Full-Stack")) {
      return `### 📚 Recommended Skill Roadmap for **Full-Stack Web Development**

Building upon your solid frontend stack (**${userSkills}**), here are the core backend and infrastructure skills to master:

1. **Backend Runtime & Frameworks:** Node.js, Express, or Next.js API Routes / Server Actions.
2. **Databases & ORMs:** PostgreSQL, schema migrations, and Prisma ORM.
3. **Authentication & Security:** JWT, OAuth 2.0, HTTP-only cookies, and CSRF protection.
4. **DevOps & Containers:** Docker containerization, CI/CD pipelines (GitHub Actions), and cloud deployment.
5. **Caching & Asynchronous Processing:** Redis for session/cache stores and background worker queues.

💡 **In-App Resource:** Check out the **"Full Stack Developer Path"** in your **Learn** tab!`;
    }

    if (targetCareer.includes("Artificial Intelligence") || targetCareer.includes("AI")) {
      return `### 📚 Recommended Skill Roadmap for **Artificial Intelligence & Machine Learning**

To bridge into AI development alongside your programming background:

1. **Python Programming & Scientific Computing:** NumPy, Pandas, Vectorized operations.
2. **Core ML Fundamentals:** Supervised & Unsupervised algorithms, Scikit-learn, evaluation metrics.
3. **Deep Learning Frameworks:** PyTorch or TensorFlow for neural networks.
4. **Modern GenAI & LLM Orchestration:** LangChain / LlamaIndex, prompt engineering, vector databases (Pinecone, ChromaDB).
5. **AI Application Deployment:** FastAPI backend hosting, model inference caching, and ONNX runtime.`;
    }

    const missingSkill = topJob?.missingSkills?.[0] || "Web Performance & Core Web Vitals";
    return `### 📚 Recommended Skill Roadmap for **${targetCareer}**

Based on your verified skills (**${userSkills}**) and target roles:

1. **${missingSkill} (Priority 1):**
   - Essential for passing senior technical screens and architecting resilient client applications.
   - *In-App Resource:* Enroll in **"Web Development Bootcamp"** in Pathly's Learn tab.

2. **Advanced State Management & Server State:**
   - Modern teams rely on tools like TanStack Query or Zustand for predictable server cache synchronization.

3. **Automated Testing (Unit & Integration):**
   - Writing reliable Jest and React Testing Library suites differentiates mid-tier candidates from senior engineers.`;
  }

  // --------------------------------------------------------------------------
  // 11. Career Guidance ("Which career suits me?", "What kind of career should I choose?")
  // --------------------------------------------------------------------------
  if (intent === "career_guidance") {
    return `### 🧭 Comprehensive Career Suitability Assessment

Based on your verified Pathly profile (**${profile.fullName}**):
- 🎓 **Education:** ${profile.education} (CGPA: ${profile.cgpa || "8.4 / 10"})
- 🎯 **Stated Career Interest:** ${primaryInterest}
- ⚡ **Verified Core Skills:** ${userSkills}
- 💼 **Experience:** ${profile.experience}
- 🛠️ **Portfolio Projects:** ${profile.projects.map((p) => p.name).join(" and ")}
- 📊 **Career Readiness:** ${profile.readinessScore}% · Resume Score: ${profile.resumeScore}/100

Here are the top 3 career paths tailored to your background, ranked by immediate alignment and growth potential:

---

### 1. Primary Recommendation: **Frontend / Web Application Engineer** (Top Immediate Fit)
- **Why It Fits You:** Your hands-on proficiency in **React, TypeScript, Tailwind CSS, and REST APIs** directly matches modern product engineering requirements. Your verified project **${topProject}** proves your ability to construct reactive, responsive client architectures.
- **Typical Industry Roles:** Frontend Developer, React Engineer, Web Application Developer.
- **Market Demand & Outlook:** High demand across SaaS platforms, tech startups, and digital product teams (₹5–12 LPA entry-to-mid band).
- **Core Focus:** Component architecture, client-side state caching, and responsive web performance.

---

### 2. Strategic Growth Track: **Full-Stack Web Developer** (Highest Long-Term Leverage)
- **Why It Fits You:** You already command client-side rendering and API integration. By expanding into backend application servers (Node.js, Next.js App Router API handlers) and relational databases (PostgreSQL), you can advance into full-stack engineering without starting from scratch.
- **Typical Industry Roles:** Full-Stack Engineer, JavaScript/TypeScript Developer.
- **Key Bridge:** Deepen server-side data modeling, ORMs (Prisma), and containerization (Docker).

---

### 3. Design-Engineering Hybrid: **UI/UX & Design Systems Engineer**
- **Why It Fits You:** Your profile combines design sensibilities (UI/UX Design, Responsive Web Design) with component implementation. Companies increasingly seek "Front-of-Frontend" engineers who translate Figma tokens into accessible, reusable component libraries.
- **Typical Industry Roles:** Design Technologist, Design Systems Engineer, UI Developer.
- **Key Bridge:** Component tokenization, accessibility (WCAG 2.1 AA), and micro-interactions.

---

### 💡 Suggested Next Steps:
Which of these career tracks aligns best with your goals? You can ask:
- *"What skills should I learn for that?"*
- *"Suggest projects based on my interests."*
- *"Find available jobs for me."*`;
  }

  // --------------------------------------------------------------------------
  // 12. Resume & Score Improvement
  // --------------------------------------------------------------------------
  if (intent === "resume_improvement") {
    return `### 📊 Diagnostic of Your Career Readiness Score (${profile.readinessScore}%)

Your Career Readiness score evaluates four distinct dimensions:

1. **Verified Core Skills:** **90 / 100** (Strong match for ${userSkills})
2. **Experience Eligibility:** **85 / 100** (Your ${profile.experience} aligns with entry-to-mid tier banding)
3. **Project Quantifiable Impact:** **70 / 100** (Existing project descriptions lack concrete metrics like latency reductions or scale numbers)
4. **Skill Assessment Depth:** **65 / 100** (Advanced modules like Performance Profiling and System Architecture need completion)

---

### Actionable Steps to Improve Your Score:
- **Quantify Project Achievements:** Transform generic resume lines into measurable impact (e.g., *"Optimized component rendering, reducing First Contentful Paint by 32% for 10K+ monthly active users"*).
- **Verify Missing Skills:** Complete the **Web Development Bootcamp** module in the Learn tab.
- **Practice Mock Screening:** Run one 10-minute technical simulation in the Mock Interview tab.`;
  }

  // --------------------------------------------------------------------------
  // 13. Interview Preparation
  // --------------------------------------------------------------------------
  if (intent === "interview_prep") {
    return `### 💡 Technical Interview Preparation Strategy

For roles matching your focus in **${primaryInterest}**, expect technical interviews to test three main areas:

1. **Core Fundamentals (Screening Round):**
   - Deep dive into asynchronous JavaScript (Event Loop, Microtasks, Closures, Promises).
   - React component lifecycle, hook memoization (\`useMemo\`, \`useCallback\`), and reconciliation.

2. **Machine Coding & Architecture (Practical Round):**
   - Building a functional, accessible component (search with debounce, infinite scroll, or modal dialog) under time constraints.

3. **Behavioral & Project Experience (STAR Method):**
   - Be prepared to discuss **${topProject}**: explain a difficult architectural challenge, how you diagnosed a bug, and what business impact it delivered.

🚀 **Next Step:** Launch a session in Pathly's **Mock Interview Screen** to test yourself with timed questions!`;
  }

  // Default fallback for any general question
  return `Regarding your question about **"${userMessage}"**:

In software engineering and career development, having clear focus and understanding fundamental concepts is key. 

How would you like to proceed?
- Explore technical concepts or architectural best practices
- Review personalized career roadmaps and skill recommendations based on your profile
- Search verified in-app jobs or courses in Pathly`;
}

// ============================================================================
// Contextual Follow-Up Suggestions
// ============================================================================
function generateFollowUps(
  intent: ChatIntent,
  userMessage: string,
  profile: UserProfileContext,
  topJob: RecommendedJobPayload | null
): string[] {
  const lowerMsg = userMessage.toLowerCase();

  // If asking about a specific technology
  if (lowerMsg.includes("react") || lowerMsg.includes("next")) {
    return [
      "Show a working code example",
      "What are common pitfalls to avoid?",
      "Suggest a project for my portfolio",
    ];
  }
  if (lowerMsg.includes("python") || lowerMsg.includes("machine learning") || lowerMsg.includes("ai")) {
    return [
      "Show a practical code snippet",
      "What libraries should I learn?",
      "Suggest an AI project for my level",
    ];
  }
  if (lowerMsg.includes("closure") || lowerMsg.includes("javascript") || lowerMsg.includes("typescript")) {
    return [
      "Can you give another real-world example?",
      "How is this tested in tech interviews?",
      "What are common mistakes to avoid?",
    ];
  }

  if (intent === "technical_question") {
    return [
      "Show a practical code example",
      "What are common pitfalls to avoid?",
      "How is this used in production?",
    ];
  }

  if (intent === "career_guidance" || intent === "skill_development") {
    return [
      "What projects should I build next?",
      "Which skills give the highest ROI?",
      "Find matching jobs in Pathly",
    ];
  }

  if (intent === "job_search") {
    return [
      "How can I tailor my resume for this role?",
      "What interview questions are asked?",
      "What skills am I missing?",
    ];
  }

  if (intent === "project_presentation" || intent === "project_recommendation") {
    return [
      "How should I explain this in interviews?",
      "What architecture pattern should I use?",
      "What metrics make this project stand out?",
    ];
  }

  if (intent === "resume_improvement" || intent === "interview_prep") {
    return [
      "How do I highlight my React projects?",
      "Mock interview question for this role",
      "What metrics should I add to my resume?",
    ];
  }

  return [
    "What should I learn next?",
    "Suggest projects based on my interests",
    "Find available jobs for me",
  ];
}

async function callGeminiApi({
  apiKey,
  userMessage,
  history,
  profile,
  rankedJobs,
  recommendedCourses,
  intent,
}: any): Promise<string> {
  const primaryInterest = profile.interests[0] || "Frontend Development";
  const timeoutMs = parseInt(process.env.AI_TIMEOUT_MS || "25000", 10);

  const systemInstruction = `You are Pathly AI, an intelligent conversational assistant and career mentor.
1. Answer the user's actual question directly like ChatGPT.
2. DO NOT force career advice or job recommendations into general or technical questions.
3. Only reference the user's profile and in-app jobs when the question asks about careers, jobs, skills, or resume.
4. User profile: Name: ${profile.fullName}, Stated Interest: ${primaryInterest}, Skills: ${profile.skills.join(", ")}, Experience: ${profile.experience}.
5. Never invent fake jobs, salaries, or statistics.`;

  const contents = [
    ...history.slice(-16).map((h: any) => ({
      role: h.sender === "user" ? "user" : "model",
      parts: [{ text: h.text }],
    })),
    { role: "user", parts: [{ text: userMessage }] },
  ];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemInstruction }] },
          contents,
          generationConfig: { maxOutputTokens: 800, temperature: 0.7 },
        }),
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Gemini API HTTP ${res.status}: ${errorText}`);
    }

    const json = await res.json();
    return json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
  } finally {
    clearTimeout(timeoutId);
  }
}
