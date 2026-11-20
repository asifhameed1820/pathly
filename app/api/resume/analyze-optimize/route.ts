import { NextRequest, NextResponse } from "next/server";
import { validateDocument, optimizeResumeWithGemini } from "@/lib/resumeService";

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    let rawText = "";
    let targetJobDescription = "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      targetJobDescription = (formData.get("targetJobDescription") as string) || "";

      if (!file) {
        return NextResponse.json(
          {
            error: "No file provided. Please upload a PDF or DOCX resume.",
          },
          { status: 400 }
        );
      }

      const fileName = file.name || "uploaded_resume";
      const fileType = file.type || "";
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // 1. Strict Document Validation
      const validation = await validateDocument(buffer, fileName, fileType);

      if (!validation.isValid) {
        return NextResponse.json(
          {
            error: validation.error || "This document does not appear to be a resume. Please upload a valid resume.",
            documentType: validation.documentType,
            reason: validation.reason,
            isResume: false,
          },
          { status: 400 }
        );
      }

      rawText = validation.extractedText || "";
    } else {
      const body = await req.json();
      rawText = body.rawText || "";
      targetJobDescription = body.targetJobDescription || "";

      if (!rawText || rawText.trim().length < 50) {
        return NextResponse.json(
          {
            error: "We couldn't extract readable content. Please upload another file.",
            isResume: false,
          },
          { status: 400 }
        );
      }
    }

    // 2. Perform Real AI Optimization with Gemini
    const result = await optimizeResumeWithGemini(rawText, targetJobDescription);

    return NextResponse.json({
      success: true,
      originalResume: result.originalResume,
      optimizedResume: result.optimizedResume,
      comparison: result.comparison,
    });
  } catch (err: any) {
    console.error("[Resume Analyze/Optimize API] Error:", err);
    return NextResponse.json(
      {
        error: err?.message || "Failed to analyze and optimize resume.",
      },
      { status: 500 }
    );
  }
}
