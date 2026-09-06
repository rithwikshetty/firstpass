export interface ReviewResult {
  match_score: number;
  match_summary: string;
  keywords: {
    present: string[];
    missing: string[];
    semantic: Array<{ term: string; match: string }>;
  };
  experience_alignment: {
    score: number;
    explanation: string;
  };
  skills_gap: {
    score: number;
    present: string[];
    missing: string[];
  };
  formatting: {
    score: number;
    issues: string[];
  };
  section_completeness: {
    score: number;
    present: string[];
    missing: string[];
  };
  suggestions: string[];
}

export const reviewJsonSchema = {
  type: "object",
  properties: {
    match_score: { type: "number" },
    match_summary: { type: "string" },
    keywords: {
      type: "object",
      properties: {
        present: { type: "array", items: { type: "string" } },
        missing: { type: "array", items: { type: "string" } },
        semantic: {
          type: "array",
          items: {
            type: "object",
            properties: {
              term: { type: "string" },
              match: { type: "string" },
            },
            required: ["term", "match"],
            additionalProperties: false,
          },
        },
      },
      required: ["present", "missing", "semantic"],
      additionalProperties: false,
    },
    experience_alignment: {
      type: "object",
      properties: {
        score: { type: "number" },
        explanation: { type: "string" },
      },
      required: ["score", "explanation"],
      additionalProperties: false,
    },
    skills_gap: {
      type: "object",
      properties: {
        score: { type: "number" },
        present: { type: "array", items: { type: "string" } },
        missing: { type: "array", items: { type: "string" } },
      },
      required: ["score", "present", "missing"],
      additionalProperties: false,
    },
    formatting: {
      type: "object",
      properties: {
        score: { type: "number" },
        issues: { type: "array", items: { type: "string" } },
      },
      required: ["score", "issues"],
      additionalProperties: false,
    },
    section_completeness: {
      type: "object",
      properties: {
        score: { type: "number" },
        present: { type: "array", items: { type: "string" } },
        missing: { type: "array", items: { type: "string" } },
      },
      required: ["score", "present", "missing"],
      additionalProperties: false,
    },
    suggestions: { type: "array", items: { type: "string" } },
  },
  required: [
    "match_score",
    "match_summary",
    "keywords",
    "experience_alignment",
    "skills_gap",
    "formatting",
    "section_completeness",
    "suggestions",
  ],
  additionalProperties: false,
};

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Structural check for a review coming back from the client. The consolidate
 * route re-reads both reviews from the request body, so the shape has to be
 * verified before any field is used.
 */
export function isReviewResult(value: unknown): value is ReviewResult {
  if (!isRecord(value)) return false;
  const {
    match_score,
    match_summary,
    keywords,
    experience_alignment,
    skills_gap,
    formatting,
    section_completeness,
    suggestions,
  } = value;

  return (
    isFiniteNumber(match_score) &&
    typeof match_summary === "string" &&
    isRecord(keywords) &&
    isStringArray(keywords.present) &&
    isStringArray(keywords.missing) &&
    Array.isArray(keywords.semantic) &&
    keywords.semantic.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.term === "string" &&
        typeof entry.match === "string",
    ) &&
    isRecord(experience_alignment) &&
    isFiniteNumber(experience_alignment.score) &&
    typeof experience_alignment.explanation === "string" &&
    isRecord(skills_gap) &&
    isFiniteNumber(skills_gap.score) &&
    isStringArray(skills_gap.present) &&
    isStringArray(skills_gap.missing) &&
    isRecord(formatting) &&
    isFiniteNumber(formatting.score) &&
    isStringArray(formatting.issues) &&
    isRecord(section_completeness) &&
    isFiniteNumber(section_completeness.score) &&
    isStringArray(section_completeness.present) &&
    isStringArray(section_completeness.missing) &&
    isStringArray(suggestions)
  );
}
