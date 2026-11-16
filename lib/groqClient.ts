import { UserProfileContext } from "@/lib/userProfile";
import { RecommendedJobPayload, RecommendedCoursePayload } from "@/app/api/chat/route";

export interface GroqChatOptions {
  apiKey?: string;
  userMessage: string;
  history: { sender: "user" | "ai"; text: string }[];
  profile: UserProfileContext;
  rankedJobs: RecommendedJobPayload[];
  recommendedCourses: RecommendedCoursePayload[];
  isCareerRelevant?: boolean;
}

/**
 * Sends chat completion requests to the official Groq API endpoint.
 * Supports configurable model via GROQ_MODEL, multi-turn history,
 * verified profile injection, and intelligent fallback handling.
 */
export async function sendPromptToGroq({
  apiKey,
  userMessage,
  history,
  profile,
  rankedJobs,
  recommendedCourses,
  isCareerRelevant = false,
}: GroqChatOptions): Promise<string> {
  const resolvedKey = apiKey || process.env.GROQ_API_KEY || process.env.AI_API_KEY;

  if (!resolvedKey) {
    throw new Error("No Groq API key configured (GROQ_API_KEY is missing).");
  }

  // Configured model via environment variable or default to active model
  const configuredModel = process.env.GROQ_MODEL || "qwen/qwen3.8-27b";
  const timeoutMs = parseInt(process.env.AI_TIMEOUT_MS || "25000", 10);
  const primaryInterest = profile.interests[0] || "Frontend Development";

  const systemPrompt = `You are Pathly AI, an intelligent conversational assistant and personalized career mentor.

CORE PRINCIPLES:
1. ANSWER THE USER'S ACTUAL QUESTION DIRECTLY & CONCISELY:
   - Default to concise, direct, and crisp responses (typically 2 to 4 sentences or a few focused bullet points).
   - Get straight to the point without verbose greetings, unnecessary filler, or repetitive preamble.
   - For general questions, technical definitions, greetings, or casual chat, provide short, natural, and helpful replies.

2. ADAPTIVE RESPONSE LENGTH (EXPAND ONLY WHEN NECESSARY):
   - By default, KEEP RESPONSES BRIEF AND SCANNABLE.
   - Deliver detailed, multi-paragraph, or comprehensive answers ONLY when strictly necessary:
     * When the user explicitly asks for detailed explanations, comprehensive guides, roadmaps, step-by-step breakdowns, or preparation plans (e.g. "explain in detail", "give me a full roadmap", "step by step", "how to prepare thoroughly").
     * When the question is inherently multifaceted or involves architectural designs, code samples, or structured STAR interview answers that genuinely require depth.
   - Even when detailed answers are needed, structure them with clear headers, short bullet points, and bold keywords so they are never dense walls of text.

3. USE USER PROFILE ONLY WHEN RELEVANT:
   - Only evaluate the user's skills, experience, projects, education, and scores when the user asks career-related questions (e.g. "What should I learn next?", "What kind of career should I choose?", "Suggest projects for me", "Find jobs for me", "Review my resume").
   - When career context is relevant, give TOP PRIORITY to the user's stated career interest (${primaryInterest}).
   - If the user indicates an interest change (e.g. "I am more interested in AI"), acknowledge the change, update your conversational focus, and align future guidance with that interest.

4. NEVER FABRICATE DATA:
   - Never invent fake jobs, companies, salaries, courses, eligibility requirements, scores, or statistics.
   - If recommending jobs or courses from Pathly, ONLY reference entries from the verified in-app catalog provided below.
   - If no openings exist in the application database for a requested field, state that honestly while offering general preparation guidance.

5. MULTI-TURN CONVERSATION MEMORY:
   - Maintain context across the conversation.
   - If the user asks a follow-up question (e.g. "What did I ask previously?", "What skills should I learn for that?", "How do I do that?"), refer directly to earlier exchanges.
   - For follow-ups like "for that", look at what was previously discussed and respond accordingly.
   - Avoid repetitive boilerplate self-introductions in ongoing conversations.

USER PROFILE CONTEXT (Use only when relevant to user's question):
- Full Name: ${profile.fullName}
- Primary Stated Interest: ${primaryInterest}
- Verified Skills: ${profile.skills.join(", ")}
- Experience: ${profile.experience} (${profile.experienceYears} years)
- Projects: ${profile.projects.map((p) => `${p.name} (${p.tech.join(", ")})`).join("; ")}
- Target Roles: ${profile.targetRoles.join(", ")}
- Education: ${profile.education}${profile.cgpa ? ` (CGPA: ${profile.cgpa})` : ""}
- Career Readiness Score: ${profile.readinessScore}% | Resume Score: ${profile.resumeScore}/100

VERIFIED IN-APP OPENINGS AVAILABLE (Reference only when user asks about jobs/careers):
${rankedJobs
  .map(
    (j) =>
      `• [${j.id}] ${j.title} at ${j.companyOrOrg} (${j.salaryOrScale}, ${j.location}, ${j.workMode || "On-site"}) | Verified Match: ${j.matchScore}% | Required: ${j.matchingSkills.concat(j.missingSkills).join(", ")}`
  )
  .join("\n")}

VERIFIED IN-APP COURSES (Reference only when user asks about learning/skills):
${recommendedCourses.map((c) => `• [${c.id}] ${c.title} by ${c.provider} (${c.duration}, Rating: ${c.rating})`).join("\n")}`;

  const messagesPayload = [
    { role: "system", content: systemPrompt },
    ...history.slice(-16).map((h) => ({
      role: h.sender === "user" ? "user" : "assistant",
      content: h.text,
    })),
    { role: "user", content: userMessage },
  ];

  async function executeGroqCall(modelToUse: string, isRetry = false): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resolvedKey}`,
        },
        body: JSON.stringify({
          model: modelToUse,
          messages: messagesPayload,
          temperature: 0.7,
          max_tokens: 1024,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        let parsedCode = "";
        try {
          const errJson = JSON.parse(errorText);
          parsedCode = errJson?.error?.code || "";
        } catch {}

        // Fallback to alternative active Groq models if model_not_found or rate limit exceeded
        if (!isRetry && (parsedCode === "model_not_found" || parsedCode === "rate_limit_exceeded")) {
          const alternativeModel = modelToUse === "qwen/qwen3.8-27b" ? "openai/gpt-oss-120b" : "qwen/qwen3.8-27b";
          console.warn(`[Groq] Model "${modelToUse}" encountered ${parsedCode || response.status}. Falling back to alternative model "${alternativeModel}"...`);
          return await executeGroqCall(alternativeModel, true);
        }

        throw new Error(`Groq API HTTP ${response.status}: ${errorText}`);
      }

      const json = await response.json();
      const content = json.choices?.[0]?.message?.content;

      if (!content || typeof content !== "string" || !content.trim()) {
        throw new Error("Received empty completion from Groq API.");
      }

      return content.trim();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return await executeGroqCall(configuredModel);
}
