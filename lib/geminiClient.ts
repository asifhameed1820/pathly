import { UserProfileContext } from "@/lib/userProfile";
import { RecommendedJobPayload, RecommendedCoursePayload } from "@/app/api/chat/route";

export interface GeminiChatOptions {
  apiKey?: string;
  model?: string;
  userMessage: string;
  history: { sender: "user" | "ai"; text: string }[];
  profile: UserProfileContext;
  rankedJobs: RecommendedJobPayload[];
  recommendedCourses: RecommendedCoursePayload[];
  isDetailedRequest?: boolean;
}

export interface GeminiChatResult {
  text: string;
  model: string;
  provider: string;
}

/**
 * Client for Google Gemini Flash (Secondary AI Model).
 * Dedicated to Advanced Career Guidance:
 * - Generate personalized career roadmaps
 * - Analyze resumes and suggest improvements
 * - Perform skill gap analysis
 * - Compare different career paths
 * - Create structured learning plans
 * - Provide long-term career guidance
 * - Handle complex and detailed career-related queries
 */
export async function sendPromptToGemini({
  apiKey,
  model,
  userMessage,
  history,
  profile,
  rankedJobs,
  recommendedCourses,
  isDetailedRequest = false,
}: GeminiChatOptions): Promise<GeminiChatResult> {
  const resolvedKey =
    apiKey ||
    process.env.GEMINI_API_KEY ||
    (process.env.AI_PROVIDER === "gemini" ? process.env.AI_API_KEY : undefined);

  if (!resolvedKey) {
    throw new Error("No Google Gemini API key configured (GEMINI_API_KEY is missing).");
  }

  const configuredModel = model || process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const timeoutMs = parseInt(process.env.AI_TIMEOUT_MS || "25000", 10);
  const primaryInterest = profile.interests[0] || "Frontend Development";

  const systemInstruction = `You are Pathly AI's Advanced Career Guidance Specialist, powered by Google Gemini Flash.
You specialize in high-impact, strategic, and personalized career guidance for professionals and students.

YOUR CORE RESPONSIBILITIES:
1. Generate personalized, actionable career roadmaps tailored to the candidate's verified skills and target ambitions.
2. Analyze resumes, explain ATS scoring factors, and recommend high-impact improvements (quantifiable metrics, bullet points, tech stack positioning).
3. Perform detailed skill gap analysis between current abilities and market expectations for target roles.
4. Compare different career paths objectively (e.g. Frontend vs Fullstack, Data Science vs Data Engineering, Product vs Engineering), detailing learning curves, day-to-day work, compensation tiers, and long-term trajectory.
5. Create structured, step-by-step learning plans (milestones, core concepts, hands-on projects, and timeline estimates).
6. Provide long-term strategic career guidance (navigating junior-to-senior transitions, market shifts, leadership tracks).
7. Address complex, multi-faceted career inquiries with clear, structured markdown (headings, bullet points, trade-off matrices, and actionable next steps).

COMMUNICATION & FORMATTING PRINCIPLES:
- Deliver well-structured, easy-to-read answers with clean markdown.
- Ground your advice in the user's actual profile details below, citing their specific skills, readiness score (${profile.readinessScore}%), and target roles.
- When recommending learning resources or job directions, reference the verified in-app catalog provided below; NEVER invent fictitious companies, bogus salary figures, or non-existent courses.
- Maintain an encouraging, analytical, and professional coaching tone.

CANDIDATE PROFILE:
- Full Name: ${profile.fullName}
- Primary Interest: ${primaryInterest}
- Verified Skills: ${profile.skills.join(", ")}
- Experience Level: ${profile.experience} (${profile.experienceYears} years)
- Current Projects: ${profile.projects.map((p) => `${p.name} [${p.tech.join(", ")}]`).join("; ") || "None"}
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
${recommendedCourses
  .map((c) => `• [${c.id}] ${c.title} by ${c.provider} (${c.duration}, Rating: ${c.rating}, Skills: ${c.skills.join(", ")})`)
  .join("\n")}`;

  // Build multi-turn contents for Gemini REST API
  const formattedContents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];

  const recentHistory = history.slice(-16);
  for (const h of recentHistory) {
    formattedContents.push({
      role: h.sender === "user" ? "user" : "model",
      parts: [{ text: h.text }],
    });
  }

  formattedContents.push({
    role: "user",
    parts: [{ text: userMessage }],
  });

  // Candidate models to try in sequence for maximum resilience
  // If the primary configured model hits temporary 503 high demand or 404, fallback cleanly
  const modelsToTry = [
    configuredModel,
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
  ].filter((m, idx, arr) => arr.indexOf(m) === idx);

  const perAttemptTimeoutMs = Math.min(timeoutMs, 7000);
  let lastError: Error | null = null;

  for (const activeModel of modelsToTry) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), perAttemptTimeoutMs);

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${encodeURIComponent(
        resolvedKey
      )}`;

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemInstruction }],
          },
          contents: formattedContents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: isDetailedRequest ? 1500 : 900,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[Gemini Client] Model ${activeModel} failed with HTTP ${response.status}:`, errorText);
        lastError = new Error(`Gemini HTTP ${response.status}: ${errorText}`);
        // If 503 or 404, continue to next model candidate
        if (response.status === 503 || response.status === 404 || response.status === 429) {
          continue;
        }
        throw lastError;
      }

      const json = await response.json();
      const generatedText = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

      if (!generatedText) {
        throw new Error("Received empty response candidate from Google Gemini API.");
      }

      return {
        text: generatedText,
        model: activeModel,
        provider: "Google Gemini Flash",
      };
    } catch (err: any) {
      lastError = err;
      if (err.name === "AbortError") {
        console.warn(`[Gemini Client] Model ${activeModel} timed out after ${perAttemptTimeoutMs}ms, trying next candidate...`);
      } else {
        console.warn(`[Gemini Client] Model ${activeModel} error:`, err?.message || err);
      }
      continue;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError || new Error("Failed to generate content from Google Gemini Flash.");
}
