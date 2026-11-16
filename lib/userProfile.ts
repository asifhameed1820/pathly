export interface UserProject {
  name: string;
  description: string;
  tech: string[];
}

export interface UserProfileContext {
  fullName: string;
  email: string;
  location: string;
  readinessScore: number;
  resumeScore: number;
  interests: string[];
  skills: string[];
  experience: string;
  experienceYears: number;
  projects: UserProject[];
  targetRoles: string[];
  education: string;
  cgpa?: string | number;
  certifications?: string[];
}

export const DEFAULT_USER_PROFILE: UserProfileContext = {
  fullName: "Alex Morgan",
  email: "alex.morgan@pathly.ai",
  location: "Chennai, Tamil Nadu",
  readinessScore: 82,
  resumeScore: 86,
  interests: ["Frontend Development", "UI/UX", "Technology"],
  skills: [
    "React",
    "JavaScript",
    "TypeScript",
    "Tailwind CSS",
    "HTML5 / CSS3",
    "Git & GitHub",
    "REST APIs",
    "Communication",
    "Problem Solving",
  ],
  experience: "Junior Web Developer · 1+ Year (PixelCraft Labs)",
  experienceYears: 1.5,
  projects: [
    {
      name: "Pathly Career Portal",
      description: "Interactive career discovery and prep web application with reactive UI components and stateful dashboard.",
      tech: ["React", "TypeScript", "Tailwind CSS", "Next.js"],
    },
    {
      name: "E-Commerce Mobile Storefront",
      description: "High-performance shopping web application featuring dynamic cart, instant search filtering, and checkout flows.",
      tech: ["React", "JavaScript", "REST APIs", "Tailwind CSS"],
    },
  ],
  targetRoles: ["Frontend Developer", "UI/UX Designer", "TNPSC Group 4"],
  education: "Bachelor of Engineering in Computer Science (Anna University, 2021–2025)",
  cgpa: "8.4 / 10",
  certifications: ["Meta Frontend Developer Professional Certificate"],
};

const STORAGE_KEY = "pathly_user_profile_data";

export function loadUserProfile(): UserProfileContext {
  if (typeof window === "undefined") return DEFAULT_USER_PROFILE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_USER_PROFILE;
    const parsed = JSON.parse(raw);
    
    // Clear out stale/accumulated presets if not aligned with user profile
    const validInterests = parsed.interests && parsed.interests.length > 0 && !parsed.interests.includes("Business & Management &")
      ? parsed.interests
      : DEFAULT_USER_PROFILE.interests;

    return { 
      ...DEFAULT_USER_PROFILE, 
      ...parsed,
      interests: validInterests 
    };
  } catch {
    return DEFAULT_USER_PROFILE;
  }
}

export function saveUserProfile(profile: Partial<UserProfileContext>): UserProfileContext {
  if (typeof window === "undefined") return DEFAULT_USER_PROFILE;
  try {
    const current = loadUserProfile();
    const updated = { ...current, ...profile };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return DEFAULT_USER_PROFILE;
  }
}

