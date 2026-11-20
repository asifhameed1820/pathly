"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  Upload,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Download,
  Check,
  ChevronRight,
  ShieldCheck,
  Eye,
  TrendingUp,
  FileCheck,
  X,
  FileUp,
  Edit3,
  Save,
  Plus,
  Trash2,
  ExternalLink,
  Briefcase,
  GraduationCap,
  Award,
  Sliders,
  Copy,
  Layers,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  ResumeStructuredData,
  ResumeComparisonData,
  calculateAtsScore,
} from "@/lib/resumeTypes";

interface ResumeScreenProps {
  onNext: () => void;
  onBack?: () => void;
}

type ScreenMode = "upload" | "scanning" | "results";
type ResultTab = "preview" | "compare" | "edit";

const DEFAULT_RESUME_DATA: ResumeStructuredData = {
  contact: {
    fullName: "Alex Morgan",
    professionalTitle: "Frontend Software Engineer",
    email: "alex.morgan@email.com",
    phone: "+1 (555) 019-2834",
    location: "San Francisco, CA",
    githubUrl: "https://github.com/alexmorgan",
    portfolioUrl: "https://alexmorgan.dev",
    linkedinUrl: "https://linkedin.com/in/alexmorgan",
  },
  professionalSummary:
    "Performance-driven Frontend Software Engineer with 3+ years of experience engineering responsive web applications with React, Next.js, and TypeScript. Specializes in web performance, state management, and modern design systems.",
  technicalSkills: {
    languages: ["TypeScript", "JavaScript", "HTML5", "CSS3", "Python"],
    frameworks: ["React", "Next.js", "Tailwind CSS", "Redux Toolkit", "Node.js"],
    toolsAndCloud: ["Git", "Jest", "Vite", "Docker", "Webpack", "AWS S3"],
    other: ["REST APIs", "CI/CD", "Accessibility (WCAG)", "Responsive Design"],
  },
  experience: [
    {
      id: "exp-1",
      company: "TechCorp Global",
      role: "Frontend Engineer",
      duration: "2022 - Present",
      location: "San Francisco, CA",
      bullets: [
        "Architected enterprise dashboard components using Next.js App Router and TypeScript, reducing initial page load by 38%.",
        "Implemented global state management with Redux Toolkit and optimized client-side caching, supporting 50,000+ daily active users.",
        "Authored comprehensive unit and integration test suites with Jest and React Testing Library, achieving 88% code coverage.",
      ],
    },
    {
      id: "exp-2",
      company: "InnovateLabs",
      role: "Junior Web Developer",
      duration: "2021 - 2022",
      location: "San Jose, CA",
      bullets: [
        "Engineered 15+ responsive marketing landing pages using Tailwind CSS and React, improving mobile conversion rate by 22%.",
        "Collaborated with UX designers to develop reusable UI component libraries adhering to WCAG 2.1 AA accessibility guidelines.",
      ],
    },
  ],
  projects: [
    {
      id: "proj-1",
      name: "CloudMetrics Analytics Platform",
      techStack: ["Next.js", "TypeScript", "Tailwind CSS", "Recharts"],
      duration: "2023",
      liveUrl: "https://cloudmetrics.demo",
      bullets: [
        "Constructed real-time visualization dashboard displaying API telemetry and server health metrics for 200+ microservices.",
        "Optimized Web Vitals score to 99/100 through image lazy-loading, code splitting, and memoized computation.",
      ],
    },
  ],
  education: [
    {
      id: "edu-1",
      institution: "University of California, Berkeley",
      degree: "B.S. in Computer Science",
      graduationYear: "2021",
      gpaOrScore: "3.8 / 4.0",
    },
  ],
  certifications: ["AWS Certified Cloud Practitioner", "Meta Front-End Developer Professional"],
};

export function ResumeScreen({ onNext, onBack }: ResumeScreenProps) {
  const [mode, setMode] = useState<ScreenMode>("upload");
  const [activeTab, setActiveTab] = useState<ResultTab>("preview");
  const [targetRole, setTargetRole] = useState("Frontend Software Engineer");

  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    size: string;
    fileObj?: File;
  } | null>(null);

  const [scanProgress, setScanProgress] = useState(0);
  const [scanStage, setScanStage] = useState(0);
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationDetails, setValidationDetails] = useState<{
    documentType?: string;
    reason?: string;
  } | null>(null);

  // Resume data models
  const [originalResume, setOriginalResume] = useState<ResumeStructuredData>(DEFAULT_RESUME_DATA);
  const [optimizedResume, setOptimizedResume] = useState<ResumeStructuredData>(DEFAULT_RESUME_DATA);
  const [activeResume, setActiveResume] = useState<ResumeStructuredData>(DEFAULT_RESUME_DATA);
  const [comparison, setComparison] = useState<ResumeComparisonData>({
    originalScore: 74,
    optimizedScore: 88,
    scoreBreakdown: [
      { category: "Contact & Header Hierarchy", original: 12, optimized: 15 },
      { category: "Professional Summary Quality", original: 10, optimized: 15 },
      { category: "Skills Coverage & Keywords", original: 18, optimized: 24 },
      { category: "Experience & Quantifiable Metrics", original: 16, optimized: 23 },
      { category: "Projects & Education Depth", original: 18, optimized: 20 },
    ],
    improvedKeywords: ["Next.js App Router", "Server Actions", "TypeScript", "Performance Optimization", "Jest Testing"],
    missingKeywords: ["Docker Containerization", "CI/CD Pipelines", "GraphQL"],
    sectionChanges: [
      {
        sectionName: "Professional Summary",
        originalSummary: "Frontend Developer with experience in React and JavaScript looking for opportunities.",
        improvedSummary:
          "Performance-driven Frontend Software Engineer with 3+ years of experience engineering responsive web applications with React, Next.js, and TypeScript. Specializes in web performance, state management, and modern design systems.",
        keyHighlights: ["Elevated target role alignment", "Quantified domain experience", "Removed generic buzzwords"],
      },
      {
        sectionName: "Work Experience",
        originalSummary: "Built web pages, fixed bugs, and helped team members with tasks.",
        improvedSummary:
          "Architected enterprise dashboard components using Next.js and TypeScript, reducing page load by 38% and supporting 50k DAU.",
        keyHighlights: ["STAR framework applied", "Measurable outcomes highlighted", "Strong action verbs introduced"],
      },
    ],
  });

  const [isExporting, setIsExporting] = useState<"pdf" | "docx" | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // 1. FILE UPLOAD & VALIDATION HANDLER
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setValidationError(null);
    setValidationDetails(null);
    setIsValidating(true);

    const ext = "." + (file.name.split(".").pop() || "").toLowerCase();

    // Client-side instant check for file format (pdf & docx only)
    if (ext !== ".pdf" && ext !== ".docx") {
      setIsValidating(false);
      setValidationError("Please upload a PDF or DOCX resume.");
      setValidationDetails({
        documentType: ext.replace(".", "") || "unsupported",
        reason: "Only PDF and DOCX resume documents are accepted. Image files, logos, and unsupported formats are rejected.",
      });
      e.target.value = "";
      return;
    }

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/resume/validate", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!data.isResume) {
        setIsValidating(false);
        setValidationError(
          data.error || "This document does not appear to be a resume. Please upload a valid resume."
        );
        setValidationDetails({
          documentType: data.documentType,
          reason: data.reason,
        });
        e.target.value = "";
        return;
      }

      setIsValidating(false);
      setSelectedFile({
        name: file.name,
        size: `${(file.size / 1024).toFixed(0)} KB`,
        fileObj: file,
      });
    } catch (err) {
      console.error("[ResumeScreen] Upload verification error:", err);
      setIsValidating(false);
      setValidationError("Failed to verify document. Please ensure you upload a valid resume.");
    }
  };

  // 2. RUN AI OPTIMIZATION SCAN
  const runOptimizationScan = async () => {
    if (!selectedFile || !selectedFile.fileObj || validationError || isValidating) {
      setValidationError("Please upload a PDF or DOCX resume before optimizing.");
      return;
    }

    setMode("scanning");
    setScanProgress(0);
    setScanStage(0);

    const interval = setInterval(() => {
      setScanProgress((prev) => {
        if (prev >= 90) {
          return 90; // Wait for backend API to finish
        }
        if (prev === 20) setScanStage(1);
        if (prev === 45) setScanStage(2);
        if (prev === 70) setScanStage(3);
        return prev + 5;
      });
    }, 120);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile.fileObj);
      formData.append("targetJobDescription", targetRole);

      const res = await fetch("/api/resume/analyze-optimize", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      clearInterval(interval);
      setScanProgress(100);

      if (!res.ok || !data.success) {
        setMode("upload");
        setValidationError(
          data.error || "This document does not appear to be a resume. Please upload a valid resume."
        );
        setValidationDetails({
          documentType: data.documentType,
          reason: data.reason,
        });
        return;
      }

      // Populate results
      setOriginalResume(data.originalResume);
      setOptimizedResume(data.optimizedResume);
      setActiveResume(data.optimizedResume);
      setComparison(data.comparison);

      setTimeout(() => {
        setMode("results");
        setActiveTab("preview");
      }, 500);
    } catch (err: any) {
      clearInterval(interval);
      console.error("[ResumeScreen] Optimization API error:", err);
      setMode("upload");
      setValidationError("An error occurred during resume analysis. Please try again.");
    }
  };

  // 3. EXPORT / DOWNLOAD HANDLER (PDF & DOCX)
  const handleExport = async (format: "pdf" | "docx") => {
    if (!activeResume) return;

    setIsExporting(format);
    try {
      const res = await fetch("/api/resume/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeData: activeResume,
          format,
        }),
      });

      if (!res.ok) {
        throw new Error(`Export failed with status ${res.status}`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const candidateName = (activeResume.contact?.fullName || "Candidate")
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .trim();
      a.download = `${candidateName}_Optimized_Resume.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      showToast(`Downloaded ${format.toUpperCase()} successfully!`);
    } catch (err: any) {
      console.error("[ResumeScreen] Export error:", err);
      showToast(`Export failed: ${err.message}`);
    } finally {
      setIsExporting(null);
    }
  };

  // 4. SAVE EDITED RESUME
  const handleSaveEdits = () => {
    const updatedScore = calculateAtsScore(activeResume);
    setOptimizedResume(activeResume);
    setComparison((prev) => ({
      ...prev,
      optimizedScore: updatedScore.total,
      scoreBreakdown: prev.scoreBreakdown.map((item, idx) => ({
        category: item.category,
        original: item.original,
        optimized: updatedScore.categories[idx]?.score ?? item.optimized,
      })),
    }));
    showToast("Changes saved & ATS score re-evaluated!");
    setActiveTab("preview");
  };

  const scanSteps = [
    "Validating document authenticity & layout...",
    "Extracting experience, projects & skills...",
    "Evaluating ATS parsing compatibility & keyword density...",
    "Applying STAR impact rewrites with Gemini AI...",
  ];

  return (
    <div className="h-full w-full bg-[#FAF9FF] text-[#18152B] font-sans antialiased flex flex-col select-none relative overflow-hidden">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-[#172033] text-white text-[12px] font-semibold flex items-center gap-2 shadow-lg"
          >
            <CheckCircle2 className="w-4 h-4 text-[#22C995]" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Header */}
      <Header
        variant="back"
        title={
          mode === "upload"
            ? "Resume ATS Optimizer"
            : mode === "scanning"
            ? "Analyzing Document..."
            : "Optimized Resume Studio"
        }
        onBackClick={
          mode === "results"
            ? () => setMode("upload")
            : onBack
        }
        rightElement={
          mode === "results" ? (
            <button
              type="button"
              onClick={() => setMode("upload")}
              className="p-1.5 rounded-lg text-[#635BFF] hover:bg-[#F1EFFF] transition-colors text-[11.5px] font-bold flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>New Upload</span>
            </button>
          ) : undefined
        }
      />

      <AnimatePresence mode="wait">
        {/* =================================================================== */}
        {/* STAGE 1: UPLOAD & VALIDATION                                       */}
        {/* =================================================================== */}
        {mode === "upload" && (
          <motion.div
            key="upload-stage"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-4 flex flex-col justify-between max-w-lg mx-auto w-full space-y-4"
          >
            <div className="space-y-4">
              {/* Headline */}
              <div className="text-center space-y-1 pt-1">
                <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#F1EFFF] text-[#635BFF] text-[11px] font-bold">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>AI Resume Optimizer & ATS Scanner</span>
                </div>
                <h2 className="text-[20px] font-bold text-[#172033] tracking-tight">
                  Upload Your Resume
                </h2>
                <p className="text-[12px] text-[#667085] max-w-xs mx-auto">
                  Instant ATS compatibility scoring, keyword gap detection, and executive STAR-format optimization.
                </p>
              </div>

              {/* Target Job Customization */}
              <div className="p-3.5 rounded-[16px] bg-white border border-[#E8E5F2] shadow-2xs space-y-2">
                <label className="text-[11.5px] font-bold text-[#475569] flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-[#635BFF]" />
                  <span>Target Role / Dream Job</span>
                </label>
                <input
                  type="text"
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                  placeholder="e.g. Frontend Software Engineer, Full Stack Developer"
                  className="w-full px-3 py-2 text-[12.5px] font-medium text-[#1E293B] bg-[#F8FAFC] border border-[#CBD5E1] rounded-[10px] focus:outline-none focus:border-[#635BFF] transition-all"
                />
                <p className="text-[10.5px] text-[#94A3B8]">
                  Gemini will analyze your resume specifically against industry requirements for this role.
                </p>
              </div>

              {/* Drag & Drop Upload Card (PDF & DOCX ONLY) */}
              <label
                htmlFor="resume-file-input"
                className={cn(
                  "block p-6 rounded-[22px] border-2 border-dashed bg-white transition-all cursor-pointer text-center space-y-3 shadow-2xs group",
                  validationError
                    ? "border-[#FECACA] bg-[#FEF2F2]/30"
                    : "border-[#C7D2FE] hover:bg-[#F8FAFF] hover:border-[#635BFF]"
                )}
              >
                <input
                  id="resume-file-input"
                  type="file"
                  accept=".pdf,.docx"
                  onChange={handleFileUpload}
                  className="hidden"
                />

                <div className="w-14 h-14 rounded-[18px] bg-gradient-to-br from-[#F1EFFF] to-[#EEF2FF] flex items-center justify-center mx-auto text-[#635BFF] group-hover:scale-105 transition-transform shadow-xs">
                  <FileUp className="w-7 h-7" />
                </div>

                <div className="space-y-1">
                  <h3 className="text-[14px] font-bold text-[#172033]">
                    Click to browse or drag & drop
                  </h3>
                  <p className="text-[11.5px] text-[#667085]">
                    Supports <strong className="text-[#635BFF]">PDF</strong> or{" "}
                    <strong className="text-[#635BFF]">DOCX</strong> documents only (Max 10 MB)
                  </p>
                </div>

                <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#635BFF] bg-[#F1EFFF] px-3.5 py-1.5 rounded-full shadow-2xs">
                  <Upload className="w-3 h-3" />
                  <span>Choose Resume File</span>
                </div>
              </label>

              {/* AI Verification Loading Banner */}
              {isValidating && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3.5 rounded-[16px] bg-[#EEF2FF] border border-[#C7D2FE] flex items-center gap-3 text-[#635BFF]"
                >
                  <RefreshCw className="w-4 h-4 animate-spin shrink-0 text-[#635BFF]" />
                  <div className="text-left text-[12px] font-semibold">
                    <span>AI Verifying Document Authenticity...</span>
                    <p className="text-[10.5px] text-[#64748B] font-normal">
                      Extracting text and validating resume structure with Gemini AI
                    </p>
                  </div>
                </motion.div>
              )}

              {/* REJECTION ALERT: Strictly Only Resumes Allowed */}
              {validationError && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-4 rounded-[18px] bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] space-y-2.5 text-left shadow-xs"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-[#FEE2E2] flex items-center justify-center shrink-0 mt-0.5">
                      <AlertCircle className="w-5 h-5 text-[#DC2626]" />
                    </div>
                    <div className="space-y-1 flex-1 min-w-0">
                      <h4 className="text-[13px] font-extrabold text-[#991B1B] leading-tight">
                        Invalid Document Detected
                      </h4>
                      <p className="text-[12px] font-semibold text-[#B91C1C] leading-relaxed">
                        {validationError}
                      </p>
                      {validationDetails?.documentType && (
                        <div className="text-[11px] text-[#7F1D1D] bg-white/80 p-2.5 rounded-xl border border-[#FCA5A5]/60 mt-1.5 space-y-1">
                          <p>
                            <strong>Detected Type:</strong>{" "}
                            <span className="capitalize">{validationDetails.documentType}</span>
                          </p>
                          {validationDetails.reason && (
                            <p className="text-[10.5px] text-[#991B1B]/90 italic">
                              {validationDetails.reason}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="pt-2 flex items-center justify-between border-t border-[#FEE2E2] text-[11px]">
                    <span className="text-[#991B1B] font-medium">
                      Please upload a genuine PDF or DOCX resume.
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setValidationError(null);
                        setValidationDetails(null);
                      }}
                      className="px-2.5 py-1 rounded-md bg-white border border-[#FCA5A5] text-[#DC2626] font-bold hover:bg-[#FEE2E2] transition-colors"
                    >
                      Try Again
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Verified File Ready Card */}
              {selectedFile && !validationError && !isValidating && (
                <div className="p-3.5 rounded-[16px] bg-white border border-[#E8E5F2] flex items-center justify-between shadow-2xs">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-9 h-9 rounded-[10px] bg-[#F1EFFF] text-[#635BFF] flex items-center justify-center shrink-0">
                      <FileText className="w-4.5 h-4.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-bold text-[#172033] truncate">
                        {selectedFile.name}
                      </p>
                      <p className="text-[10.5px] text-[#667085]">
                        {selectedFile.size} · Validated Resume
                      </p>
                    </div>
                  </div>

                  <span className="text-[10.5px] font-bold text-[#22C995] bg-[#F0FDF4] px-2.5 py-0.5 rounded-full border border-[#BBF7D0] flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    Verified
                  </span>
                </div>
              )}

              {/* Feature Checklist */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center gap-2 text-[12px] text-[#475569]">
                  <CheckCircle2 className="w-4 h-4 text-[#22C995] shrink-0" />
                  <span>Objective ATS Compatibility Score (0 to 100)</span>
                </div>
                <div className="flex items-center gap-2 text-[12px] text-[#475569]">
                  <CheckCircle2 className="w-4 h-4 text-[#22C995] shrink-0" />
                  <span>Keyword match & missing skill identification</span>
                </div>
                <div className="flex items-center gap-2 text-[12px] text-[#475569]">
                  <CheckCircle2 className="w-4 h-4 text-[#22C995] shrink-0" />
                  <span>Executive STAR-method bullet point rewriting</span>
                </div>
                <div className="flex items-center gap-2 text-[12px] text-[#475569]">
                  <CheckCircle2 className="w-4 h-4 text-[#22C995] shrink-0" />
                  <span>Live visual preview, inline editing & 1-click PDF/DOCX downloads</span>
                </div>
              </div>
            </div>

            {/* Bottom CTA */}
            <div className="pt-4">
              <Button
                variant="primary"
                size="lg"
                fullWidth
                disabled={!selectedFile || isValidating || !!validationError}
                onClick={runOptimizationScan}
                className={cn(
                  "h-[48px] rounded-[14px] text-[14px] font-semibold flex items-center justify-center gap-2 bg-gradient-to-r from-[#635BFF] to-[#8B5CF6] shadow-md shadow-[#635BFF]/25",
                  (!selectedFile || isValidating || !!validationError) && "opacity-50 cursor-not-allowed"
                )}
              >
                {isValidating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Verifying Document...</span>
                  </>
                ) : !selectedFile ? (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>Choose Resume File to Begin</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Optimize & Analyze Resume →</span>
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        )}

        {/* =================================================================== */}
        {/* STAGE 2: SCANNING & ANALYSIS ANIMATION                             */}
        {/* =================================================================== */}
        {mode === "scanning" && (
          <motion.div
            key="scanning-stage"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="flex-1 min-h-0 p-6 flex flex-col items-center justify-center text-center max-w-lg mx-auto w-full space-y-6"
          >
            <div className="relative w-24 h-24 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-[#635BFF]/15 animate-ping" />
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#635BFF] to-[#8B5CF6] flex items-center justify-center text-white shadow-xl relative z-10">
                <FileCheck className="w-9 h-9" />
              </div>
            </div>

            <div className="space-y-1.5">
              <h2 className="text-[19px] font-bold text-[#172033]">
                Optimizing Your Resume...
              </h2>
              <p className="text-[12.5px] text-[#635BFF] font-semibold">
                {scanSteps[scanStage]}
              </p>
            </div>

            <div className="w-full max-w-xs space-y-2">
              <div className="h-2.5 w-full bg-[#E8EAF3] rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-[#635BFF] to-[#22C995] rounded-full"
                  style={{ width: `${scanProgress}%` }}
                />
              </div>
              <div className="text-[12px] font-bold text-[#667085]">
                {scanProgress}% Completed
              </div>
            </div>

            <div className="p-3 rounded-[14px] bg-[#F1EFFF] text-[#635BFF] text-[11.5px] font-medium max-w-xs">
              Matching against {targetRole} job descriptions and ATS parsers...
            </div>
          </motion.div>
        )}

        {/* =================================================================== */}
        {/* STAGE 3: COMPREHENSIVE RESULTS, PREVIEW, COMPARISON & EDITING      */}
        {/* =================================================================== */}
        {mode === "results" && (
          <motion.div
            key="results-stage"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex-1 min-h-0 flex flex-col overflow-hidden max-w-xl mx-auto w-full"
          >
            {/* Top Sub-Navigation Tabs */}
            <div className="px-4 pt-2 pb-1 bg-[#FAF9FF] border-b border-[#E8E5F2] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-1 bg-[#ECE9F8] p-1 rounded-[12px]">
                <button
                  type="button"
                  onClick={() => setActiveTab("preview")}
                  className={cn(
                    "px-3 py-1.5 rounded-[9px] text-[11.5px] font-bold flex items-center gap-1.5 transition-all",
                    activeTab === "preview"
                      ? "bg-white text-[#635BFF] shadow-xs"
                      : "text-[#64748B] hover:text-[#1E293B]"
                  )}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Resume Preview</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("compare")}
                  className={cn(
                    "px-3 py-1.5 rounded-[9px] text-[11.5px] font-bold flex items-center gap-1.5 transition-all",
                    activeTab === "compare"
                      ? "bg-white text-[#635BFF] shadow-xs"
                      : "text-[#64748B] hover:text-[#1E293B]"
                  )}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Original vs AI ({comparison.originalScore} → {comparison.optimizedScore})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("edit")}
                  className={cn(
                    "px-3 py-1.5 rounded-[9px] text-[11.5px] font-bold flex items-center gap-1.5 transition-all",
                    activeTab === "edit"
                      ? "bg-white text-[#635BFF] shadow-xs"
                      : "text-[#64748B] hover:text-[#1E293B]"
                  )}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Resume</span>
                </button>
              </div>

              {/* Quick Download Buttons */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={isExporting !== null}
                  onClick={() => handleExport("pdf")}
                  className="px-2.5 py-1.5 rounded-[9px] bg-[#635BFF] text-white hover:bg-[#5349E8] transition-all text-[11px] font-bold flex items-center gap-1 shadow-xs disabled:opacity-50"
                >
                  {isExporting === "pdf" ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    <Download className="w-3 h-3" />
                  )}
                  <span>PDF</span>
                </button>
                <button
                  type="button"
                  disabled={isExporting !== null}
                  onClick={() => handleExport("docx")}
                  className="px-2.5 py-1.5 rounded-[9px] bg-white border border-[#CBD5E1] text-[#1E293B] hover:bg-[#F1F5F9] transition-all text-[11px] font-bold flex items-center gap-1 shadow-xs disabled:opacity-50"
                >
                  {isExporting === "docx" ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    <Download className="w-3 h-3 text-[#2563EB]" />
                  )}
                  <span>DOCX</span>
                </button>
              </div>
            </div>

            {/* Scrollable Main Tab Content */}
            <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-4 space-y-4">
              {/* =========================================================== */}
              {/* TAB 1: FORMATTED IN-APP RESUME PREVIEW                      */}
              {/* =========================================================== */}
              {activeTab === "preview" && (
                <div className="space-y-4">
                  {/* ATS Score Header Card */}
                  <div className="p-4 rounded-[18px] bg-gradient-to-br from-[#635BFF] to-[#8B5CF6] text-white shadow-md flex items-center justify-between">
                    <div className="space-y-0.5">
                      <span className="text-[10.5px] font-bold uppercase tracking-wider text-white/80">
                        ATS Compatibility Score
                      </span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-[30px] font-extrabold leading-none">
                          {comparison.optimizedScore}
                        </span>
                        <span className="text-[14px] text-white/70 font-semibold">/100</span>
                        <span className="text-[11px] font-bold bg-[#22C995] text-white px-2 py-0.5 rounded-full ml-1">
                          +{comparison.optimizedScore - comparison.originalScore} pts improved
                        </span>
                      </div>
                      <p className="text-[11px] text-white/90">
                        Tailored for <strong className="text-white">{targetRole}</strong>
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleExport("pdf")}
                          disabled={isExporting !== null}
                          className="px-2.5 py-1.5 rounded-[9px] bg-white text-[#635BFF] text-[11px] font-bold flex items-center gap-1 hover:bg-[#F1EFFF] transition-all shadow-xs"
                        >
                          <Download className="w-3 h-3 text-[#635BFF]" />
                          <span>PDF</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExport("docx")}
                          disabled={isExporting !== null}
                          className="px-2.5 py-1.5 rounded-[9px] bg-white/20 text-white text-[11px] font-bold flex items-center gap-1 hover:bg-white/30 transition-all shadow-xs"
                        >
                          <Download className="w-3 h-3 text-white" />
                          <span>DOCX</span>
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab("edit")}
                        className="px-2.5 py-1 rounded-[8px] bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white text-[11px] font-medium flex items-center gap-1 transition-all"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Edit Content</span>
                      </button>
                    </div>
                  </div>

                  {/* Clean Visual Paper Resume Preview */}
                  <div className="bg-white rounded-[16px] border border-[#E2E8F0] shadow-sm p-6 text-[#0F172A] space-y-5">
                    {/* Header: Candidate Info */}
                    <div className="text-center pb-4 border-b border-[#E2E8F0] space-y-1">
                      <h1 className="text-[22px] font-extrabold tracking-tight text-[#0F172A]">
                        {activeResume.contact.fullName || "Candidate Name"}
                      </h1>
                      <p className="text-[13px] font-bold text-[#635BFF]">
                        {activeResume.contact.professionalTitle || targetRole}
                      </p>
                      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-[#64748B] pt-1">
                        {activeResume.contact.email && <span>{activeResume.contact.email}</span>}
                        {activeResume.contact.phone && <span>• {activeResume.contact.phone}</span>}
                        {activeResume.contact.location && (
                          <span>• {activeResume.contact.location}</span>
                        )}
                        {activeResume.contact.portfolioUrl && (
                          <span>• {activeResume.contact.portfolioUrl}</span>
                        )}
                        {activeResume.contact.githubUrl && (
                          <span>• {activeResume.contact.githubUrl}</span>
                        )}
                      </div>
                    </div>

                    {/* Section: Professional Summary */}
                    <div className="space-y-1.5">
                      <h2 className="text-[12px] font-extrabold uppercase tracking-wider text-[#635BFF] border-b border-[#F1EFFF] pb-1">
                        Professional Summary
                      </h2>
                      <p className="text-[12px] text-[#334155] leading-relaxed">
                        {activeResume.professionalSummary}
                      </p>
                    </div>

                    {/* Section: Technical Skills */}
                    <div className="space-y-2">
                      <h2 className="text-[12px] font-extrabold uppercase tracking-wider text-[#635BFF] border-b border-[#F1EFFF] pb-1">
                        Technical Skills
                      </h2>
                      <div className="space-y-1 text-[11.5px]">
                        {activeResume.technicalSkills?.languages?.length > 0 && (
                          <p>
                            <strong className="text-[#1E293B]">Languages:</strong>{" "}
                            <span className="text-[#475569]">
                              {activeResume.technicalSkills.languages.join(", ")}
                            </span>
                          </p>
                        )}
                        {activeResume.technicalSkills?.frameworks?.length > 0 && (
                          <p>
                            <strong className="text-[#1E293B]">Frameworks & Libraries:</strong>{" "}
                            <span className="text-[#475569]">
                              {activeResume.technicalSkills.frameworks.join(", ")}
                            </span>
                          </p>
                        )}
                        {activeResume.technicalSkills?.toolsAndCloud?.length > 0 && (
                          <p>
                            <strong className="text-[#1E293B]">Tools & Platforms:</strong>{" "}
                            <span className="text-[#475569]">
                              {activeResume.technicalSkills.toolsAndCloud.join(", ")}
                            </span>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Section: Work Experience */}
                    <div className="space-y-3">
                      <h2 className="text-[12px] font-extrabold uppercase tracking-wider text-[#635BFF] border-b border-[#F1EFFF] pb-1">
                        Work Experience
                      </h2>
                      <div className="space-y-3.5">
                        {activeResume.experience?.map((exp) => (
                          <div key={exp.id} className="space-y-1">
                            <div className="flex items-center justify-between text-[12px]">
                              <p className="font-bold text-[#0F172A]">
                                {exp.role} ·{" "}
                                <span className="font-semibold text-[#475569]">{exp.company}</span>
                              </p>
                              <span className="text-[11px] text-[#64748B] font-medium">
                                {exp.duration}
                              </span>
                            </div>
                            <ul className="list-disc list-inside space-y-1 text-[11.5px] text-[#334155] leading-relaxed pl-1">
                              {exp.bullets?.map((bullet, bIdx) => (
                                <li key={bIdx}>{bullet}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Section: Projects */}
                    {activeResume.projects?.length > 0 && (
                      <div className="space-y-2.5">
                        <h2 className="text-[12px] font-extrabold uppercase tracking-wider text-[#635BFF] border-b border-[#F1EFFF] pb-1">
                          Projects
                        </h2>
                        <div className="space-y-3">
                          {activeResume.projects.map((proj) => (
                            <div key={proj.id} className="space-y-1">
                              <div className="flex items-center justify-between text-[12px]">
                                <p className="font-bold text-[#0F172A]">{proj.name}</p>
                                {proj.duration && (
                                  <span className="text-[11px] text-[#64748B]">
                                    {proj.duration}
                                  </span>
                                )}
                              </div>
                              {proj.techStack?.length > 0 && (
                                <p className="text-[10.5px] text-[#635BFF] font-semibold">
                                  Tech Stack: {proj.techStack.join(", ")}
                                </p>
                              )}
                              <ul className="list-disc list-inside space-y-0.5 text-[11.5px] text-[#334155] pl-1">
                                {proj.bullets?.map((b, bIdx) => (
                                  <li key={bIdx}>{b}</li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Section: Education */}
                    {activeResume.education?.length > 0 && (
                      <div className="space-y-2">
                        <h2 className="text-[12px] font-extrabold uppercase tracking-wider text-[#635BFF] border-b border-[#F1EFFF] pb-1">
                          Education
                        </h2>
                        <div className="space-y-1.5">
                          {activeResume.education.map((edu) => (
                            <div
                              key={edu.id}
                              className="flex items-center justify-between text-[12px]"
                            >
                              <div>
                                <p className="font-bold text-[#0F172A]">{edu.degree}</p>
                                <p className="text-[11px] text-[#64748B]">{edu.institution}</p>
                              </div>
                              <span className="text-[11px] text-[#64748B] font-medium">
                                {edu.graduationYear}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Section: Certifications */}
                    {activeResume.certifications && activeResume.certifications.length > 0 && (
                      <div className="space-y-1.5">
                        <h2 className="text-[12px] font-extrabold uppercase tracking-wider text-[#635BFF] border-b border-[#F1EFFF] pb-1">
                          Certifications
                        </h2>
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {activeResume.certifications.map((cert, cIdx) => (
                            <span
                              key={cIdx}
                              className="text-[11px] font-medium text-[#475569] bg-[#F1F5F9] px-2.5 py-0.5 rounded-full border border-[#E2E8F0]"
                            >
                              {cert}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* =========================================================== */}
              {/* TAB 2: ORIGINAL VS OPTIMISED COMPARISON                     */}
              {/* =========================================================== */}
              {activeTab === "compare" && (
                <div className="space-y-4">
                  {/* Score Delta Overview */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 rounded-[16px] bg-white border border-[#E2E8F0] shadow-2xs space-y-1 text-center">
                      <span className="text-[11px] font-bold text-[#64748B] uppercase">
                        Original ATS Score
                      </span>
                      <div className="text-[28px] font-extrabold text-[#64748B]">
                        {comparison.originalScore}
                        <span className="text-[14px] font-normal text-[#94A3B8]">/100</span>
                      </div>
                      <span className="text-[10px] font-semibold text-[#94A3B8]">
                        Baseline Document
                      </span>
                    </div>

                    <div
                      onClick={() => setActiveTab("preview")}
                      className="p-4 rounded-[16px] bg-gradient-to-br from-[#635BFF] to-[#8B5CF6] text-white shadow-md space-y-1 text-center cursor-pointer hover:scale-[1.02] transition-transform group"
                    >
                      <span className="text-[11px] font-bold text-white/80 uppercase">
                        AI Optimised Score
                      </span>
                      <div className="text-[28px] font-extrabold text-white">
                        {comparison.optimizedScore}
                        <span className="text-[14px] font-normal text-white/70">/100</span>
                      </div>
                      <div className="flex items-center justify-center gap-1.5 pt-0.5">
                        <span className="text-[10px] font-bold bg-[#22C995] text-white px-2 py-0.5 rounded-full">
                          +{comparison.optimizedScore - comparison.originalScore} pts
                        </span>
                        <span className="text-[10.5px] font-bold text-white underline flex items-center gap-0.5 group-hover:text-white/80">
                          <Eye className="w-3 h-3" /> Preview
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Objective Score Pillars Comparison */}
                  <div className="p-4 rounded-[16px] bg-white border border-[#E8E5F2] shadow-2xs space-y-3">
                    <h3 className="text-[13px] font-bold text-[#1E293B]">
                      ATS Category Score Breakdown
                    </h3>
                    <div className="space-y-3">
                      {comparison.scoreBreakdown.map((item, idx) => (
                        <div key={idx} className="space-y-1">
                          <div className="flex items-center justify-between text-[11.5px]">
                            <span className="font-semibold text-[#475569]">{item.category}</span>
                            <span className="font-bold text-[#1E293B]">
                              <span className="text-[#94A3B8]">{item.original}</span> →{" "}
                              <span className="text-[#635BFF]">{item.optimized}</span>
                            </span>
                          </div>
                          <div className="h-2 w-full bg-[#F1F5F9] rounded-full overflow-hidden flex">
                            <div
                              className="h-full bg-[#CBD5E1]"
                              style={{ width: `${(item.original / 25) * 100}%` }}
                            />
                            <div
                              className="h-full bg-gradient-to-r from-[#635BFF] to-[#22C995]"
                              style={{
                                width: `${
                                  Math.max(0, (item.optimized - item.original) / 25) * 100
                                }%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-[#94A3B8] pt-1">
                      Scored with identical deterministic ATS criteria. No artificial inflation.
                    </p>
                  </div>

                  {/* Keyword Enhancements */}
                  <div className="p-4 rounded-[16px] bg-white border border-[#E8E5F2] shadow-2xs space-y-3">
                    <h3 className="text-[13px] font-bold text-[#1E293B] flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-[#635BFF]" />
                      <span>Keyword Analysis ({targetRole})</span>
                    </h3>

                    <div className="space-y-2">
                      <span className="text-[11px] font-bold text-[#15803D]">
                        ✓ Added & Strengthened High-Value Keywords
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {comparison.improvedKeywords?.map((kw, i) => (
                          <span
                            key={i}
                            className="text-[11px] font-semibold text-[#15803D] bg-[#F0FDF4] border border-[#BBF7D0] px-2.5 py-0.5 rounded-full"
                          >
                            + {kw}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-[#F1F5F9]">
                      <span className="text-[11px] font-bold text-[#D97706]">
                        ⚠ Missing Skills / Recommendations for Target Role
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {comparison.missingKeywords?.map((kw, i) => (
                          <span
                            key={i}
                            className="text-[11px] font-medium text-[#B45309] bg-[#FFFBEB] border border-[#FDE68A] px-2.5 py-0.5 rounded-full"
                          >
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Section-by-Section Changes Diff */}
                  <div className="space-y-3">
                    <h3 className="text-[13px] font-bold text-[#1E293B]">
                      Section Modifications & AI Highlights
                    </h3>
                    {comparison.sectionChanges?.map((change, i) => (
                      <div
                        key={i}
                        className="p-3.5 rounded-[16px] bg-white border border-[#E8E5F2] shadow-2xs space-y-2 text-left"
                      >
                        <h4 className="text-[12.5px] font-bold text-[#635BFF]">
                          {change.sectionName}
                        </h4>
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div className="p-2 rounded-[10px] bg-[#F8FAFC] border border-[#E2E8F0] space-y-1">
                            <span className="font-bold text-[#64748B]">Before</span>
                            <p className="text-[#64748B] line-through">{change.originalSummary}</p>
                          </div>
                          <div className="p-2 rounded-[10px] bg-[#F0FDF4] border border-[#BBF7D0] space-y-1">
                            <span className="font-bold text-[#15803D]">After (AI Optimized)</span>
                            <p className="text-[#166534] font-medium">{change.improvedSummary}</p>
                          </div>
                        </div>
                        {change.keyHighlights?.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {change.keyHighlights.map((hl, hlIdx) => (
                              <span
                                key={hlIdx}
                                className="text-[10px] font-semibold text-[#635BFF] bg-[#F1EFFF] px-2 py-0.5 rounded-md"
                              >
                                ✓ {hl}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* =========================================================== */}
              {/* TAB 3: RESUME EDITING SUITE                                 */}
              {/* =========================================================== */}
              {activeTab === "edit" && (
                <div className="space-y-4">
                  <div className="p-3 rounded-[12px] bg-[#EEF2FF] border border-[#C7D2FE] flex items-center justify-between text-[11.5px] text-[#635BFF]">
                    <span>Edit any section directly. Click "Save Edits" to update your resume and re-evaluate your ATS score.</span>
                    <button
                      type="button"
                      onClick={handleSaveEdits}
                      className="px-3 py-1.5 rounded-[8px] bg-[#635BFF] text-white font-bold flex items-center gap-1 hover:bg-[#5349E8] transition-all shrink-0 ml-2 shadow-xs"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Edits</span>
                    </button>
                  </div>

                  {/* Edit Contact Details */}
                  <div className="p-4 rounded-[16px] bg-white border border-[#E8E5F2] shadow-2xs space-y-3">
                    <h3 className="text-[13px] font-bold text-[#1E293B]">Contact Information</h3>
                    <div className="grid grid-cols-2 gap-2 text-[11.5px]">
                      <div>
                        <label className="font-semibold text-[#64748B]">Full Name</label>
                        <input
                          type="text"
                          value={activeResume.contact.fullName || ""}
                          onChange={(e) =>
                            setActiveResume({
                              ...activeResume,
                              contact: { ...activeResume.contact, fullName: e.target.value },
                            })
                          }
                          className="w-full mt-1 px-2.5 py-1.5 rounded-[8px] border border-[#CBD5E1] bg-[#F8FAFC] text-[#1E293B]"
                        />
                      </div>
                      <div>
                        <label className="font-semibold text-[#64748B]">Professional Title</label>
                        <input
                          type="text"
                          value={activeResume.contact.professionalTitle || ""}
                          onChange={(e) =>
                            setActiveResume({
                              ...activeResume,
                              contact: { ...activeResume.contact, professionalTitle: e.target.value },
                            })
                          }
                          className="w-full mt-1 px-2.5 py-1.5 rounded-[8px] border border-[#CBD5E1] bg-[#F8FAFC] text-[#1E293B]"
                        />
                      </div>
                      <div>
                        <label className="font-semibold text-[#64748B]">Email Address</label>
                        <input
                          type="text"
                          value={activeResume.contact.email || ""}
                          onChange={(e) =>
                            setActiveResume({
                              ...activeResume,
                              contact: { ...activeResume.contact, email: e.target.value },
                            })
                          }
                          className="w-full mt-1 px-2.5 py-1.5 rounded-[8px] border border-[#CBD5E1] bg-[#F8FAFC] text-[#1E293B]"
                        />
                      </div>
                      <div>
                        <label className="font-semibold text-[#64748B]">Phone Number</label>
                        <input
                          type="text"
                          value={activeResume.contact.phone || ""}
                          onChange={(e) =>
                            setActiveResume({
                              ...activeResume,
                              contact: { ...activeResume.contact, phone: e.target.value },
                            })
                          }
                          className="w-full mt-1 px-2.5 py-1.5 rounded-[8px] border border-[#CBD5E1] bg-[#F8FAFC] text-[#1E293B]"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="font-semibold text-[#64748B]">Location</label>
                        <input
                          type="text"
                          value={activeResume.contact.location || ""}
                          onChange={(e) =>
                            setActiveResume({
                              ...activeResume,
                              contact: { ...activeResume.contact, location: e.target.value },
                            })
                          }
                          className="w-full mt-1 px-2.5 py-1.5 rounded-[8px] border border-[#CBD5E1] bg-[#F8FAFC] text-[#1E293B]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Edit Professional Summary */}
                  <div className="p-4 rounded-[16px] bg-white border border-[#E8E5F2] shadow-2xs space-y-2">
                    <h3 className="text-[13px] font-bold text-[#1E293B]">Professional Summary</h3>
                    <textarea
                      rows={4}
                      value={activeResume.professionalSummary || ""}
                      onChange={(e) =>
                        setActiveResume({
                          ...activeResume,
                          professionalSummary: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 text-[12px] rounded-[10px] border border-[#CBD5E1] bg-[#F8FAFC] text-[#1E293B] focus:outline-none focus:border-[#635BFF]"
                    />
                  </div>

                  {/* Edit Technical Skills */}
                  <div className="p-4 rounded-[16px] bg-white border border-[#E8E5F2] shadow-2xs space-y-3">
                    <h3 className="text-[13px] font-bold text-[#1E293B]">
                      Technical Skills (Comma separated)
                    </h3>
                    <div className="space-y-2 text-[11.5px]">
                      <div>
                        <label className="font-semibold text-[#64748B]">Programming Languages</label>
                        <input
                          type="text"
                          value={activeResume.technicalSkills.languages?.join(", ") || ""}
                          onChange={(e) =>
                            setActiveResume({
                              ...activeResume,
                              technicalSkills: {
                                ...activeResume.technicalSkills,
                                languages: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                              },
                            })
                          }
                          className="w-full mt-1 px-2.5 py-1.5 rounded-[8px] border border-[#CBD5E1] bg-[#F8FAFC] text-[#1E293B]"
                        />
                      </div>
                      <div>
                        <label className="font-semibold text-[#64748B]">Frameworks & Libraries</label>
                        <input
                          type="text"
                          value={activeResume.technicalSkills.frameworks?.join(", ") || ""}
                          onChange={(e) =>
                            setActiveResume({
                              ...activeResume,
                              technicalSkills: {
                                ...activeResume.technicalSkills,
                                frameworks: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                              },
                            })
                          }
                          className="w-full mt-1 px-2.5 py-1.5 rounded-[8px] border border-[#CBD5E1] bg-[#F8FAFC] text-[#1E293B]"
                        />
                      </div>
                      <div>
                        <label className="font-semibold text-[#64748B]">Tools & Platforms</label>
                        <input
                          type="text"
                          value={activeResume.technicalSkills.toolsAndCloud?.join(", ") || ""}
                          onChange={(e) =>
                            setActiveResume({
                              ...activeResume,
                              technicalSkills: {
                                ...activeResume.technicalSkills,
                                toolsAndCloud: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                              },
                            })
                          }
                          className="w-full mt-1 px-2.5 py-1.5 rounded-[8px] border border-[#CBD5E1] bg-[#F8FAFC] text-[#1E293B]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Save Button Action */}
                  <div className="pt-2">
                    <Button
                      variant="primary"
                      size="lg"
                      fullWidth
                      onClick={handleSaveEdits}
                      className="h-[46px] rounded-[14px] text-[13.5px] font-bold flex items-center justify-center gap-2 bg-gradient-to-r from-[#635BFF] to-[#8B5CF6]"
                    >
                      <Save className="w-4 h-4" />
                      <span>Save & Update Resume</span>
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Sticky Bottom Navigation Bar */}
            <div className="p-3 bg-white border-t border-[#E8E5F2] shrink-0 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleExport("pdf")}
                  disabled={isExporting !== null}
                  className="px-3.5 py-2 rounded-[10px] bg-[#F1EFFF] text-[#635BFF] hover:bg-[#E0DCFE] transition-all text-[12px] font-bold flex items-center gap-1.5 shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExport("docx")}
                  disabled={isExporting !== null}
                  className="px-3.5 py-2 rounded-[10px] bg-[#F8FAFC] border border-[#E2E8F0] text-[#1E293B] hover:bg-[#F1F5F9] transition-all text-[12px] font-bold flex items-center gap-1.5 shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5 text-[#2563EB]" />
                  <span>Download DOCX</span>
                </button>
              </div>

              <Button
                variant="primary"
                size="md"
                onClick={onNext}
                className="h-[40px] px-4 rounded-[12px] text-[12.5px] font-bold flex items-center gap-1.5 bg-gradient-to-r from-[#635BFF] to-[#8B5CF6]"
              >
                <span>Proceed to Quiz</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
