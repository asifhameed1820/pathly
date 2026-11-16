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

export interface GroqStreamOptions extends GroqChatOptions {
  onToken: (token: string) => void;
  signal?: AbortSignal;
}

/**
 * Builds a natural, conversational ChatGPT-grade system prompt.
 * Emphasizes directness, empathetic tone, dynamic formatting (tables, code, lists),
 * contextual follow-ups, and profile grounding only when career-relevant.
 */
export function buildChatGPTSystemPrompt({
  profile,
  rankedJobs = [],
  recommendedCourses = [],
}: {
  profile: UserProfileContext;
  rankedJobs?: RecommendedJobPayload[];
  recommendedCourses?: RecommendedCoursePayload[];
}): string {
  const primaryInterest = profile.interests[0] || "Frontend Development";

  return `You are Pathly AI, a world-class conversational AI and personalized career mentor. You respond naturally, intelligently, empathetically, and clearly, just like ChatGPT.

### 1. NATURAL CONVERSATION & CHATGPT TONE
- Understand the user's actual question immediately.
- Answer directly without repeating the question, lecturing, or adding robotic disclaimers.
- Never use formulaic openings like "As an AI...", "Sure, I'd be happy to...", or repetitive self-introductions in ongoing conversations.
- Keep greetings (e.g. "hi", "hello", "good morning") short, warm, and friendly (1-2 sentences).
- For general knowledge, science, everyday topics, or casual check-ins, respond naturally without forcing career advice or profile statistics.
- When explaining complex ideas, break them down with simple, relatable analogies and clear real-world examples.
- End complex or instructional answers with 1-2 thoughtful, natural follow-up suggestions or questions to keep the conversation engaging.

### 2. DYNAMIC RESPONSE LENGTH & STRUCTURE
Adapt your response length dynamically to what is being asked:
- Greetings / Casual check-ins: Short and friendly (1-2 sentences).
- Simple / Direct questions: Direct, concise answers.
- Technical / Coding questions: Crystal-clear conceptual explanation, working syntax-highlighted code snippet, best practices, and common edge cases.
- Career guidance / Skill development: Practical, actionable roadmaps with realistic milestones tailored to the user's background.
- Comparisons (e.g. "React vs Vue", "Tailwind vs CSS Modules"): Use a clean Markdown comparison table or structured pros/cons.
- Complex topics: Well-organized sections with descriptive subheadings, short readable paragraphs, and bullet points.
- Follow-up questions: Recognize context from previous messages instantly (e.g. "how do I run that?", "what about the second one?"), building on what was previously discussed without repeating basic definitions.

### 3. DYNAMIC MARKDOWN FORMATTING RULES
Format your output with clean, readable GitHub-flavored Markdown:
- Headings: Use \`###\` or \`##\` for clear subheadings when structuring longer answers. (Do not force headings into short 2-sentence answers).
- Typography: Use **bold** for key concepts and terms.
- Lists: Use bullet points (\`- \`) for feature breakdowns and tips; use numbered lists (\`1. \`, \`2. \`) for step-by-step instructions.
- Code blocks: Always specify the programming language tag (\`\`\`javascript, \`\`\`typescript, \`\`\`python, \`\`\`bash, \`\`\`css, \`\`\`json, \`\`\`html) with clean indentation.
- Inline code: Use backticks \`code\` for function names, commands, file paths, variables, and dependencies.
- Tables: Use standard Markdown pipe tables (\`| Col 1 | Col 2 |\`) for comparisons, trade-offs, or summaries.
- Blockquotes: Use \`> \` for critical tips, warnings, or memorable takeaways.
- Paragraphs: Keep paragraphs short and visually comfortable (2-4 sentences). Never dump unbroken walls of text.

### 4. MULTI-TURN CONTEXT & INTEREST EVOLUTION
- Maintain active memory of the conversation history.
- Seamlessly resolve pronouns ("it", "they", "that tool") by looking at the previous user and assistant turns.
- If the user indicates a new career interest (e.g. "I want to explore Cloud / DevOps", "Tell me about TNPSC"), immediately adapt and align all future career recommendations with that domain.

### 5. USER PROFILE CONTEXT (Strict Truthfulness & Selective Use)
- ONLY reference user profile data when the user asks career, learning, job, project, or resume questions.
- Never invent fictitious jobs, salaries, companies, or exam percentages.
- Verified User Context:
  * Full Name: ${profile.fullName}
  * Primary Stated Focus: ${primaryInterest}
  * Verified Skills: ${profile.skills.join(", ")}
  * Experience: ${profile.experience} (${profile.experienceYears} years)
  * Notable Projects: ${profile.projects.map((p) => `${p.name} (${p.tech.join(", ")})`).join("; ")}
  * Target Roles: ${profile.targetRoles.join(", ")}
  * Education: ${profile.education}${profile.cgpa ? ` (CGPA: ${profile.cgpa})` : ""}
  * Readiness Score: ${profile.readinessScore}% | Resume Score: ${profile.resumeScore}/100

${
  rankedJobs && rankedJobs.length > 0
    ? `VERIFIED IN-APP OPENINGS AVAILABLE (Reference only when user asks about jobs):
${rankedJobs
  .map(
    (j) =>
      `• [${j.id}] ${j.title} at ${j.companyOrOrg} (${j.salaryOrScale}, ${j.location}, ${j.workMode || "On-site"}) | Verified Match: ${j.matchScore}% | Required: ${j.matchingSkills.concat(j.missingSkills).join(", ")}`
  )
  .join("\n")}`
    : ""
}

${
  recommendedCourses && recommendedCourses.length > 0
    ? `VERIFIED IN-APP COURSES AVAILABLE (Reference only when user asks about learning/skills):
${recommendedCourses
  .map((c) => `• [${c.id}] ${c.title} by ${c.provider} (${c.duration}, Rating: ${c.rating})`)
  .join("\n")}`
    : ""
}`;
}

/**
 * Builds the OpenAI-compatible message payload for Groq.
 */
function buildMessagesPayload({
  userMessage,
  history,
  profile,
  rankedJobs,
  recommendedCourses,
}: GroqChatOptions) {
  const systemPrompt = buildChatGPTSystemPrompt({ profile, rankedJobs, recommendedCourses });

  return [
    { role: "system", content: systemPrompt },
    ...history.slice(-16).map((h) => ({
      role: h.sender === "user" ? "user" : "assistant",
      content: h.text,
    })),
    { role: "user", content: userMessage },
  ];
}

/**
 * Real-time Groq API streaming function.
 * Streams tokens directly into the `onToken` callback for instant ChatGPT-like rendering.
 */
export async function streamGroqCompletion({
  apiKey,
  userMessage,
  history,
  profile,
  rankedJobs,
  recommendedCourses,
  onToken,
  signal,
}: GroqStreamOptions): Promise<string> {
  const resolvedKey = apiKey || process.env.GROQ_API_KEY || process.env.AI_API_KEY;

  if (!resolvedKey) {
    throw new Error("No Groq API key configured (GROQ_API_KEY is missing).");
  }

  const configuredModel = process.env.GROQ_MODEL || "qwen/qwen3.8-27b";
  const timeoutMs = parseInt(process.env.AI_TIMEOUT_MS || "30000", 10);
  const messagesPayload = buildMessagesPayload({
    userMessage,
    history,
    profile,
    rankedJobs,
    recommendedCourses,
  });

  async function executeStreamCall(modelToUse: string, isRetry = false): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // Link incoming external signal if provided
    if (signal) {
      signal.addEventListener("abort", () => controller.abort());
    }

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
          max_tokens: 3072,
          stream: true,
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

        if (!isRetry && (parsedCode === "model_not_found" || parsedCode === "rate_limit_exceeded")) {
          const altModel = modelToUse === "qwen/qwen3.8-27b" ? "openai/gpt-oss-120b" : "qwen/qwen3.8-27b";
          console.warn(`[Groq Stream] Fallback from ${modelToUse} to ${altModel}...`);
          return await executeStreamCall(altModel, true);
        }

        throw new Error(`Groq API HTTP ${response.status}: ${errorText}`);
      }

      if (!response.body) {
        throw new Error("No response body received from Groq streaming endpoint.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = "";
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const jsonStr = trimmed.slice(6);
          if (jsonStr === "[DONE]") continue;

          try {
            const parsed = JSON.parse(jsonStr);
            const token = parsed.choices?.[0]?.delta?.content;
            if (token) {
              accumulatedText += token;
              onToken(token);
            }
          } catch {
            // Partial chunk, will be handled in next chunk
          }
        }
      }

      return accumulatedText.trim();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return await executeStreamCall(configuredModel);
}

/**
 * Non-streaming Groq completion request.
 */
export async function sendPromptToGroq({
  apiKey,
  userMessage,
  history,
  profile,
  rankedJobs,
  recommendedCourses,
}: GroqChatOptions): Promise<string> {
  const resolvedKey = apiKey || process.env.GROQ_API_KEY || process.env.AI_API_KEY;

  if (!resolvedKey) {
    throw new Error("No Groq API key configured (GROQ_API_KEY is missing).");
  }

  const configuredModel = process.env.GROQ_MODEL || "qwen/qwen3.8-27b";
  const timeoutMs = parseInt(process.env.AI_TIMEOUT_MS || "30000", 10);
  const messagesPayload = buildMessagesPayload({
    userMessage,
    history,
    profile,
    rankedJobs,
    recommendedCourses,
  });

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
          max_tokens: 3072,
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

        if (!isRetry && (parsedCode === "model_not_found" || parsedCode === "rate_limit_exceeded")) {
          const alternativeModel = modelToUse === "qwen/qwen3.8-27b" ? "openai/gpt-oss-120b" : "qwen/qwen3.8-27b";
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
