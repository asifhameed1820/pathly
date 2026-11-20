export interface ResumeContactInfo {
  fullName: string;
  professionalTitle: string;
  email: string;
  phone: string;
  location: string;
  portfolioUrl?: string;
  githubUrl?: string;
  linkedinUrl?: string;
}

export interface ResumeWorkExperience {
  id: string;
  company: string;
  role: string;
  duration: string;
  location?: string;
  bullets: string[];
}

export interface ResumeProject {
  id: string;
  name: string;
  techStack: string[];
  duration?: string;
  liveUrl?: string;
  bullets: string[];
}

export interface ResumeEducation {
  id: string;
  institution: string;
  degree: string;
  fieldOfStudy?: string;
  graduationYear: string;
  gpaOrScore?: string;
}

export interface ResumeStructuredData {
  contact: ResumeContactInfo;
  professionalSummary: string;
  technicalSkills: {
    languages: string[];
    frameworks: string[];
    toolsAndCloud: string[];
    other?: string[];
  };
  experience: ResumeWorkExperience[];
  projects: ResumeProject[];
  education: ResumeEducation[];
  certifications?: string[];
}

export interface ResumeValidationResult {
  isValid: boolean;
  documentType: string;
  confidence: number;
  reason: string;
  error?: string;
  extractedText?: string;
}

export interface ResumeComparisonData {
  originalScore: number;
  optimizedScore: number;
  scoreBreakdown: {
    category: string;
    original: number;
    optimized: number;
  }[];
  improvedKeywords: string[];
  missingKeywords: string[];
  sectionChanges: {
    sectionName: string;
    originalSummary: string;
    improvedSummary: string;
    keyHighlights: string[];
  }[];
}

export interface ResumeOptimizationResult {
  originalResume: ResumeStructuredData;
  optimizedResume: ResumeStructuredData;
  comparison: ResumeComparisonData;
}

/**
 * Calculates genuine ATS score deterministically using the exact same rubric for both versions.
 * Pure function with no Node/server dependencies.
 */
export function calculateAtsScore(resume: ResumeStructuredData): {
  total: number;
  categories: { category: string; score: number; max: number }[];
} {
  // 1. Contact Completeness (15 pts)
  let contactPts = 0;
  if (resume.contact?.fullName) contactPts += 4;
  if (resume.contact?.email && resume.contact.email.includes("@")) contactPts += 4;
  if (resume.contact?.phone) contactPts += 4;
  if (
    resume.contact?.location ||
    resume.contact?.portfolioUrl ||
    resume.contact?.githubUrl ||
    resume.contact?.linkedinUrl
  ) {
    contactPts += 3;
  }

  // 2. Professional Summary Impact (15 pts)
  let summaryPts = 0;
  const sumLen = resume.professionalSummary ? resume.professionalSummary.length : 0;
  if (sumLen >= 120 && sumLen <= 450) summaryPts = 15;
  else if (sumLen > 50) summaryPts = 10;
  else if (sumLen > 0) summaryPts = 5;

  // 3. Technical Skills Breadth & Depth (25 pts)
  let skillsPts = 0;
  const allSkills = [
    ...(resume.technicalSkills?.languages || []),
    ...(resume.technicalSkills?.frameworks || []),
    ...(resume.technicalSkills?.toolsAndCloud || []),
    ...(resume.technicalSkills?.other || []),
  ];
  if (allSkills.length >= 12) skillsPts = 25;
  else if (allSkills.length >= 8) skillsPts = 20;
  else if (allSkills.length >= 4) skillsPts = 14;
  else if (allSkills.length > 0) skillsPts = 8;

  // 4. Experience & Measurable Impact (25 pts)
  let expPts = 0;
  const allBullets = (resume.experience || []).flatMap((e) => e.bullets || []);
  const metricRegex =
    /\b(\d+%|\d+x|\$\d+|\d+\+|\b\d+\s*(users|ms|s|clients|members|stars|seconds|minutes|hours|days|weeks|months))\b/i;
  const actionVerbRegex =
    /\b(architected|developed|engineered|optimized|implemented|spearheaded|streamlined|designed|deployed|built|accelerated|reduced|increased)\b/i;

  let bulletsWithMetrics = 0;
  let bulletsWithAction = 0;
  for (const b of allBullets) {
    if (metricRegex.test(b)) bulletsWithMetrics++;
    if (actionVerbRegex.test(b)) bulletsWithAction++;
  }

  if (allBullets.length >= 4) {
    expPts += 10;
    if (bulletsWithAction >= 3) expPts += 8;
    if (bulletsWithMetrics >= 2) expPts += 7;
    else if (bulletsWithMetrics >= 1) expPts += 4;
  } else if (allBullets.length > 0) {
    expPts += 12;
    if (bulletsWithAction >= 1) expPts += 4;
  } else {
    expPts += 5;
  }

  // 5. Education & Projects (20 pts)
  let eduProjectPts = 0;
  if (resume.education && resume.education.length > 0) eduProjectPts += 10;
  if (resume.projects && resume.projects.length >= 2) eduProjectPts += 10;
  else if (resume.projects && resume.projects.length > 0) eduProjectPts += 6;

  const total = Math.min(100, Math.max(30, contactPts + summaryPts + skillsPts + expPts + eduProjectPts));

  return {
    total,
    categories: [
      { category: "Contact & Header Hierarchy", score: contactPts, max: 15 },
      { category: "Professional Summary Quality", score: summaryPts, max: 15 },
      { category: "Skills Coverage & Keywords", score: skillsPts, max: 25 },
      { category: "Experience & Quantifiable Metrics", score: expPts, max: 25 },
      { category: "Projects & Education Depth", score: eduProjectPts, max: 20 },
    ],
  };
}
