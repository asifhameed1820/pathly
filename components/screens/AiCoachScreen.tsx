"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Sparkles,
  Send,
  Square,
  Copy,
  Check,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
  Plus,
  Trash2,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  MessageSquare,
  Compass,
  Code2,
  Briefcase,
  GraduationCap,
  ArrowRight,
  User,
  Clock,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  loadUserProfile,
  saveUserProfile,
  UserProfileContext,
  DEFAULT_USER_PROFILE,
} from "@/lib/userProfile";
import { ChatMarkdownRenderer } from "@/components/ai-chat/ChatMarkdownRenderer";
import { ChatSettingsModal } from "@/components/ai-chat/ChatSettingsModal";
import { ChatMarkdownRenderer } from "@/components/ai-chat/ChatMarkdownRenderer";

export interface ChatMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
  timestamp: Date;
  isStreaming?: boolean;
  feedback?: "up" | "down" | null;
}

export interface ConversationSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: {
    id: string;
    sender: "user" | "ai";
    text: string;
    timestamp: string;
    feedback?: "up" | "down" | null;
  }[];
}

interface AiCoachScreenProps {
  onBack?: () => void;
  onSelectJob?: (jobId: string) => void;
  onSelectCourse?: (courseId: string) => void;
  onNavigateToTab?: (tab: "home" | "jobs" | "learn" | "ai" | "profile") => void;
}

const STORAGE_CONVERSATIONS_KEY = "pathly_ai_conversations_v2";
const STORAGE_ACTIVE_ID_KEY = "pathly_ai_active_conv_id_v2";

const SUGGESTED_STARTERS = [
  {
    icon: Code2,
    title: "Technical Explanations",
    prompt: "Explain how React Server Components work and when to use them.",
  },
  {
    icon: Briefcase,
    title: "Job Opportunities",
    prompt: "Find genuine Frontend Developer openings in Chennai or Bangalore.",
  },
  {
    icon: GraduationCap,
    title: "Career Transition",
    prompt: "What skills should I learn to transition from Frontend into Full Stack AI development?",
  },
  {
    icon: Compass,
    title: "Interview Preparation",
    prompt: "Conduct a realistic mock interview for a Frontend Engineer position.",
  },
];

export function AiCoachScreen({
  onBack,
  onSelectJob,
  onSelectCourse,
  onNavigateToTab,
}: AiCoachScreenProps) {
  const [userProfile, setUserProfile] = useState<UserProfileContext>(DEFAULT_USER_PROFILE);
  const [conversations, setConversations] = useState<ConversationSession[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 1. Load User Profile and Conversations from localStorage
  useEffect(() => {
    setUserProfile(loadUserProfile());

    try {
      const savedConvs = localStorage.getItem(STORAGE_CONVERSATIONS_KEY);
      if (savedConvs) {
        const parsed: ConversationSession[] = JSON.parse(savedConvs);
        setConversations(parsed);

        const savedActiveId = localStorage.getItem(STORAGE_ACTIVE_ID_KEY);
        const active = parsed.find((c) => c.id === savedActiveId) || parsed[0];
        if (active) {
          setActiveConversationId(active.id);
          setMessages(
            active.messages.map((m) => ({
              ...m,
              timestamp: new Date(m.timestamp),
            }))
          );
        }
      }
    } catch (e) {
      console.error("Failed to load saved conversations", e);
    }
  }, []);

  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // 3. Auto-expand textarea height
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const nextHeight = Math.min(el.scrollHeight, 180);
    el.style.height = `${Math.max(44, nextHeight)}px`;
  }, [inputValue]);

  // 4. Save active conversation whenever messages change (and generation is idle)
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping, streamingMessageId]);

    try {
      const convId = activeConversationId || "conv-" + Date.now();
      const firstUserMsg = messages.find((m) => m.sender === "user")?.text || "New Conversation";
      const derivedTitle =
        firstUserMsg.length > 38 ? firstUserMsg.slice(0, 38).trim() + "..." : firstUserMsg;

      const serializedMessages = messages.map((m) => ({
        id: m.id,
        sender: m.sender,
        text: m.text,
        timestamp: m.timestamp.toISOString(),
        feedback: m.feedback,
      }));

      setConversations((prev) => {
        const existingIdx = prev.findIndex((c) => c.id === convId);
        let updatedList: ConversationSession[];
        if (existingIdx >= 0) {
          updatedList = [...prev];
          updatedList[existingIdx] = {
            ...updatedList[existingIdx],
            title: updatedList[existingIdx].title || derivedTitle,
            updatedAt: new Date().toISOString(),
            messages: serializedMessages,
          };
        } else {
          updatedList = [
            {
              id: convId,
              title: derivedTitle,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              messages: serializedMessages,
            },
            ...prev,
          ];
        }
        localStorage.setItem(STORAGE_CONVERSATIONS_KEY, JSON.stringify(updatedList));
        return updatedList;
      });

      if (!activeConversationId) {
        setActiveConversationId(convId);
        localStorage.setItem(STORAGE_ACTIVE_ID_KEY, convId);
      }
    } catch (e) {
      console.error("Failed to persist conversation", e);
    }
  }, [messages, isGenerating, activeConversationId]);

  // Create a new blank conversation
  const handleNewChat = () => {
    if (isGenerating && abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsGenerating(false);
    setCurrentStatus(null);
    setMessages([]);
    const newId = "conv-" + Date.now();
    setActiveConversationId(newId);
    localStorage.setItem(STORAGE_ACTIVE_ID_KEY, newId);
    setInputValue("");
    setIsSidebarOpen(false);
  };

  // Switch to an existing conversation
  const handleSelectConversation = (conv: ConversationSession) => {
    if (isGenerating && abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsGenerating(false);
    setCurrentStatus(null);
    setActiveConversationId(conv.id);
    localStorage.setItem(STORAGE_ACTIVE_ID_KEY, conv.id);
    setMessages(
      conv.messages.map((m) => ({
        ...m,
        timestamp: new Date(m.timestamp),
      }))
    );
    setIsSidebarOpen(false);
  };

  // Delete a conversation
  const handleDeleteConversation = (e: React.MouseEvent, convId: string) => {
    e.stopPropagation();
    const updated = conversations.filter((c) => c.id !== convId);
    setConversations(updated);
    localStorage.setItem(STORAGE_CONVERSATIONS_KEY, JSON.stringify(updated));

    if (activeConversationId === convId) {
      if (updated.length > 0) {
        handleSelectConversation(updated[0]);
      } else {
        handleNewChat();
      }
    }
  };

  // Clear all conversations
  const handleClearAllHistory = () => {
    localStorage.removeItem(STORAGE_CONVERSATIONS_KEY);
    localStorage.removeItem(STORAGE_ACTIVE_ID_KEY);
    setConversations([]);
    handleNewChat();
  };

  // Send message and stream response from Groq
  const handleSend = async (overridePrompt?: string) => {
    const textToSend = (overridePrompt || inputValue).trim();
    if (!textToSend || isGenerating) return;

    const userMsgId = "user-" + Date.now();
    const aiMsgId = "ai-" + (Date.now() + 1);

    const newUserMessage: ChatMessage = {
      id: userMsgId,
      sender: "user",
      text: textToSend,
      timestamp: new Date(),
    };

    const aiMsgId = `ai-${Date.now()}`;
    const initialAiMsg: ChatMessage = {
      id: aiMsgId,
      sender: "ai",
      text: "",
      timestamp: new Date(),
      recommendedJobs: [],
      recommendedCourses: [],
    };

    setMessages((prev) => [...prev, userMsg, initialAiMsg]);
    setInputValue("");
    setIsGenerating(true);
    setCurrentStatus("Thinking...");
    setStreamingMessageId(aiMsgId);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const historyPayload = messages.map((m) => ({ sender: m.sender, text: m.text }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msgText,
          history: messages.slice(-16).map((m) => ({
            sender: m.sender,
            text: m.text,
          })),
          userProfile,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text();
        let message = `API Error (${res.status})`;
        try {
          const errObj = JSON.parse(errorText);
          message = errObj.error || message;
        } catch { }
        throw new Error(message);
      }

      const contentType = response.headers.get("Content-Type") || "";

      // Check if real-time streaming response
      if (contentType.includes("text/event-stream") && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulatedText = "";
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed.startsWith("data: ")) continue;
            const dataStr = trimmed.slice(6);

            try {
              const event = JSON.parse(dataStr);
              if (event.type === "meta") {
                if (event.updatedProfile) {
                  setUserProfile(event.updatedProfile);
                  saveUserProfile(event.updatedProfile);
                }
                if (
                  event.suggestedFollowUps &&
                  Array.isArray(event.suggestedFollowUps) &&
                  event.suggestedFollowUps.length > 0
                ) {
                  setSuggestedPrompts(event.suggestedFollowUps);
                }
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === aiMsgId
                      ? {
                          ...m,
                          recommendedJobs: event.recommendedJobs || m.recommendedJobs,
                          recommendedCourses: event.recommendedCourses || m.recommendedCourses,
                        }
                      : m
                  )
                );
              } else if (event.type === "token" && event.content) {
                accumulatedText += event.content;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === aiMsgId ? { ...m, text: accumulatedText } : m
                  )
                );
              } else if (event.type === "done") {
                break;
              }
            } catch {
              // Ignore partial JSON chunks
            }
          }
        }
      } else {
        // Fallback for standard JSON response
        const data = await response.json();
        if (data.updatedProfile) {
          setUserProfile(data.updatedProfile);
          saveUserProfile(data.updatedProfile);
        }
        if (data.suggestedFollowUps && Array.isArray(data.suggestedFollowUps)) {
          setSuggestedPrompts(data.suggestedFollowUps);
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? {
                  ...m,
                  text: data.response || "I have analyzed your request.",
                  recommendedJobs: data.recommendedJobs || [],
                  recommendedCourses: data.recommendedCourses || [],
                }
              : m
          )
        );
      }
    } catch (err) {
      console.error("Chat error:", err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsgId
            ? {
                ...m,
                text:
                  m.text.trim() ||
                  `I apologize, but I encountered a momentary connection issue. Please feel free to ask again!`,
              }
            : m
        )
      );
    } finally {
      setIsGenerating(false);
      setCurrentStatus(null);
      abortControllerRef.current = null;
      setMessages((prev) =>
        prev.map((m) => (m.id === aiMsgId ? { ...m, isStreaming: false } : m))
      );
      setStreamingMessageId(null);
    }
  };

  // Stop Generation
  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
    setCurrentStatus(null);
    setMessages((prev) => prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m)));
  };

  // Regenerate last AI response
  const handleRegenerate = () => {
    if (isGenerating) return;
    const lastUserMsg = [...messages].reverse().find((m) => m.sender === "user");
    if (!lastUserMsg) return;

    // Remove the last AI response from UI
    setMessages((prev) => {
      const copy = [...prev];
      if (copy[copy.length - 1]?.sender === "ai") {
        copy.pop();
      }
      return copy;
    });

    handleSend(lastUserMsg.text);
  };

  // Copy message text
  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (e) {
      console.error("Failed to copy text", e);
    }
  };

  // Feedback up/down
  const handleFeedback = (id: string, direction: "up" | "down") => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, feedback: m.feedback === direction ? null : direction } : m
      )
    );
  };

  // Keydown handler: Enter to send, Shift+Enter for newline
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const activeConvTitle =
    conversations.find((c) => c.id === activeConversationId)?.title || "New Conversation";

  return (
    <div className="flex h-full w-full bg-[#F8FAFC] text-slate-800 overflow-hidden relative font-sans">
      {/* ===================================================================== */}
      {/* 1. MINIMAL NAVIGATION SIDEBAR (Collapsible / Slide-over on mobile)   */}
      {/* ===================================================================== */}
      {/* Mobile Backdrop */}
      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-slate-900/30 backdrop-blur-xs z-30 md:hidden"
        />
      )}

      <aside
        className={cn(
          "bg-white border-r border-slate-200/90 flex flex-col z-40 transition-all duration-200 ease-in-out",
          // Desktop behavior
          "hidden md:flex md:w-[260px] md:static md:translate-x-0 shrink-0",
          // Mobile drawer behavior
          isSidebarOpen && "!flex fixed inset-y-0 left-0 w-[280px] shadow-2xl"
        )}
      >
        {/* Brand & New Chat */}
        <div className="p-3.5 border-b border-slate-100 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs">
                <Sparkles className="w-4 h-4" />
              </div>
              <span className="font-bold text-[14.5px] text-slate-900 tracking-tight">
                Pathly AI
              </span>
            </div>

            <button
              onClick={() => setIsSidebarOpen(false)}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 md:hidden"
              title="Close sidebar"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={handleNewChat}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-xs hover:border-slate-300 transition-all"
          >
            <Plus className="w-3.5 h-3.5 text-blue-600" />
            <span>New Chat</span>
          </button>
        </div>

        {/* Conversation History List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <div className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            Recent Chats
          </div>

          {conversations.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-slate-400">
              No previous chats yet
            </div>
          ) : (
            conversations.map((conv) => {
              const isActive = conv.id === activeConversationId;
              return (
                <div
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv)}
                  className={cn(
                    "group flex items-center justify-between px-2.5 py-2 rounded-lg text-xs cursor-pointer transition-all",
                    isActive
                      ? "bg-blue-50/80 text-blue-900 font-medium"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  )}
                >
                  <div className="flex items-center gap-2 overflow-hidden pr-1">
                    <MessageSquare
                      className={cn(
                        "w-3.5 h-3.5 shrink-0",
                        isActive ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600"
                      )}
                    />
                    <span className="truncate">{conv.title || "Conversation"}</span>
                  </div>

                  <button
                    onClick={(e) => handleDeleteConversation(e, conv.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-600 rounded transition-opacity"
                    title="Delete chat"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Profile Card & Settings in Sidebar Footer */}
        <div className="p-3 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-semibold text-xs flex items-center justify-center shrink-0">
              {userProfile.fullName ? userProfile.fullName[0] : "P"}
            </div>
            <div className="overflow-hidden">
              <div className="text-xs font-semibold text-slate-800 truncate">
                {userProfile.fullName}
              </div>
              <div className="text-[10px] text-slate-400 truncate">
                {userProfile.interests[0] || "Career Mode"}
              </div>
            </div>
          </div>

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-colors shrink-0"
            title="Chatbot & Profile Settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </aside>

      {/* ===================================================================== */}
      {/* 2. CENTRAL CHAT CONTAINER                                            */}
      {/* ===================================================================== */}
      <main className="flex-1 flex flex-col h-full bg-[#F8FAFC] overflow-hidden relative">
        {/* Top Navbar */}
        <header className="h-12 border-b border-slate-200/80 bg-white/90 backdrop-blur-xs px-3.5 flex items-center justify-between shrink-0 z-20">
          <div className="flex items-center gap-2 overflow-hidden">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
              title="Toggle sidebar"
            >
              {isSidebarOpen ? (
                <PanelLeftClose className="w-4 h-4" />
              ) : (
                <PanelLeftOpen className="w-4 h-4" />
              )}
            >
              <div
                className={cn(
                  "max-w-[90%] rounded-[18px] px-4 py-3 text-[12.5px] leading-relaxed shadow-sm",
                  msg.sender === "user"
                    ? "bg-gradient-to-r from-[#635BFF] to-[#8B5CF6] text-white rounded-br-[4px]"
                    : "bg-white border border-[#E8E5F2] text-[#172033] rounded-bl-[4px]"
                )}
              >
                {/* Render Markdown formatted text */}
                <ChatMarkdownRenderer
                  content={msg.text}
                  isUser={msg.sender === "user"}
                  isStreaming={streamingMessageId === msg.id}
                />

            <span className="text-xs font-semibold text-slate-800 truncate max-w-[200px] sm:max-w-xs">
              {activeConvTitle}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Live Model Badge */}
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-100">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Groq · Qwen
            </span>

            <button
              onClick={handleNewChat}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
              title="New Chat"
            >
              <Plus className="w-4 h-4" />
            </button>

            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 space-y-5">
          <div className="max-w-3xl mx-auto w-full">
            {messages.length === 0 ? (
              /* Professional Welcoming Hero / Starter Prompts */
              <div className="py-8 sm:py-14 flex flex-col items-center text-center animate-in fade-in duration-200">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 mb-4">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  How can I help your career today?
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 max-w-md mt-1.5 mb-8">
                  Ask me anything about interview prep, technical concepts, coding, career transitions,
                  or live openings.
                </p>

                {/* 4 Clean Prompt Starter Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full text-left">
                  {SUGGESTED_STARTERS.map((s, idx) => {
                    const IconComp = s.icon;
                    return (
                      <button
                        key={idx}
                        onClick={() => handleSend(s.prompt)}
                        className="p-3.5 rounded-xl border border-slate-200/90 bg-white hover:border-blue-400 hover:bg-blue-50/30 transition-all text-left shadow-xs group"
                      >
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 mb-1">
                          <IconComp className="w-3.5 h-3.5 text-blue-600" />
                          <span>{s.title}</span>
                          <ArrowRight className="w-3 h-3 text-slate-300 ml-auto group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" />
                        </div>
                        <p className="text-[12px] text-slate-500 leading-relaxed">
                          {s.prompt}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Message Flow */
              <div className="space-y-6">
                {messages.map((msg) => {
                  const isUser = msg.sender === "user";

                  return (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex gap-3 text-sm",
                        isUser ? "justify-end" : "justify-start"
                      )}
                    >
                      {/* AI Avatar */}
                      {!isUser && (
                        <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs shrink-0 mt-0.5">
                          <Sparkles className="w-3.5 h-3.5" />
                        </div>
                      )}

                      {/* Content Bubble */}
                      <div
                        className={cn(
                          "flex flex-col",
                          isUser ? "items-end max-w-[85%] sm:max-w-[75%]" : "items-start w-full max-w-[92%]"
                        )}
                      >
                        {isUser ? (
                          <div className="bg-slate-900 text-white px-4 py-2.5 rounded-2xl rounded-tr-xs text-[13.5px] leading-relaxed shadow-xs">
                            {msg.text}
                          </div>
                        ) : (
                          <div className="w-full bg-white rounded-2xl rounded-tl-xs border border-slate-200/80 px-4 sm:px-5 py-4 shadow-xs">
                            {/* Loading Status Indicator */}
                            {msg.isStreaming && !msg.text && currentStatus && (
                              <div className="flex items-center gap-2 py-1 text-xs text-blue-700 font-medium">
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                                <span>{currentStatus}</span>
                              </div>
                            )}

        {/* Typing indicator (shown before first token streams) */}
        {isTyping && !messages.find((m) => m.id === streamingMessageId)?.text && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-start"
          >
            <div className="bg-white border border-[#E8E5F2] rounded-[18px] rounded-bl-[4px] px-4 py-3 shadow-sm flex items-center gap-2">
              <span className="text-[11px] font-medium text-[#64748B]">Pathly AI is thinking...</span>
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-[#635BFF] animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-1.5 h-1.5 rounded-full bg-[#635BFF] animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-1.5 h-1.5 rounded-full bg-[#635BFF] animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </motion.div>
        )}

                            {/* Response Actions (Requirement 5) */}
                            {!msg.isStreaming && msg.text && (
                              <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-slate-400">
                                {/* Copy */}
                                <button
                                  onClick={() => handleCopy(msg.id, msg.text)}
                                  className="flex items-center gap-1 px-2 py-1 rounded text-xs hover:text-slate-700 hover:bg-slate-100 transition-colors"
                                  title="Copy response"
                                >
                                  {copiedId === msg.id ? (
                                    <>
                                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                                      <span className="text-emerald-600 font-medium">Copied</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3.5 h-3.5" />
                                      <span>Copy</span>
                                    </>
                                  )}
                                </button>

                                {/* Regenerate */}
                                <button
                                  onClick={handleRegenerate}
                                  className="flex items-center gap-1 px-2 py-1 rounded text-xs hover:text-slate-700 hover:bg-slate-100 transition-colors"
                                  title="Regenerate answer"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  <span>Regenerate</span>
                                </button>

                                {/* Like */}
                                <button
                                  onClick={() => handleFeedback(msg.id, "up")}
                                  className={cn(
                                    "p-1.5 rounded transition-colors",
                                    msg.feedback === "up"
                                      ? "text-blue-600 bg-blue-50"
                                      : "hover:text-slate-700 hover:bg-slate-100"
                                  )}
                                  title="Good response"
                                >
                                  <ThumbsUp className="w-3.5 h-3.5" />
                                </button>

                                {/* Dislike */}
                                <button
                                  onClick={() => handleFeedback(msg.id, "down")}
                                  className={cn(
                                    "p-1.5 rounded transition-colors",
                                    msg.feedback === "down"
                                      ? "text-red-600 bg-red-50"
                                      : "hover:text-slate-700 hover:bg-slate-100"
                                  )}
                                  title="Bad response"
                                >
                                  <ThumbsDown className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* User Avatar */}
                      {isUser && (
                        <div className="w-7 h-7 rounded-lg bg-slate-900 flex items-center justify-center text-white text-xs font-semibold shadow-xs shrink-0 mt-0.5">
                          {userProfile.fullName ? userProfile.fullName[0] : "U"}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

