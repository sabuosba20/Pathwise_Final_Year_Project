export const FIELD_OPTIONS = [
  "Accounting and Finance",
  "Business Management",
  "Computer Science",
  "Data Science",
  "Engineering",
  "Information Technology",
  "Marketing",
  "Psychology",
  "Software Engineering",
];

const COMMON_SKILLS = [
  "Communication",
  "Critical thinking",
  "Data analysis",
  "Problem solving",
  "Project management",
  "Research",
  "Teamwork",
];

const FIELD_SKILLS = [
  { keywords: ["computer", "software", "information technology", "it"], skills: ["Python", "JavaScript", "SQL", "Git", "Algorithms", "Web development"] },
  { keywords: ["data", "analytics", "statistics"], skills: ["Python", "SQL", "Excel", "Statistics", "Data visualisation", "Machine learning"] },
  { keywords: ["business", "management", "marketing", "finance", "accounting"], skills: ["Excel", "Presentation", "Market research", "Financial analysis", "Leadership", "Digital marketing"] },
  { keywords: ["psychology", "social", "education"], skills: ["Research methods", "Academic writing", "Survey design", "Qualitative analysis", "Statistics", "Interviewing"] },
  { keywords: ["engineering"], skills: ["MATLAB", "CAD", "Technical drawing", "Simulation", "Project planning", "Technical writing"] },
];

export function normaliseSkill(skill) {
  return skill.trim().replace(/\s+/g, " ");
}

export function mergeSkills(current, incoming) {
  const merged = [...current];
  incoming.forEach((value) => {
    const skill = normaliseSkill(value);
    if (skill && !merged.some((item) => item.toLowerCase() === skill.toLowerCase())) merged.push(skill);
  });
  return merged.slice(0, 20);
}

export function parseSkills(value) {
  if (Array.isArray(value)) return mergeSkills([], value);
  return mergeSkills([], String(value || "").split(/[,;\n]+/));
}

export function getSkillSuggestions(fieldOfStudy, skills) {
  const field = fieldOfStudy.toLowerCase();
  const relevant = FIELD_SKILLS
    .filter((group) => group.keywords.some((keyword) => keyword.length <= 2 ? field.trim() === keyword : field.includes(keyword)))
    .flatMap((group) => group.skills);
  const candidates = relevant.length ? [...relevant, ...COMMON_SKILLS] : COMMON_SKILLS;
  return [...new Set(candidates)].filter(
    (suggestion) => !skills.some((skill) => skill.toLowerCase() === suggestion.toLowerCase()),
  ).slice(0, 8);
}
