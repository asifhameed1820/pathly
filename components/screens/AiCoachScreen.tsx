"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Send,
  ThumbsUp,
  ThumbsDown,
  AlertCircle,
  ArrowLeft,
  RotateCcw,
  Briefcase,
  BookOpen,
  ArrowRight,
  ChevronRight,
  Copy,
  Check,
  Sliders,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  loadUserProfile,
  saveUserProfile,
  UserProfileContext,
  DEFAULT_USER_PROFILE,
} from "@/lib/userProfile";
import { RecommendedJobPayload, RecommendedCoursePayload } from "@/app/api/chat/route";

interface AiCoachScreenProps {
  onBack?: () => void;
  onSelectJob?: (jobId: string) => void;
  onSelectCourse?: (courseId: string) => void;
  onNavigateToTab?: (tab: "home" | "jobs" | "learn" | "ai" | "profile") => void;
  initialMessage?: string;
  onClearInitialMessage?: () => void;
}

interface ChatMessage {
  id: string;
  sender: "ai" | "user";
  text: string;
  timestamp: Date;
  recommendedJobs?: RecommendedJobPayload[];
  recommendedCourses?: RecommendedCoursePayload[];
  feedback?: "up" | "down" | null;
  isTypingEffect?: boolean;
  provider?: string;
  model?: string;
  role?: string;
}

const INTEREST_PRESETS = [
  { id: "frontend", label: "💻 Frontend & Web", interest: "Frontend Development" },
  { id: "uiux", label: "🎨 UI/UX & Design", interest: "UI/UX" },
  { id: "tech", label: "☁️ Technology", interest: "Technology" },
  { id: "govt", label: "🏛️ Govt & TNPSC", interest: "Government Jobs" },
];

export function AiCoachScreen({
  onBack,
  onSelectJob,
  onSelectCourse,
  onNavigateToTab,
  initialMessage,
  onClearInitialMessage,
}: AiCoachScreenProps) {
  const [userProfile, setUserProfile] = useState<UserProfileContext>(DEFAULT_USER_PROFILE);
  const [showProfileDrawer, setShowProfileDrawer] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const initialSentRef = useRef(false);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      sender: "ai",
      text: `Hello ${DEFAULT_USER_PROFILE.fullName}! 👋 I'm your **Pathly AI Assistant**.

I'm aligned with your **${DEFAULT_USER_PROFILE.interests[0]}** track and skills in **${DEFAULT_USER_PROFILE.skills.slice(0, 3).join(", ")}**.

Ask me any technical question, or request personalized advice on skills, courses, or jobs!`,
      timestamp: new Date(),
    },
  ]);

  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([
    "Suggest any course for me.",
    "What should I learn next?",
    "Suggest projects based on my interests.",
    "Find available jobs for me.",
  ]);

  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const typingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load user profile on mount
  useEffect(() => {
    const loaded = loadUserProfile();
    const cleanInterests =
      loaded.interests && loaded.interests.length > 0 && !loaded.interests[0].includes("Business")
        ? [loaded.interests[0]]
        : DEFAULT_USER_PROFILE.interests;
    const sanitized = { ...DEFAULT_USER_PROFILE, ...loaded, interests: cleanInterests };
    setUserProfile(sanitized);
  }, []);

  // Cleanup typewriter interval on unmount
  useEffect(() => {
    return () => {
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
      }
    };
  }, []);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping, isThinking]);

  const handleCopyText = async (id: string, text: string) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else if (typeof document !== "undefined") {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopiedId(id);
      setTimeout(() => {
        setCopiedId((prev) => (prev === id ? null : prev));
      }, 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleSend = async (overrideText?: string) => {
    const msgText = (overrideText || inputValue).trim();
    if (!msgText || isTyping) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: msgText,
      timestamp: new Date(),
    };

    // Include the new userMsg in history so that context memory is 100% up to date
    const currentHistory = [...messages, userMsg].slice(-20).map((m) => ({
      sender: m.sender,
      text: m.text,
    }));

    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setIsTyping(true);
    setIsThinking(true);

    const startTime = Date.now();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msgText,
          history: currentHistory,
          userProfile,
        }),
      });

      const data = await response.json();

      // Brief thinking pause for realistic ChatGPT experience before streaming text
      const MIN_THINKING_MS = 800;
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_THINKING_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_THINKING_MS - elapsed));
      }

      setIsThinking(false);

      // If backend updated profile (e.g. user said "I am more interested in AI"), persist it
      if (data.updatedProfile) {
        setUserProfile(data.updatedProfile);
        saveUserProfile(data.updatedProfile);
      }

      const fullText = (data.response || "I have analyzed your request.").trim();
      const aiId = `ai-${Date.now()}`;

      // 1. Mount placeholder message with typing effect active
      const aiResponse: ChatMessage = {
        id: aiId,
        sender: "ai",
        text: "",
        timestamp: new Date(),
        recommendedJobs: data.recommendedJobs || [],
        recommendedCourses: data.recommendedCourses || [],
        isTypingEffect: true,
        provider: data.provider,
        model: data.model,
        role: data.role,
      };

      setMessages((prev) => [...prev, aiResponse]);

      // 2. Stream typewriter characters smoothly like ChatGPT
      await new Promise<void>((resolve) => {
        let charIndex = 0;
        const total = fullText.length;
        // Step size: 2 to 4 characters per tick for smooth streaming
        const step = Math.max(2, Math.min(5, Math.ceil(total / 70)));

        if (typingIntervalRef.current) {
          clearInterval(typingIntervalRef.current);
        }

        typingIntervalRef.current = setInterval(() => {
          charIndex = Math.min(charIndex + step, total);
          const currentSlice = fullText.slice(0, charIndex);
          const isFinished = charIndex >= total;

          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiId
                ? {
                    ...m,
                    text: currentSlice,
                    isTypingEffect: !isFinished,
                  }
                : m
            )
          );

          if (isFinished) {
            if (typingIntervalRef.current) {
              clearInterval(typingIntervalRef.current);
              typingIntervalRef.current = null;
            }
            resolve();
          }
        }, 16);
      });

      if (data.suggestedFollowUps && Array.isArray(data.suggestedFollowUps) && data.suggestedFollowUps.length > 0) {
        setSuggestedPrompts(data.suggestedFollowUps);
      }
    } catch (err) {
      console.error("Chat error:", err);
      setIsThinking(false);
      const fallbackAiResponse: ChatMessage = {
        id: `ai-err-${Date.now()}`,
        sender: "ai",
        text: `I apologize, but I encountered a momentary issue processing your request. Please try asking again, or explore your career path for ${userProfile.interests[0]}.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, fallbackAiResponse]);
    } finally {
      setIsThinking(false);
      setIsTyping(false);
    }
  };

  // Prefill initialMessage into the chatbot's input box (e.g. from Interview Debrief screen)
  useEffect(() => {
    let msgToSend = initialMessage;
    if (!msgToSend && typeof window !== "undefined") {
      const stored = sessionStorage.getItem("pathly_ai_initial_message");
      if (stored) {
        msgToSend = stored;
        sessionStorage.removeItem("pathly_ai_initial_message");
      }
    }

    if (msgToSend && msgToSend.trim()) {
      const textToDeliver = msgToSend.trim();
      setInputValue(textToDeliver);
      onClearInitialMessage?.();
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.setSelectionRange(textToDeliver.length, textToDeliver.length);
        }
      }, 100);
    }
  }, [initialMessage]);

  const handleInterestSwitch = (newInterest: string) => {
    const updated = saveUserProfile({
      interests: [newInterest],
    });
    setUserProfile(updated);
    setShowProfileDrawer(false);

    // Send proactive prompt to AI
    handleSend(`I want to explore careers and jobs in ${newInterest}. What matches my background?`);
  };

  const handleFeedback = (messageId: string, type: "up" | "down") => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, feedback: m.feedback === type ? null : type } : m
      )
    );
  };

  const handleResetChat = () => {
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }
    setIsThinking(false);
    setIsTyping(false);
    setMessages([
      {
        id: "welcome-reset",
        sender: "ai",
        text: `Chat reset. Ready to assist you with technical inquiries, project advice, or career questions!`,
        timestamp: new Date(),
      },
    ]);
    setSuggestedPrompts([
      "Suggest any course for me.",
      "What should I learn next?",
      "Suggest projects based on my interests.",
      "Find available jobs for me.",
    ]);
  };

  return (
    <div className="h-full w-full max-w-full bg-[#FAF9FF] flex flex-col relative overflow-hidden">
      {/* Header */}
      <div className="shrink-0 bg-white border-b border-[#E8E5F2] px-3 sm:px-4 py-2 sm:py-2.5 shadow-xs z-20">
        <div className="flex items-center justify-between gap-2 max-w-full">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="p-1 rounded-full hover:bg-slate-100 text-[#667085] transition-colors shrink-0"
                aria-label="Back"
              >
                <ArrowLeft className="w-4 h-4 stroke-[1.8]" />
              </button>
            )}
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#635BFF] to-[#8B5CF6] flex items-center justify-center shadow-xs shrink-0">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h1 className="text-[13px] sm:text-[14px] font-bold text-[#172033] truncate">
                  AI Career Assistant
                </h1>
              </div>
              <p className="text-[10px] text-[#667085] truncate">
                Tailored for {userProfile.fullName}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setShowProfileDrawer(!showProfileDrawer)}
              className={cn(
                "px-2 py-1 rounded-lg border transition-all flex items-center gap-1 text-[10.5px] font-medium shrink-0",
                showProfileDrawer
                  ? "bg-[#635BFF] text-white border-[#635BFF]"
                  : "bg-white text-[#475569] border-[#E2E8F0] hover:bg-slate-50"
              )}
              title="Career Track Selector"
            >
              <Sliders className="w-3 h-3" />
              <span>Track</span>
            </button>
            <button
              type="button"
              onClick={handleResetChat}
              className="p-1.5 rounded-lg text-[#667085] hover:text-[#172033] hover:bg-slate-100 transition-colors shrink-0"
              title="Reset Chat"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Focus Banner */}
        <div className="mt-2 flex items-center justify-between gap-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-2.5 py-1 text-[10.5px]">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[9.5px] font-semibold text-[#64748B] uppercase tracking-wider shrink-0">
              Track:
            </span>
            <span className="font-bold text-[#635BFF] truncate">
              {userProfile.interests[0] || "Frontend Development"}
            </span>
          </div>
          <span className="font-semibold text-[#059669] bg-[#D1FAE5] px-1.5 py-0.5 rounded text-[9.5px] shrink-0">
            {userProfile.readinessScore}% Match
          </span>
        </div>
      </div>

      {/* Focus & Interest Preset Drawer */}
      <AnimatePresence>
        {showProfileDrawer && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-[#F1F5F9] border-b border-[#E2E8F0] px-3.5 py-2.5 z-10 shrink-0"
          >
            <p className="text-[11px] font-bold text-[#334155] mb-1.5">
              Switch Career Track to Test Adaptive Guidance:
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {INTEREST_PRESETS.map((preset) => {
                const isActive = userProfile.interests[0] === preset.interest;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleInterestSwitch(preset.interest)}
                    className={cn(
                      "text-left p-1.5 rounded-lg border text-[11px] font-medium transition-all truncate",
                      isActive
                        ? "bg-[#635BFF] text-white border-[#635BFF] shadow-xs"
                        : "bg-white text-[#1E293B] border-[#CBD5E1] hover:border-[#635BFF]"
                    )}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Messages Scrollable Body */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 sm:px-4 py-3 space-y-3">
        {/* Dynamic Suggested Prompts */}
        {suggestedPrompts.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pb-1 max-w-full overflow-hidden">
            {suggestedPrompts.slice(0, 4).map((prompt, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSend(prompt)}
                disabled={isTyping}
                className="text-[10.5px] font-medium text-[#635BFF] bg-[#EEF2FF] border border-[#C7D2FE] rounded-full px-2.5 py-1 hover:bg-[#E0E7FF] transition-all active:scale-95 text-left disabled:opacity-50 max-w-full truncate"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        {/* Messages */}
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={cn(
                "w-full flex flex-col",
                msg.sender === "user" ? "items-end pr-1 sm:pr-2" : "items-start pl-0.5 sm:pl-1"
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] sm:max-w-[80%] rounded-[18px] px-3.5 py-2.5 sm:px-4 sm:py-3 text-[12px] sm:text-[12.5px] leading-relaxed shadow-xs break-words overflow-hidden",
                  msg.sender === "user"
                    ? "bg-gradient-to-r from-[#635BFF] to-[#8B5CF6] text-white rounded-br-[4px]"
                    : "bg-white border border-[#E8E5F2] text-[#172033] rounded-bl-[4px]"
                )}
              >
                {/* Render Markdown formatted text */}
                <RenderChatContent
                  content={msg.text}
                  isUser={msg.sender === "user"}
                  isTypingEffect={msg.isTypingEffect}
                />

                {/* INLINE RECOMMENDED JOBS (Clickable to Job Details Screen) */}
                {!msg.isTypingEffect && msg.recommendedJobs && msg.recommendedJobs.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-[#E8E5F2] space-y-2">
                    <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-[#635BFF]">
                      <Briefcase className="w-3.5 h-3.5 shrink-0" />
                      <span>Recommended Jobs in Pathly:</span>
                    </div>

                    <div className="space-y-1.5">
                      {msg.recommendedJobs.map((job) => (
                        <div
                          key={job.id}
                          className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-2 hover:border-[#635BFF] hover:bg-[#EEF2FF]/40 transition-all cursor-pointer"
                          onClick={() => onSelectJob?.(job.id)}
                        >
                          <div className="flex items-start justify-between gap-1.5">
                            <div className="min-w-0 flex-1">
                              <h4 className="font-bold text-[11.5px] text-[#1E293B] truncate">
                                {job.title}
                              </h4>
                              <p className="text-[10px] text-[#64748B] truncate">
                                {job.companyOrOrg} · {job.location}
                              </p>
                            </div>
                            <span className="text-[9.5px] font-extrabold text-[#059669] bg-[#D1FAE5] px-1.5 py-0.5 rounded-full border border-[#A7F3D0] whitespace-nowrap shrink-0">
                              {job.matchScore}%
                            </span>
                          </div>

                          <div className="mt-1.5 flex items-center justify-between text-[10px] pt-1 border-t border-[#E2E8F0]">
                            <span className="font-semibold text-[#334155] truncate">
                              {job.salaryOrScale}
                            </span>
                            <span className="text-[#635BFF] font-bold flex items-center gap-0.5 shrink-0">
                              View <ArrowRight className="w-3 h-3" />
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* INLINE RECOMMENDED COURSES (Clickable to Course Details Screen) */}
                {!msg.isTypingEffect && msg.recommendedCourses && msg.recommendedCourses.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-[#E8E5F2] space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-[#0284C7]">
                      <BookOpen className="w-3.5 h-3.5 shrink-0" />
                      <span>Recommended Course:</span>
                    </div>

                    {msg.recommendedCourses.slice(0, 1).map((course) => (
                      <div
                        key={course.id}
                        className="bg-[#F0F9FF] border border-[#BAE6FD] rounded-xl p-2 hover:border-[#0284C7] transition-all cursor-pointer"
                        onClick={() => onSelectCourse?.(course.id)}
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="min-w-0 flex-1">
                            <h4 className="font-bold text-[11px] text-[#0369A1] truncate">
                              {course.title}
                            </h4>
                            <p className="text-[9.5px] text-[#64748B] truncate">
                              {course.provider} · {course.duration}
                            </p>
                          </div>
                          <span className="text-[#0284C7] font-bold text-[10px] flex items-center gap-0.5 shrink-0">
                            Learn <ChevronRight className="w-3 h-3" />
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Response Action Bar (Copy Text & Feedback) */}
                {!msg.isTypingEffect && msg.sender === "ai" && (
                  <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-[#E4E7EC]/70 text-[10px] text-[#94A3B8]">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[#635BFF] text-[9.5px]">Pathly AI</span>
                      {/* Copy Text Button */}
                      <button
                        type="button"
                        onClick={() => handleCopyText(msg.id, msg.text)}
                        className={cn(
                          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] transition-all cursor-pointer",
                          copiedId === msg.id
                            ? "bg-[#D1FAE5] text-[#059669] font-medium"
                            : "hover:bg-[#F1F5F9] text-[#64748B] hover:text-[#1E293B]"
                        )}
                        title={copiedId === msg.id ? "Copied!" : "Copy response"}
                      >
                        {copiedId === msg.id ? (
                          <>
                            <Check className="w-3 h-3 text-[#059669]" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>

                    {msg.id !== "welcome" && (
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => handleFeedback(msg.id, "up")}
                          className={cn(
                            "p-1 rounded-full transition-colors",
                            msg.feedback === "up"
                              ? "bg-[#DCFCE7] text-[#15803D]"
                              : "hover:text-[#667085] hover:bg-slate-100"
                          )}
                          title="Helpful"
                        >
                          <ThumbsUp className="w-2.5 h-2.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleFeedback(msg.id, "down")}
                          className={cn(
                            "p-1 rounded-full transition-colors",
                            msg.feedback === "down"
                              ? "bg-[#FEE2E2] text-[#DC2626]"
                              : "hover:text-[#667085] hover:bg-slate-100"
                          )}
                          title="Not helpful"
                        >
                          <ThumbsDown className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Thinking indicator */}
        {isThinking && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-start pl-1"
          >
            <div className="bg-white border border-[#E8E5F2] rounded-[18px] rounded-bl-[4px] px-3.5 py-2.5 shadow-xs flex items-center gap-2">
              <div className="w-4.5 h-4.5 rounded-full bg-[#635BFF]/10 flex items-center justify-center">
                <Sparkles className="w-3 h-3 text-[#635BFF] animate-pulse" />
              </div>
              <span className="text-[11px] font-medium text-[#475569]">
                Pathly AI is thinking...
              </span>
              <div className="flex items-center gap-0.5 ml-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#635BFF] animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-1.5 h-1.5 rounded-full bg-[#635BFF] animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-1.5 h-1.5 rounded-full bg-[#635BFF] animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </motion.div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Sticky Bottom Input Bar */}
      <div className="shrink-0 bg-white border-t border-[#E8E5F2] px-3 sm:px-4 pt-2.5 pb-2 shadow-md">
        <div className="flex items-center gap-2 max-w-full">
          <div className="flex-1 min-w-0 relative">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={`Ask about jobs, skills, or your ${userProfile.readinessScore}% score...`}
              disabled={isTyping}
              className="w-full h-[40px] px-3.5 rounded-full bg-[#F1F5F9] border border-[#E4E7EC] text-[12px] sm:text-[12.5px] text-[#172033] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#635BFF] focus:ring-2 focus:ring-[#635BFF]/15 transition-all disabled:opacity-60"
            />
          </div>

          <button
            type="button"
            onClick={() => handleSend()}
            disabled={!inputValue.trim() || isTyping}
            className="w-[40px] h-[40px] shrink-0 rounded-full bg-gradient-to-r from-[#635BFF] to-[#8B5CF6] text-white flex items-center justify-center shadow-md shadow-[#635BFF]/25 hover:shadow-lg hover:shadow-[#635BFF]/35 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send className="w-3.5 h-3.5 ml-0.5" />
          </button>
        </div>

        {/* AI Disclaimer */}
        <div className="pt-1.5 pb-0.5">
          <div className="flex items-center gap-1 text-[9px] text-[#94A3B8] justify-center text-center truncate">
            <AlertCircle className="w-2.5 h-2.5 shrink-0" />
            <span className="truncate">Dual AI Engine · Groq Qwen (Fast Career) & Google Gemini Flash (Advanced Guidance)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Markdown Renderer Component for AI Responses with ChatGPT Typing Cursor
// ============================================================================
function RenderChatContent({
  content,
  isUser,
  isTypingEffect = false,
}: {
  content: string;
  isUser: boolean;
  isTypingEffect?: boolean;
}) {
  if (isUser) {
    return <div className="whitespace-pre-line break-words">{content}</div>;
  }

  // If text hasn't arrived yet but typing indicator is live
  if (!content && isTypingEffect) {
    return (
      <div className="flex items-center min-h-[18px]">
        <span className="inline-block w-2 h-3.5 bg-[#635BFF] rounded-xs animate-pulse" />
      </div>
    );
  }

  const lines = content.split("\n");

  return (
    <div className="space-y-1.5 text-[12px] leading-relaxed break-words">
      {lines.map((line, idx) => {
        const isLastLine = idx === lines.length - 1;
        const trimmed = line.trim();

        if (!trimmed) {
          return (
            <div key={idx} className="h-1">
              {isLastLine && isTypingEffect && (
                <span className="inline-block w-2 h-3.5 bg-[#635BFF] rounded-xs animate-pulse align-middle" />
              )}
            </div>
          );
        }

        // Header 3
        if (trimmed.startsWith("### ")) {
          return (
            <h4 key={idx} className="font-bold text-[12.5px] sm:text-[13px] text-[#0F172A] mt-2 mb-1">
              {formatInline(trimmed.replace(/^###\s+/, ""))}
              {isLastLine && isTypingEffect && (
                <span className="inline-block w-2 h-3.5 bg-[#635BFF] ml-1 rounded-xs animate-pulse align-middle" />
              )}
            </h4>
          );
        }

        // Header 2 or 1
        if (trimmed.startsWith("## ") || trimmed.startsWith("# ")) {
          return (
            <h3 key={idx} className="font-extrabold text-[13px] sm:text-[13.5px] text-[#0F172A] mt-2 mb-1">
              {formatInline(trimmed.replace(/^#+\s+/, ""))}
              {isLastLine && isTypingEffect && (
                <span className="inline-block w-2 h-3.5 bg-[#635BFF] ml-1 rounded-xs animate-pulse align-middle" />
              )}
            </h3>
          );
        }

        // Bullet point
        if (trimmed.startsWith("- ") || trimmed.startsWith("• ") || trimmed.startsWith("* ")) {
          const itemText = trimmed.replace(/^[-•*]\s+/, "");
          return (
            <div key={idx} className="flex items-start gap-1.5 pl-0.5">
              <span className="text-[#635BFF] font-bold text-[12px] leading-none mt-1 shrink-0">•</span>
              <div className="flex-1 min-w-0">
                {formatInline(itemText)}
                {isLastLine && isTypingEffect && (
                  <span className="inline-block w-2 h-3.5 bg-[#635BFF] ml-1 rounded-xs animate-pulse align-middle" />
                )}
              </div>
            </div>
          );
        }

        // Numbered list item (e.g. 1. 2. 3.)
        const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
        if (numMatch) {
          return (
            <div key={idx} className="flex items-start gap-1.5 pl-0.5">
              <span className="font-bold text-[#635BFF] text-[11px] min-w-[14px] shrink-0">
                {numMatch[1]}.
              </span>
              <div className="flex-1 min-w-0">
                {formatInline(numMatch[2])}
                {isLastLine && isTypingEffect && (
                  <span className="inline-block w-2 h-3.5 bg-[#635BFF] ml-1 rounded-xs animate-pulse align-middle" />
                )}
              </div>
            </div>
          );
        }

        // Normal paragraph
        return (
          <p key={idx}>
            {formatInline(trimmed)}
            {isLastLine && isTypingEffect && (
              <span className="inline-block w-2 h-3.5 bg-[#635BFF] ml-1 rounded-xs animate-pulse align-middle" />
            )}
          </p>
        );
      })}
    </div>
  );
}

// Inline parser for bold (**text**) and italic (*text*)
function formatInline(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g);

  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-bold text-[#0F172A]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}
