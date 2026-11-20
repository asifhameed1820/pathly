"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home,
  BriefcaseBusiness,
  BookOpen,
  Sparkles,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type NavTabId = "home" | "jobs" | "learn" | "ai" | "profile";

interface BottomNavProps {
  activeTab: NavTabId;
  onTabChange: (tab: NavTabId) => void;
  className?: string;
}

const NAV_ITEMS: { id: NavTabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "jobs", label: "Jobs", icon: BriefcaseBusiness },
  { id: "learn", label: "Learn", icon: BookOpen },
  { id: "ai", label: "AI", icon: Sparkles },
  { id: "profile", label: "Profile", icon: User },
];

export function BottomNav({ activeTab, onTabChange, className }: BottomNavProps) {
  const [aiClickCount, setAiClickCount] = useState(0);

  const handleTabClick = (tabId: NavTabId) => {
    if (tabId === "ai") {
      setAiClickCount((prev) => prev + 1);
    }
    onTabChange(tabId);
  };

  return (
    <nav
      className={cn(
        "sticky bottom-0 z-40 w-full bg-white/95 backdrop-blur-lg border-t border-[#E8E5F2] px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] select-none",
        className
      )}
    >
      <div className="flex items-center justify-around max-w-md mx-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const isAi = item.id === "ai";

          return (
            <motion.button
              key={item.id}
              type="button"
              whileTap={{ scale: 0.88 }}
              onClick={() => handleTabClick(item.id)}
              className={cn(
                "relative flex flex-col items-center gap-0.5 px-3 py-1 min-w-[52px] rounded-xl transition-colors duration-200 cursor-pointer",
                isActive
                  ? isAi
                    ? "text-[#635BFF]"
                    : "text-[#635BFF]"
                  : "text-[#94A3B8] hover:text-[#64748B]"
              )}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
            >
              {/* Special Theme Aura for AI Button when Active */}
              {isAi && isActive && (
                <motion.div
                  layoutId="ai-nav-halo"
                  className="absolute -inset-1 rounded-2xl bg-gradient-to-tr from-[#635BFF]/15 via-[#8B5CF6]/20 to-[#A855F7]/15 blur-[2px] pointer-events-none"
                  transition={{ type: "spring", stiffness: 350, damping: 25 }}
                />
              )}

              {/* Dynamic Ripple Effect when User Clicks AI Button */}
              {isAi && (
                <AnimatePresence>
                  {aiClickCount > 0 && (
                    <motion.span
                      key={`ai-ripple-${aiClickCount}`}
                      className="absolute inset-0 m-auto w-8 h-8 rounded-full bg-gradient-to-r from-[#635BFF]/35 to-[#8B5CF6]/35 pointer-events-none"
                      initial={{ scale: 0.5, opacity: 0.85 }}
                      animate={{ scale: 2.3, opacity: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                    />
                  )}
                </AnimatePresence>
              )}

              <div className="relative">
                {/* AI Sparkle Icon Transition Animation */}
                {isAi ? (
                  <motion.div
                    key={`ai-sparkle-${aiClickCount}`}
                    animate={
                      isActive
                        ? {
                            rotate: [0, -16, 16, -6, 0],
                            scale: [1, 1.25, 0.95, 1],
                          }
                        : { rotate: 0, scale: 1 }
                    }
                    transition={{ duration: 0.45, ease: "easeOut" }}
                  >
                    <Icon
                      className={cn(
                        "w-[22px] h-[22px] transition-all duration-200",
                        isActive
                          ? "stroke-[2.2] text-[#635BFF] drop-shadow-[0_2px_8px_rgba(99,91,255,0.4)]"
                          : "stroke-[1.6]"
                      )}
                    />
                  </motion.div>
                ) : (
                  <Icon
                    className={cn(
                      "w-[22px] h-[22px] transition-all duration-200",
                      isActive ? "stroke-[2.2]" : "stroke-[1.6]"
                    )}
                  />
                )}

                {/* Active Indicator Dot */}
                {isActive && (
                  <motion.div
                    layoutId="nav-dot"
                    className={cn(
                      "absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full",
                      isAi
                        ? "bg-gradient-to-r from-[#635BFF] to-[#8B5CF6] shadow-xs shadow-[#635BFF]/60"
                        : "bg-[#635BFF]"
                    )}
                    transition={{ type: "spring", stiffness: 450, damping: 28 }}
                  />
                )}
              </div>

              <span
                className={cn(
                  "text-[10px] leading-none transition-all duration-200",
                  isActive
                    ? isAi
                      ? "font-extrabold bg-gradient-to-r from-[#635BFF] to-[#8B5CF6] bg-clip-text text-transparent"
                      : "font-bold"
                    : "font-medium"
                )}
              >
                {item.label}
              </span>
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
}
