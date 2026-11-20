import { NextRequest, NextResponse } from "next/server";
import { validateDocument } from "@/lib/resumeService";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        {
          isResume: false,
          documentType: "unknown",
          confidence: 0,
          reason: "No file was provided in the upload request.",
          error: "Please select a file to upload.",
        },
        { status: 400 }
      );
    }

    const fileName = file.name || "uploaded_document";
    const fileType = file.type || "";

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Run comprehensive validation (magic bytes, PDF/DOCX only, text extraction, Gemini classification)
    const result = await validateDocument(buffer, fileName, fileType);

    return NextResponse.json({
      isResume: result.isValid,
      documentType: result.documentType,
      confidence: result.confidence,
      reason: result.reason,
      error: result.error,
      extractedTextLength: result.extractedText ? result.extractedText.length : 0,
    });
  } catch (error: any) {
    console.error("[Resume Validate API] Error:", error);
    return NextResponse.json(
      {
        isResume: false,
        documentType: "error",
        confidence: 0,
        reason: error?.message || "Failed to process document.",
        error: "We couldn't extract readable content. Please upload another file.",
      },
      { status: 500 }
    );
  }
}
