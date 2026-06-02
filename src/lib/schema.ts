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
