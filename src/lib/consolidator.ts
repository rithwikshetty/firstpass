import type { ReviewResult } from "./schema";

/**
 * The consolidation layer turns the TWO independent model reviews into ONE
 * honest, get-to-the-point action plan. It is deliberately NOT a third
 * "judge": it does not re-score, and it does NOT rewrite the CV. An empirical
 * audit (5 real JDs, 6 independent auditors) showed that generated before/after
 * line rewrites drift into fabrication — inventing job titles, asserting tools
 * and platforms the CV never names. So this layer is restricted to the parts
 * the audit found honest: a plain verdict, the two scores as-given, and a short
 * prioritized fix-list where every genuine gap stays CONDITIONAL ("add X if
 * true"). Nothing the CV does not say is ever presented as fact.
 */

export type FixType = "reframe" | "add_if_true" | "format" | "redirect";

export interface ConsolidationPlan {
  headline_verdict: string;
  consensus: {
    scores: string;
    agreement_note: string;
  };
  fix_first: Array<{
    action: string;
    type: FixType;
    grounding: string;
    source: "both" | "claude" | "gpt";
  }>;
  honest_caveat: string | null;
}

export const consolidationJsonSchema = {
  type: "object",
  properties: {
    headline_verdict: { type: "string" },
    consensus: {
      type: "object",
      properties: {
        scores: { type: "string" },
        agreement_note: { type: "string" },
      },
      required: ["scores", "agreement_note"],
      additionalProperties: false,
    },
    fix_first: {
      type: "array",
      items: {
        type: "object",
        properties: {
          action: { type: "string" },
          type: { type: "string", enum: ["reframe", "add_if_true", "format", "redirect"] },
          grounding: { type: "string" },
          source: { type: "string", enum: ["both", "claude", "gpt"] },
        },
        required: ["action", "type", "grounding", "source"],
        additionalProperties: false,
      },
    },
    honest_caveat: { type: ["string", "null"] },
  },
  required: ["headline_verdict", "consensus", "fix_first", "honest_caveat"],
  additionalProperties: false,
};

export function buildConsolidationPrompt(
  cvText: string,
  jobDescription: string,
  claude: ReviewResult,
  gpt: ReviewResult,
) {
  const system = `You consolidate TWO independent ATS reviews of the SAME CV against ONE job description into a single, honest, get-to-the-point action plan for the job-seeker. Two AI screeners (Claude and GPT) have already scored and reviewed the CV. Your job is to tell the person, in plain language, where they stand and the few things to do next — NOT to re-score, and NOT to rewrite their CV for them.

ABSOLUTE RULES — honesty over helpfulness:
1. Never invent or imply experience, employers, job titles, tools, technologies, metrics, or skills. You may refer ONLY to what the CV actually contains.
2. Never assert — even with hedges like "likely" — that the candidate has a skill they did not name. If a skill is absent from the CV, it is a gap; say so. This applies to lead-ins and parentheticals too: never write "it almost certainly does", "you already deploy on X", or similar about anything the CV does not literally state. Phrase the WHOLE item conditionally instead ("If you used X …"). Do not fuse two separate CV facts (e.g. "Azure" in skills + "deployment" in a project) into a combined claim the CV never makes.
3. For genuine gaps, add a fix_first item with type "add_if_true", phrased conditionally ("If you have done X, name it explicitly using the term '…'"), and set grounding to "gap — not stated in CV". Never present a gap as something they already have.
4. For things the CV DOES contain but frames poorly for this job, use type "reframe": tell them how to surface or re-word real experience, and set grounding to the specific CV evidence it draws on.
5. Use type "format" for parsing/structure fixes. If you suggest adding contact details, dates, or job titles, phrase it as "add … if you have it" — never assume the specifics.
6. If the role has hard requirements the candidate clearly lacks (a credential, a seniority level, a whole domain), lead fix_first with a type "redirect" item and state it plainly in honest_caveat, pointing them toward a better-fit direction. Do not pretend wording fixes a real mismatch.
7. Do NOT re-score. Put the two given scores verbatim in consensus.scores, e.g. "Claude 82 · GPT 76" (the system also fills this field deterministically, so never alter the numbers). In agreement_note, say whether the two screeners broadly agree and on what.
8. Prefer points BOTH reviewers raised (source "both"); attribute single-reviewer points to "claude" or "gpt". Deduplicate — never repeat a fix.

Keep it tight: a job-seeker should be able to act in five minutes. Give 3–5 fixes, highest-leverage first. headline_verdict is 1–2 plain sentences on where this CV stands for THIS job. honest_caveat is null unless there is a real hard mismatch worth flagging.`;

  const user = `--- CV (raw extracted text) ---
${cvText}

--- JOB DESCRIPTION ---
${jobDescription}

--- CLAUDE'S REVIEW (JSON) ---
${JSON.stringify(claude)}

--- GPT'S REVIEW (JSON) ---
${JSON.stringify(gpt)}

Produce the consolidated action plan as structured output.`;

  return { system, user };
}
