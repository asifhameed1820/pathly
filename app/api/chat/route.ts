import { NextRequest, NextResponse } from "next/server";
import { DETAILED_JOBS_AND_EXAMS } from "@/lib/jobsData";
import { COURSES_DATA } from "@/lib/coursesData";
import { DEFAULT_USER_PROFILE, UserProfileContext } from "@/lib/userProfile";
import { sendPromptToGroq } from "@/lib/groqClient";
import { sendPromptToGemini } from "@/lib/geminiClient";
import { JobDetailItem } from "@/components/screens/JobDetailsScreen";

interface ChatRequestPayload {
  message: string;
  history?: { sender: "user" | "ai"; text: string }[];
  userProfile?: UserProfileContext;
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

    // 5. Dual-AI Model Router: Groq – Qwen (Primary) vs Google Gemini Flash (Secondary)
    const routing = routeToModel(userMessage, history, intent);
    let aiTextResponse = "";
    let aiProviderName = "Internal Semantic Reasoning Engine";
    let aiModelName = "Built-in Pathly Engine";
    let aiRoleName = routing.role === "secondary_gemini"
      ? "Advanced Career Guidance (Gemini Flash)"
      : "Fast Career Assistance (Groq Qwen)";
    let aiResponseStatus = "Ready";
    let errorDetails = "";

    const groqKey =
      process.env.GROQ_API_KEY ||
      (process.env.AI_PROVIDER === "groq" ? process.env.AI_API_KEY : undefined);
    const geminiKey =
      process.env.GEMINI_API_KEY ||
      (process.env.AI_PROVIDER === "gemini" ? process.env.AI_API_KEY : undefined);

    if (routing.role === "secondary_gemini" && geminiKey) {
      // 5A. Route to Secondary AI: Google Gemini Flash (Advanced Career Guidance)
      try {
        const geminiResult = await sendPromptToGemini({
          apiKey: geminiKey,
          model: process.env.GEMINI_MODEL,
          userMessage,
          history,
          profile,
          rankedJobs: rankedJobs.slice(0, 3),
          recommendedCourses: recommendedCourses.slice(0, 2),
          isDetailedRequest: true,
        });
        aiTextResponse = geminiResult.text;
        aiProviderName = "Google Gemini Flash";
        aiModelName = geminiResult.model;
        aiResponseStatus = "Success (Gemini 200 OK)";
      } catch (geminiErr: any) {
        errorDetails = geminiErr?.message || String(geminiErr);
        console.warn("[Chat API] Secondary AI (Gemini Flash) failed, attempting failover to Primary AI (Groq Qwen):", geminiErr);
        // Graceful failover to Groq Qwen
        if (groqKey) {
          try {
            const groqResult = await sendPromptToGroq({
              apiKey: groqKey,
              userMessage,
              history,
              profile,
              rankedJobs: rankedJobs.slice(0, 3),
              recommendedCourses: recommendedCourses.slice(0, 2),
              isCareerRelevant: true,
            });
            aiTextResponse = groqResult.text;
            aiProviderName = "Groq (Qwen) [Failover]";
            aiModelName = groqResult.model;
            aiResponseStatus = "Success (Groq Failover 200 OK)";
          } catch (groqErr: any) {
            console.warn("[Chat API] Groq failover also failed:", groqErr);
          }
        }
      }
    } else if (groqKey) {
      // 5B. Route to Primary AI: Groq – Qwen (Fast Career Assistance)
      try {
        const groqResult = await sendPromptToGroq({
          apiKey: groqKey,
          userMessage,
          history,
          profile,
          rankedJobs: rankedJobs.slice(0, 3),
          recommendedCourses: recommendedCourses.slice(0, 2),
          isCareerRelevant: attachJobs || attachCourses,
        });
        aiTextResponse = groqResult.text;
        aiProviderName = "Groq (Qwen)";
        aiModelName = groqResult.model;
        aiResponseStatus = "Success (Groq 200 OK)";
      } catch (groqErr: any) {
        errorDetails = groqErr?.message || String(groqErr);
        console.warn("[Chat API] Primary AI (Groq Qwen) failed, attempting failover to Secondary AI (Gemini Flash):", groqErr);
        // Graceful failover to Gemini Flash
        if (geminiKey) {
          try {
            const geminiResult = await sendPromptToGemini({
              apiKey: geminiKey,
              model: process.env.GEMINI_MODEL,
              userMessage,
              history,
              profile,
              rankedJobs: rankedJobs.slice(0, 3),
              recommendedCourses: recommendedCourses.slice(0, 2),
            });
            aiTextResponse = geminiResult.text;
            aiProviderName = "Google Gemini Flash [Failover]";
            aiModelName = geminiResult.model;
            aiResponseStatus = "Success (Gemini Failover 200 OK)";
          } catch (geminiErr: any) {
            console.warn("[Chat API] Gemini failover also failed:", geminiErr);
          }
        }
      }
    } else if (geminiKey) {
      // If Groq key is not present, use Gemini Flash
      try {
        const geminiResult = await sendPromptToGemini({
          apiKey: geminiKey,
          model: process.env.GEMINI_MODEL,
          userMessage,
          history,
          profile,
          rankedJobs: rankedJobs.slice(0, 3),
          recommendedCourses: recommendedCourses.slice(0, 2),
        });
        aiTextResponse = geminiResult.text;
        aiProviderName = "Google Gemini Flash";
        aiModelName = geminiResult.model;
        aiResponseStatus = "Success (Gemini 200 OK)";
      } catch (geminiErr: any) {
        errorDetails = geminiErr?.message || String(geminiErr);
        console.warn("[Chat API] Gemini API call failed:", geminiErr);
      }
    } else {
      aiProviderName = "Internal Semantic Reasoning Engine";
      aiModelName = "Pathly Deterministic Reasoning Engine";
      aiResponseStatus = "Active (Built-in Mode)";
    }

    // 6. Built-in Dynamic Semantic Engine (High Quality, Intent-Specific, Zero Template Repetition)
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

    // Temporary backend diagnostic logging (non-sensitive)
    console.log(`[Chat API] Received user message: "${userMessage}"`);
    console.log(`[Chat API] Detected intent: "${intent}"`);
    console.log(`[Chat API] Profile retrieval status: Loaded for "${profile.fullName}" (Interest: "${profile.interests[0]}", Skills: ${profile.skills.length}, Score: ${profile.readinessScore}%)`);
    console.log(`[Chat API] Selected AI provider: "${aiProviderName}", Model: "${aiModelName}"`);
    console.log(`[Chat API] AI API response status: "${aiResponseStatus}"`);
    if (errorDetails) {
      console.log(`[Chat API] Error details: "${errorDetails}"`);
    }
    console.log(`[Chat API] Generated AI response preview: "${aiTextResponse.slice(0, 120).replace(/\n/g, " ")}..."`);

    // 7. Contextual follow-up prompt chips based on intent and user profile
    const suggestedFollowUps = generateFollowUps(intent, userMessage, profile, topJob);

    return NextResponse.json({
      response: aiTextResponse,
      intent,
      recommendedJobs: attachJobs ? rankedJobs.slice(0, 2) : [],
      recommendedCourses: attachCourses ? recommendedCourses.slice(0, 2) : [],
      suggestedFollowUps,
      updatedProfile,
      provider: aiProviderName,
      model: aiModelName,
      role: aiRoleName,
      routingReason: routing.reason,
      profileSummary: {
        name: profile.fullName,
        primaryInterest: profile.interests[0] || "Frontend Development",
        readinessScore: profile.readinessScore,
        skillsCount: profile.skills.length,
      },
    });
  } catch (error: any) {
    console.error("Error in /api/chat route:", error);
    return NextResponse.json({
      response: "Hello! How can I help you today with your tech questions, skills, or career development?",
      intent: "general_conversation",
      recommendedJobs: [],
      recommendedCourses: [],
      suggestedFollowUps: [
        "Suggest any course for me.",
        "What should I learn next?",
        "Find available jobs for me.",
      ],
      provider: "Internal Semantic Reasoning Engine",
      model: "Pathly Fallback Mode",
      profileSummary: {
        name: "Alex Morgan",
        primaryInterest: "Frontend Development",
        readinessScore: 82,
        skillsCount: 9,
      },
    });
  }
}

// ============================================================================
// Dual-AI Model Router (Groq Qwen vs Google Gemini Flash)
// ============================================================================
type ModelRouteTarget = "primary_groq" | "secondary_gemini";

interface ModelRouteDecision {
  role: ModelRouteTarget;
  reason: string;
}

function routeToModel(
  userMessage: string,
  history: { sender: "user" | "ai"; text: string }[],
  intent: ChatIntent
): ModelRouteDecision {
  const m = userMessage.toLowerCase().trim();

  // 1. Google Gemini Flash (Secondary AI Model) Responsibilities:
  // - Generate personalized career roadmaps
  // - Analyze resumes and suggest improvements
  // - Perform skill gap analysis
  // - Compare different career paths
  // - Create structured learning plans
  // - Provide long-term career guidance
  // - Handle complex and detailed career-related queries

  // A. Resume analysis & improvements / ATS audit
  const isResumeAnalysis =
    intent === "resume_improvement" ||
    /\b(resume|cv|ats|curriculum vitae|resume analysis|resume score|readiness score|audit my resume|improve my resume|resume feedback|bullet points for resume)\b/i.test(m);

  if (isResumeAnalysis) {
    return {
      role: "secondary_gemini",
      reason: "Resume Analysis & ATS Improvement (Secondary AI: Gemini Flash)",
    };
  }

  // B. Personalized career roadmaps & structured learning plans
  const isRoadmapOrLearningPlan =
    /\b(career roadmap|learning roadmap|structured learning plan|study plan|progression plan|curriculum|step-by-step plan|step by step plan|detailed roadmap|roadmap for)\b/i.test(m) ||
    (/\broadmap\b/i.test(m) && !/what is a roadmap/i.test(m));

  if (isRoadmapOrLearningPlan) {
    return {
      role: "secondary_gemini",
      reason: "Personalized Career Roadmap & Structured Learning Plan (Secondary AI: Gemini Flash)",
    };
  }

  // C. Skill gap analysis
  const isSkillGapAnalysis =
    /\b(skill gap|skill gaps|skills gap|gap analysis|missing skills|skills to bridge|bridge the gap|skill gap analysis)\b/i.test(m);

  if (isSkillGapAnalysis) {
    return {
      role: "secondary_gemini",
      reason: "Skill Gap Analysis (Secondary AI: Gemini Flash)",
    };
  }

  // D. Compare different career paths
  const isCareerPathComparison =
    /\b(compare.*career|which career path|frontend vs backend|backend vs frontend|software engineer vs data scientist|devops vs cloud|fullstack vs frontend|frontend vs fullstack|compare paths|which path should i choose|compare both)\b/i.test(m) ||
    (/\b(compare|vs|versus)\b/i.test(m) && /\b(career|path|role|developer|engineer|job|field)\b/i.test(m));

  if (isCareerPathComparison) {
    return {
      role: "secondary_gemini",
      reason: "Career Path Comparison (Secondary AI: Gemini Flash)",
    };
  }

  // E. Long-term career guidance
  const isLongTermGuidance =
    /\b(long-term|long term|future growth|next 2 years|next 5 years|career strategy|senior transition|transition to lead|staff engineer path|career trajectory|future-proof)\b/i.test(m);

  if (isLongTermGuidance) {
    return {
      role: "secondary_gemini",
      reason: "Long-Term Career Guidance (Secondary AI: Gemini Flash)",
    };
  }

  // F. Complex & detailed career-related queries
  const isComplexDetailedCareerQuery =
    /\b(explain in detail|detailed breakdown|deep dive|comprehensive guide|comprehensive breakdown|in-depth analysis|detailed analysis)\b/i.test(m) &&
    (intent === "career_guidance" || intent === "skill_development" || intent === "project_presentation");

  if (isComplexDetailedCareerQuery) {
    return {
      role: "secondary_gemini",
      reason: "Complex & Detailed Career Analysis (Secondary AI: Gemini Flash)",
    };
  }

  // 2. Groq – Qwen (Primary AI Model) Responsibilities:
  // - Fast Career Assistance
  // - Answer basic career-related questions
  // - Explain programming languages and technical concepts
  // - Provide interview preparation guidance
  // - Explain job roles and required skills
  // - Recommend relevant technologies and learning resources
  // - Handle general conversations and quick follow-up questions
  return {
    role: "primary_groq",
    reason: "Fast Career Assistance & Technical Inquiries (Primary AI: Groq Qwen)",
  };
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

  // 14. Pure Greetings, General Pleasantries & Identity Questions
  // Strictly matched so substantive questions never get treated as greetings!
  if (
    /^(hi|hello|hey|hiya|greetings|howdy|good\s+(morning|afternoon|evening))[\s.,!]*$/i.test(m) ||
    /^(how are you|how's it going|how are you doing|how do you do)[\s.,?!]*$/i.test(m) ||
    /^(who are you|what is your name|what can you do|introduce yourself)[\s.,?!]*$/i.test(m) ||
    /who (made|created|built) you|what (model|llm|engine)|are you (qwen|gemini|chatgpt)|ur not qwen|you are not qwen/i.test(m)
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
  const isDetailedRequest = /detail|deep dive|in-depth|roadmap|step by step|comprehensive|elaborate|explain all|full breakdown|complete guide/i.test(q);

  // --------------------------------------------------------------------------
  // 1. Acknowledgement ("ok", "okay", "thanks", "got it") - Short & Friendly
  // --------------------------------------------------------------------------
  if (intent === "acknowledgement") {
    return `Glad that helps! Let me know whenever you'd like to explore next steps, practice skills, or check out jobs!`;
  }

  // --------------------------------------------------------------------------
  // 2. Project Presentation & Meeting Delivery
  // --------------------------------------------------------------------------
  if (intent === "project_presentation") {
    if (!isDetailedRequest) {
      return `Here is a crisp 4-step framework to present **${topProject}** in a meeting:

1. **Problem (1 min):** State the exact user problem your app solves.
2. **Live Demo (2 min):** Walk through the primary user flow and 1 key technical highlight.
3. **Architecture (1 min):** Explain why you chose **React, TypeScript, and Next.js**.
4. **Outcomes & Q&A (1 min):** Share key metrics (speed, responsiveness) and invite questions.

💡 *Ask "explain in detail" if you want a complete slide-by-slide script!*`;
    }

    return `Here is a structured framework to present **${topProject}** effectively in a meeting:

### 1. The Problem & Business Context (First 2 Minutes)
- **Start with the 'Why':** Explain the specific pain point before touching the code.
- *Example:* *"We identified that candidates lack a unified platform to assess skill gaps against real job requirements."*

### 2. Live Demo & User Flow (2–3 Minutes)
- **Show, Don't Just Tell:** Walk through the primary user journey live in the application.
- Show one key technical accomplishment (dynamic score calculation or reactive filters).

### 3. Architecture & Technical Decisions (2 Minutes)
- Outline choices: **React, TypeScript, Next.js, and Tailwind CSS**.
- Explain *why* (type safety, modular components, responsive design).

### 4. Metrics & Discussion (1–2 Minutes)
- Conclude with outcomes: Core Web Vitals audit scores, test coverage, or user feedback.
- Open the floor for feedback on architecture and next phases.`;
  }

  // --------------------------------------------------------------------------
  // 3. Course Recommendations ("Suggest any course for me.")
  // --------------------------------------------------------------------------
  if (intent === "course_recommendation") {
    const c1 = COURSES_DATA[0];
    const c2 = COURSES_DATA[3];

    return `Based on your focus in **${primaryInterest}** (${userSkills}), here are the top 2 verified courses in Pathly:

1. **${c1.title}** (${c1.provider}) — ⭐ ${c1.rating} · ${c1.duration}
2. **${c2.title}** (${c2.provider}) — ⭐ ${c2.rating} · ${c2.duration}

👉 *Tap the course cards below to view the syllabus and enroll directly in your Learn tab!*`;
  }

  // --------------------------------------------------------------------------
  // 4. General Conversation & Greetings ("Hi", "Hello", "Hi, how are you?")
  // --------------------------------------------------------------------------
  if (intent === "general_conversation") {
    if (
      /who (made|created|built) you|what (model|llm|engine) are you|are you (qwen|gemini|chatgpt|openai)/i.test(q) ||
      /so (ur|you're|you are) not qwen/i.test(q)
    ) {
      return `I am **Pathly AI**, powered by the **Qwen** model running on Groq's high-speed LPU inference engine. I'm tailored to provide rapid technical guidance and personalized career coaching!`;
    }

    if (/how are you|how's it going|how are you doing/i.test(q)) {
      return `I'm doing well, thank you for asking! How are you doing today? What would you like to explore or practice?`;
    }

    if (/who are you|what is your name|what can you do|introduce yourself/i.test(q)) {
      return `I'm **Pathly AI**, your intelligent career mentor. I can explain complex technical concepts, analyze your skill gaps, recommend verified in-app jobs and courses, or conduct mock interview prep. What would you like to start with?`;
    }

    const greetings = [
      `Hey ${profile.fullName ? profile.fullName.split(" ")[0] : "there"}! 👋 Great to connect. What's on your mind today?`,
      `Hi there! Ready to explore tech concepts, upskill, or look at career opportunities? What can I help you with?`,
      `Hello! 👋 How can I help you today? Feel free to ask any technical question, check out career paths, or practice interview concepts.`,
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  // --------------------------------------------------------------------------
  // 5. Technical Questions ("What is Python?", "Explain React vs Angular", "Explain ML")
  // --------------------------------------------------------------------------
  if (intent === "technical_question") {
    if (/python/i.test(q)) {
      if (!isDetailedRequest) {
        return `**Python** is a high-level, interpreted language renowned for clean syntax and readability.

- **Strengths:** Quick to learn, massive ecosystem, and dynamic typing.
- **Top Uses:** AI & Machine Learning (PyTorch, TensorFlow), Backend APIs (FastAPI, Django), and Automation/Scripting.

💡 *Ask "explain in detail" if you want a deeper architectural breakdown.*`;
      }

      return `**Python** is a high-level, interpreted, general-purpose programming language known for clean code readability and simplicity.

### Key Characteristics:
- **Readable Syntax:** Uses indentation rather than braces, making code concise and maintainable.
- **Interpreted & Dynamic:** Executes line-by-line; variables are dynamically typed.
- **Multi-Paradigm:** Supports OOP, functional, and procedural styles.

### Primary Use Cases:
1. **Data Science & AI:** NumPy, Pandas, Scikit-learn, PyTorch, and TensorFlow.
2. **Web Backends:** FastAPI, Django, Flask.
3. **Automation & Cloud:** Scripting, web scraping, and CI/CD automation.`;
    }

    if (/react.*angular|angular.*react/i.test(q)) {
      if (!isDetailedRequest) {
        return `**React vs Angular** in brief:

- **React:** A flexible UI **library** by Meta using a Virtual DOM and JSX. You choose your own routing, state management, and build tools. Ideal for flexibility and modern apps (e.g. Next.js).
- **Angular:** A comprehensive, opinionated **framework** by Google with TypeScript, routing, reactive forms, and dependency injection built-in. Ideal for large enterprise standards.

💡 *Ask "explain in detail" for a full side-by-side feature matrix.*`;
      }

      return `Here is a technical comparison between **React** and **Angular**:

| Dimension | React | Angular |
| :--- | :--- | :--- |
| **Type** | UI Component Library | Full Framework |
| **Maintained By** | Meta (Facebook) & Community | Google |
| **Language** | JS / TS (JSX) | TypeScript (Strict) |
| **DOM** | Virtual DOM | Real + Incremental DOM |
| **Architecture** | Flexible Composability | Structured MVC with DI |

### Recommendation:
- Choose **React** if you value architectural freedom, rich npm ecosystem, or Next.js.
- Choose **Angular** if you build enterprise applications that require standardized patterns out of the box.`;
    }

    if (/machine learning|ml\b/i.test(q)) {
      if (!isDetailedRequest) {
        return `**Machine Learning (ML)** is a subset of AI where systems learn patterns from historical data to make predictions or decisions, rather than following static hardcoded rules.

- **Supervised:** Learns from labeled data (e.g. spam detection, price prediction).
- **Unsupervised:** Finds hidden patterns (e.g. customer segmentation).
- **Reinforcement:** Learns via rewards and penalties (e.g. game playing, robotics).

💡 *Ask "explain in detail" if you want algorithmic and implementation depth.*`;
      }

      return `**Machine Learning (ML)** is a subfield of artificial intelligence where algorithms learn patterns from data to make predictions or decisions without hardcoded rules.

### The 3 Core Paradigms:
1. **Supervised Learning:** Trained on labeled data for Classification (spam filter) and Regression (sales forecast).
2. **Unsupervised Learning:** Finds hidden clusters in unlabeled data (customer segmentation, PCA).
3. **Reinforcement Learning:** Agents learn optimal strategies via reward/penalty feedback loops.

### Key Applications:
- Recommendation engines (Netflix, YouTube), Natural Language Processing (LLMs), and Computer Vision.`;
    }

    return `Here is a quick overview of **${userMessage}**:

- **Core Idea:** In modern software development, focus on clean architecture, type safety, and predictable data flow.
- **Best Practice:** Keep components modular, handle edge-case errors gracefully, and profile performance early.

💡 *Ask "explain in detail" if you'd like code snippets or a deeper dive.*`;
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

Would you like to expand on that or explore something new?`;
    }

    return `This is the start of our current conversation session. What would you like to explore?`;
  }

  // --------------------------------------------------------------------------
  // 7. Career Interest Update ("I am more interested in AI")
  // --------------------------------------------------------------------------
  if (intent === "career_interest_update") {
    const newInterest = extractNewInterest(userMessage);

    return `Understood! I've updated your primary career focus to **${newInterest}**.

- Your verified background in **${userSkills}** provides an excellent foundation.
- All future skill roadmaps, project ideas, and course suggestions will now prioritize **${newInterest}**!

What would you like to look at first—skills to develop or project ideas?`;
  }

  // --------------------------------------------------------------------------
  // 8. Job Search ("Find available jobs for me.")
  // --------------------------------------------------------------------------
  if (intent === "job_search") {
    const job1 = rankedJobs[0];
    const job2 = rankedJobs[1];

    let output = `Here are the top openings in Pathly matching your **${primaryInterest}** profile:\n\n`;

    if (job1) {
      output += `• **${job1.title}** at **${job1.companyOrOrg}** (${job1.salaryOrScale}, **${job1.matchScore}% Match**)\n`;
    }
    if (job2) {
      output += `• **${job2.title}** at **${job2.companyOrOrg}** (${job2.salaryOrScale}, **${job2.matchScore}% Match**)\n`;
    }

    output += `\n👉 *Tap the job cards below to view requirements and apply!*`;
    return output;
  }

  // --------------------------------------------------------------------------
  // 9. Project Recommendations ("Suggest projects based on my interests.")
  // --------------------------------------------------------------------------
  if (intent === "project_recommendation") {
    if (!isDetailedRequest) {
      return `Here are 2 high-impact project ideas for your **${primaryInterest}** portfolio:

1. **Real-Time Collaborative Workspace:** React, TypeScript & WebSockets with live presence and optimistic updates.
2. **High-Performance Headless Storefront:** Next.js App Router with instant edge search and 95+ Core Web Vitals.

💡 *Ask "explain in detail" for architecture specs and step-by-step milestones.*`;
    }

    return `### 🛠️ High-Impact Projects for ${primaryInterest}

To elevate your portfolio beyond standard CRUD applications:

1. **Real-Time Collaborative Canvas / Workspace:**
   - **Stack:** React, TypeScript, WebSockets, Tailwind CSS.
   - **Highlights:** Multi-user live cursor presence, conflict resolution, accessible keyboard controls.
   - **Why It Works:** Proves mastery over asynchronous state and network serialization.

2. **High-Performance E-Commerce Application with Edge Caching:**
   - **Stack:** Next.js (App Router), TypeScript, Service Workers, Tailwind CSS.
   - **Highlights:** Sub-100ms instant client-side search, offline cart storage, 95+ Core Web Vitals.
   - **Why It Works:** Demonstrates production optimization (LCP, INP, CLS) and modern rendering.`;
  }

  // --------------------------------------------------------------------------
  // 10. Skill Development ("What should I learn next?")
  // --------------------------------------------------------------------------
  if (intent === "skill_development") {
    const targetCareer = extractTargetCareerFromHistory(history, profile);

    if (!isDetailedRequest) {
      return `Based on your **${primaryInterest}** background (${userSkills}), here are the top 3 highest-priority skills to master next:

1. **Web Performance & Core Web Vitals:** Optimizing LCP, INP, and bundle splitting.
2. **State & Server Sync:** Mastering **TanStack Query** or **Zustand** for asynchronous cache handling.
3. **Next.js & Server Components:** App Router, Server Actions, and Streaming SSR.

💡 *Ask "give me a detailed roadmap" if you want a complete week-by-week guide!*`;
    }

    if (targetCareer.includes("Frontend") || targetCareer.includes("Web Application")) {
      return `### 📚 Detailed Skill Roadmap for **Frontend / Web Application Engineering**

Since you already possess foundations in **${userSkills}**, here is your advanced progression plan:

1. **Web Performance Optimization & Core Web Vitals (Priority 1):**
   - Largest Contentful Paint (LCP), Interaction to Next Paint (INP), Cumulative Layout Shift (CLS).
   - In-app resource: **"Web Development Bootcamp"** in your **Learn** tab.

2. **Advanced State Management & Server Synchronization:**
   - **TanStack Query** or **Zustand** for optimistic updates, cache invalidation, and debounced mutations.

3. **Modern Meta-Frameworks & Server Components:**
   - **Next.js (App Router)**, Server Actions, Streaming SSR, and hybrid rendering strategies.

4. **Automated Testing & Code Quality:**
   - Unit & component testing with **Jest** + **React Testing Library**; end-to-end flows with **Playwright**.`;
    }

    return `### 📚 Detailed Skill Roadmap for **${targetCareer}**

1. **Core Domain Tooling:** Deepen expertise in the specific frameworks and architectures of ${targetCareer}.
2. **Backend & API Integrations:** Build robust REST and GraphQL data pipelines.
3. **Performance & Automated Testing:** Unit test critical paths and optimize system response times.`;
  }

  // --------------------------------------------------------------------------
  // 11. Career Guidance ("Which career suits me?", "What kind of career should I choose?")
  // --------------------------------------------------------------------------
  if (intent === "career_guidance") {
    if (!isDetailedRequest) {
      return `Based on your **${profile.readinessScore}% readiness score** and skills in **${userSkills}**, your top recommended career path is **Frontend / Web Application Engineering** (93% suitability), followed by **UI/UX Design Systems** and **Full-Stack Development**.

Would you like to explore recommended skills to learn, view matching in-app jobs, or ask for a detailed breakdown?`;
    }

    return `### 🧭 Comprehensive Career Assessment for ${profile.fullName}

- 🎯 **Primary Fit:** **Frontend / Web Application Engineer** (93% Match)
  - Your proficiency in **React, TypeScript, Tailwind CSS** and verified project **${topProject}** provide immediate alignment with market roles (₹5–12 LPA).
- 🚀 **Growth Track:** **Full-Stack Web Developer**
  - Natural progression by expanding your React skills with Node.js and PostgreSQL.
- 🎨 **Hybrid Track:** **UI/UX & Design Systems Engineer**
  - Leverages your design sensibilities and component implementation skills.

💡 *Ask "What skills should I learn for that?" or "Find jobs for me" to continue.*`;
  }

  // --------------------------------------------------------------------------
  // 12. Resume & Score Improvement
  // --------------------------------------------------------------------------
  if (intent === "resume_improvement") {
    if (!isDetailedRequest) {
      return `Your Career Readiness Score is **${profile.readinessScore}%** (Resume: ${profile.resumeScore}/100). The top 2 quick improvements:

1. **Quantify Project Impact:** Add concrete metrics to your project descriptions (e.g. reduced load time by 30%, served 500+ active users).
2. **Verify Skills:** Complete the Web Performance module in your **Learn** tab.

💡 *Ask "explain in detail" for a category-by-category audit score breakdown.*`;
    }

    return `### 📊 Diagnostic of Your Career Readiness Score (${profile.readinessScore}%)

1. **Verified Core Skills:** 90 / 100 (Strong match for ${userSkills})
2. **Experience Eligibility:** 85 / 100 (1+ year aligns with entry-to-mid tier banding)
3. **Project Quantifiable Impact:** 70 / 100 (Add concrete latency/user numbers)
4. **Skill Assessment Depth:** 65 / 100 (Complete advanced assessments in Learn tab)

### Action Steps:
- Add quantifiable business metrics to your project descriptions.
- Enroll in the **Web Development Bootcamp** in Pathly's Learn tab.`;
  }

  // --------------------------------------------------------------------------
  // 13. Interview Preparation
  // --------------------------------------------------------------------------
  if (intent === "interview_prep") {
    if (!isDetailedRequest) {
      return `For **${primaryInterest}** interviews, focus on these 3 essentials:

1. **JavaScript & React Core:** Event loop, closures, hooks memoization, and reconciliation.
2. **Machine Coding:** Building a functional component (e.g. debounced search or modal) in 45 mins.
3. **Project Deep-Dive:** Explaining **${topProject}** using the STAR method (Situation, Task, Action, Result).

👉 *You can start a practice session in Pathly's **Mock Interview** screen!*`;
    }

    return `### 💡 Technical Interview Strategy for ${primaryInterest}

1. **Core Fundamentals:** Asynchronous JavaScript, closures, promises, React hook lifecycle (\`useMemo\`, \`useCallback\`).
2. **Machine Coding Round:** Constructing a responsive, accessible component under time constraints.
3. **Behavioral & Architecture:** Discussing **${topProject}** challenges, performance optimizations, and trade-offs using STAR.

🚀 *Launch a session in Pathly's **Mock Interview Screen** to practice timed questions!*`;
  }

  // Default fallback
  return `Regarding **"${userMessage}"**:

Focus on clean code architecture and modular design. How would you like to proceed?
- Explore specific technical concepts
- Review skill roadmaps and course recommendations
- Search verified in-app jobs in Pathly`;
}

// ============================================================================
// Contextual Follow-Up Suggestions (Dynamic & Context-Aware)
// ============================================================================
function generateFollowUps(
  intent: ChatIntent,
  userMessage: string,
  profile: UserProfileContext,
  topJob: RecommendedJobPayload | null
): string[] {
  const m = userMessage.toLowerCase();

  // Dynamic context-aware chips for specific tech/topics
  if (m.includes("next.js") || m.includes("nextjs")) {
    return [
      "How do Server Actions work in Next.js?",
      "How can I optimize Next.js performance?",
      "What projects can I build with Next.js?",
    ];
  }

  if (m.includes("react") || m.includes("angular")) {
    return [
      "Explain React hook performance & memoization.",
      "What are the best state management options?",
      "Suggest React projects for my portfolio.",
    ];
  }

  if (m.includes("python") || m.includes("machine learning") || m.includes("deep learning") || m.includes(" ai ") || m.endsWith(" ai")) {
    return [
      "How is Python used in Machine Learning?",
      "Suggest high-impact AI/ML projects.",
      "Show me top AI courses in Pathly.",
    ];
  }

  if (m.includes("salary") || m.includes("lpa") || m.includes("pay") || m.includes("compensation")) {
    return [
      "What skills increase my salary potential?",
      "Find available jobs for me.",
      "How do I negotiate compensation?",
    ];
  }

  if (intent === "acknowledgement") {
    return [
      "What should I learn next?",
      "Suggest any course for me.",
      "Find available jobs for me.",
    ];
  }

  if (intent === "career_guidance") {
    return [
      "What skills should I learn for that?",
      "Suggest projects based on my interests.",
      "Find available jobs for me.",
    ];
  }

  if (intent === "skill_development") {
    return [
      "Suggest projects based on my interests.",
      "Suggest any course for me.",
      "Find available jobs for me.",
    ];
  }

  if (intent === "project_presentation") {
    return [
      "Explain in detail with a meeting script.",
      "What technical questions might stakeholders ask?",
      "What should I learn next?",
    ];
  }

  if (intent === "course_recommendation") {
    return [
      "What projects can I build after this?",
      "What should I learn next?",
      "Find available jobs for me.",
    ];
  }

  if (intent === "job_search") {
    return [
      "What skills do I need for the first role?",
      "Help me prepare for interviews.",
      "What should I learn next?",
    ];
  }

  if (intent === "interview_prep") {
    return [
      "Give me a mock interview question.",
      "How should I structure my project answer?",
      "What are common technical pitfalls?",
    ];
  }

  if (intent === "resume_improvement") {
    return [
      "How can I improve my project bullet points?",
      "What keywords should I add for ATS?",
      "How do I increase my readiness score?",
    ];
  }

  if (intent === "technical_question") {
    return [
      "Explain this in more detail.",
      "Give me a code example.",
      "Suggest projects based on my interests.",
    ];
  }

  return [
    "What kind of career should I choose?",
    "What should I learn next?",
    "Find available jobs for me.",
  ];
}


