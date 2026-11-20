import { NextRequest, NextResponse } from "next/server";
import {
  ResumeStructuredData,
  generateDocxResumeBuffer,
  generatePdfResumeBuffer,
} from "@/lib/resumeService";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const resumeData = (body.resumeData || body.resume) as ResumeStructuredData;
    const format = (body.format || "pdf").toLowerCase();

    if (!resumeData || !resumeData.contact) {
      return NextResponse.json({ error: "Invalid resume data provided." }, { status: 400 });
    }

    const candidateName = (resumeData.contact.fullName || "Resume")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .trim();

    if (format === "docx") {
      const docxBuffer = await generateDocxResumeBuffer(resumeData);
      const filename = `${candidateName}_Optimized_Resume.docx`;

      return new NextResponse(new Uint8Array(docxBuffer), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    // Default: PDF
    const pdfBuffer = generatePdfResumeBuffer(resumeData);
    const filename = `${candidateName}_Optimized_Resume.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error("[Resume Export API] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to generate document export." },
      { status: 500 }
    );
  }
}
