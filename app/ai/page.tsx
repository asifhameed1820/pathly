"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { AiCoachScreen } from "@/components/screens/AiCoachScreen";

export default function AiPage() {
  const router = useRouter();

  return (
    <div className="w-full h-screen bg-[#FAF9FF]">
      <AiCoachScreen
        onBack={() => router.back()}
        onSelectJob={(jobId) => router.push(`/dashboard?job=${jobId}`)}
        onSelectCourse={(courseId) => router.push(`/dashboard?course=${courseId}`)}
      />
    </div>
  );
}
