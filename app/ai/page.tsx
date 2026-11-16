"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { AiCoachScreen } from "@/components/screens/AiCoachScreen";

export default function AiChatPage() {
  const router = useRouter();

  return (
    <div className="w-full min-h-screen bg-[#FAF9FF] flex justify-center">
      <div className="w-full max-w-[430px] min-h-screen bg-white shadow-lg flex flex-col">
        <AiCoachScreen
          onBack={() => router.back()}
          onNavigateToTab={(tab) => {
            if (tab === "home") router.push("/dashboard");
            else router.push(`/dashboard?tab=${tab}`);
          }}
        />
      </div>
    </div>
  );
}
