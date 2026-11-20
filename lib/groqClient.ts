import { UserProfileContext } from "@/lib/userProfile";
import { RecommendedJobPayload, RecommendedCoursePayload } from "@/app/api/chat/route";

export interface GroqChatOptions {
  apiKey?: string;
  model?: string;
  userMessage: string;
  history: { sender: "user" | "ai"; text: string }[];
  profile: UserProfileContext;
  rankedJobs: RecommendedJobPayload[];
  recommendedCourses: RecommendedCoursePayload[];
  isCareerRelevant?: boolean;
}

export interface GroqChatResult {
  text: string;
  model: string;
  provider: string;
}

/**
 * Client for Groq – Qwen (Primary AI Model).
 * Dedicated to Fast Career Assistance:
 * - Answer basic career-related questions
 * - Explain programming languages and technical concepts
 * - Provide interview preparation guidance
 * - Explain job roles and required skills
 * - Recommend relevant technologies and learning resources
 * - Handle general conversations and quick follow-up questions
 */
export async function sendPromptToGroq({
  apiKey,
  model,
  userMessage,
  history,
  profile,
  rankedJobs,
  recommendedCourses,
  isCareerRelevant = false,
}: GroqChatOptions): Promise<GroqChatResult> {
  const resolvedKey = apiKey || process.env.GROQ_API_KEY || process.env.AI_API_KEY;

  if (!resolvedKey) {
    throw new Error("No Groq API key configured (GROQ_API_KEY is missing).");
  }

  // Configured model via environment variable or default to active Qwen model
  const configuredModel = model || process.env.GROQ_MODEL || "qwen/qwen3.8-27b";
  const timeoutMs = parseInt(process.env.AI_TIMEOUT_MS || "25000", 10);
  const primaryInterest = profile.interests[0] || "Frontend Development";

  const systemPrompt = `You are Pathly AI's Primary Career Assistant, powered by the Qwen model on Groq's ultra-fast LPU inference engine.
If asked about your identity or underlying model, state clearly that you are Pathly AI, powered by Qwen on Groq.

YOUR CORE RESPONSIBILITIES (Fast Career Assistance):
1. Answer basic career-related questions directly and accurately.
2. Explain programming languages, frameworks, and technical concepts (e.g. Python, React, Docker, closures, event loop).
3. Provide practical interview preparation guidance and tips.
4. Explain job roles, industry expectations, and required skills.
5. Recommend relevant technologies, modern developer tools, and learning resources.
6. Handle general conversations, greetings, and quick follow-up questions effortlessly.

CRITICAL OPERATING RULES:

1. STRICT BREVITY & CONCISE RESPONSES BY DEFAULT:
   - By default, ALL your responses MUST be SHORT, BRIEF, AND SCANNABLE (strictly 1 to 3 short sentences, or a maximum of 2-3 brief bullet points, under 50-60 words total).
   - NEVER output long paragraphs, multiple paragraphs, essay-style answers, or unsolicited "Action Plans" or "Roadmaps" blocks by default.
   - Do NOT give expansive or overwhelming explanations for simple or general queries. Get straight to the point immediately.
   - ONLY produce longer or detailed responses when the user EXPLICITLY asks for depth (e.g. "explain in detail", "step by step", "deep dive", "in-depth breakdown", "elaborate").

2. CONVERSATION MEMORY & CONTINUITY:
   - Actively remember previous messages in the conversation thread.
   - When the user asks follow-up questions or uses pronouns (e.g. "what do you recommend for that?", "how do I prepare for that?", "what is the salary for that?"):
     * Directly refer to the topic discussed in the preceding turns.
     * Keep recommendations brief (1-2 top suggestions with a 1-sentence reason).

3. DYNAMIC TONE & NATURAL CONVERSATION:
   - Adapt your tone dynamically: friendly and warm for greetings, direct and sharp for technical definitions, supportive and practical for career questions.
   - NEVER use canned filler phrases like "Certainly! I'd be happy to help", "As an AI...", or "Based on your profile as a frontend developer...". Jump directly into the conversation.
   - Do NOT repeat greetings on successive turns in an ongoing conversation.

4. FACTUAL ACCURACY & VERIFIED IN-APP CATALOG:
   - Never fabricate fake jobs, salaries, companies, or course credentials.
   - For in-app job openings and courses, reference ONLY the verified catalog provided below when relevant.

USER PROFILE CONTEXT:
- Full Name: ${profile.fullName}
- Primary Stated Interest: ${primaryInterest}
- Verified Skills: ${profile.skills.join(", ")}
- Experience: ${profile.experience} (${profile.experienceYears} years)
- Current Projects: ${profile.projects.map((p) => `${p.name} (${p.tech.join(", ")})`).join("; ") || "None"}
- Target Roles: ${profile.targetRoles.join(", ")}
- Education: ${profile.education}${profile.cgpa ? ` (CGPA: ${profile.cgpa})` : ""}
- Career Readiness Score: ${profile.readinessScore}% | Resume Score: ${profile.resumeScore}/100

VERIFIED IN-APP OPENINGS AVAILABLE:
${rankedJobs
  .map(
    (j) =>
      `• [${j.id}] ${j.title} at ${j.companyOrOrg} (${j.salaryOrScale}, ${j.location}, ${j.workMode || "On-site"}) | Verified Match: ${j.matchScore}% | Required: ${j.matchingSkills.concat(j.missingSkills).join(", ")}`
  )
  .join("\n")}

VERIFIED IN-APP COURSES AVAILABLE:
${recommendedCourses.map((c) => `• [${c.id}] ${c.title} by ${c.provider} (${c.duration}, Rating: ${c.rating})`).join("\n")}`;

  const messagesPayload = [
    { role: "system", content: systemPrompt },
    ...history.slice(-16).map((h) => ({
      role: h.sender === "user" ? "user" : "assistant",
      content: h.text,
    })),
    { role: "user", content: userMessage },
  ];

  async function executeGroqCall(modelToUse: string, isRetry = false): Promise<GroqChatResult> {
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
          console.warn(`[Groq] Model "${modelToUse}" encountered ${parsedCode || response.status}. Falling back to "${alternativeModel}"...`);
          return await executeGroqCall(alternativeModel, true);
        }

        throw new Error(`Groq API HTTP ${response.status}: ${errorText}`);
      }

      const json = await response.json();
      const content = json.choices?.[0]?.message?.content;

      if (!content || typeof content !== "string" || !content.trim()) {
        throw new Error("Received empty completion from Groq API.");
      }

      return {
        text: content.trim(),
        model: modelToUse,
        provider: "Groq (Qwen)",
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return await executeGroqCall(configuredModel);
}
