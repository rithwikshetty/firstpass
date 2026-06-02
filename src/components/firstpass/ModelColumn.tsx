import type { ReactNode } from "react";
import type { ReviewResult } from "@/lib/schema";
import type { ModelKey, ModelResult } from "./types";
import { MODEL_LABEL, MODEL_SUBLABEL } from "./types";
import { Dot, Meter } from "./ui";

/**
 * One model's complete review, shown on its own. The two columns sit side by
 * side so the reader can compare the screeners directly — we deliberately do
 * NOT merge or reconcile the two reads, since each model phrases things its own
 * way and cross-matching free text invents agreement that isn't there.
 */

function standingLabel(score: number): string {
  if (score >= 78) return "Strong match";
  if (score >= 58) return "Moderate match";
  return "Needs work";
}

/* A labelled sub-section inside the column, optionally with a 0–100 score. */
function Block({
  label,
  score,
  model,
  children,
}: {
  label: string;
  score?: number;
  model: ModelKey;
  children: ReactNode;
}) {
  return (
    <section className="mt-[22px] border-t border-line-soft pt-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.15em] text-ink-45">
          {label}
        </h3>
        {typeof score === "number" && (
          <span className="text-[0.8rem] font-semibold tabular-nums text-ink">
            {Math.round(score)}
            <span className="font-normal text-ink-25">/100</span>
          </span>
        )}
      </div>
      {typeof score === "number" && (
        <div className="mb-[14px]">
          <Meter value={score} model={model} />
        </div>
      )}
      {children}
    </section>
  );
}

/* A small muted sub-label between groups of terms. */
function Mini({ children }: { children: ReactNode }) {
  return (
    <div className="mb-[7px] mt-[15px] text-[0.74rem] text-ink-45 first:mt-0">
      {children}
    </div>
  );
}

/* Wrapped keyword chips, present (plain) or missing (struck through). */
function Terms({ terms, tone }: { terms: string[]; tone: "present" | "missing" }) {
  if (terms.length === 0) {
    return <p className="text-[0.85rem] text-ink-25">None noted.</p>;
  }
  return (
    <div className="flex flex-wrap gap-[7px]">
      {terms.map((t) => (
        <span
          key={t}
          className={`rounded-md bg-canvas px-[9px] py-[3px] text-[0.83rem] ${
            tone === "present"
              ? "text-ink-70"
              : "text-ink-45 line-through decoration-ink-25"
          }`}
        >
          {t}
        </span>
      ))}
    </div>
  );
}

/* A simple dashed list (formatting issues). */
function Bullets({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <p className="text-[0.85rem] text-ink-25">Nothing flagged.</p>;
  }
  return (
    <ul className="space-y-[9px]">
      {items.map((it, i) => (
        <li
          key={i}
          className="grid grid-cols-[14px_1fr] gap-2 text-[0.92rem] leading-[1.45] text-ink-70"
        >
          <span className="select-none text-ink-25">–</span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

function Review({ model, data }: { model: ModelKey; data: ReviewResult }) {
  return (
    <>
      <p className="text-[0.96rem] leading-[1.5] text-ink-70">
        “{data.match_summary}”
      </p>

      <Block label="Keywords" model={model}>
        <Mini>Present in your CV</Mini>
        <Terms terms={data.keywords.present} tone="present" />
        {data.keywords.semantic.length > 0 && (
          <>
            <Mini>Semantic matches</Mini>
            <ul className="space-y-[6px]">
              {data.keywords.semantic.map((s, i) => (
                <li key={i} className="text-[0.86rem] leading-[1.4]">
                  <span className="font-medium text-ink">{s.term}</span>
                  <span className="text-ink-25"> ≈ </span>
                  <span className="text-ink-45">{s.match}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <Mini>Missing</Mini>
        <Terms terms={data.keywords.missing} tone="missing" />
      </Block>

      <Block
        label="Experience alignment"
        score={data.experience_alignment.score}
        model={model}
      >
        <p className="text-[0.9rem] leading-[1.5] text-ink-70">
          {data.experience_alignment.explanation}
        </p>
      </Block>

      <Block label="Skills" score={data.skills_gap.score} model={model}>
        <Mini>Has</Mini>
        <Terms terms={data.skills_gap.present} tone="present" />
        <Mini>Lacks</Mini>
        <Terms terms={data.skills_gap.missing} tone="missing" />
      </Block>

      <Block label="Formatting" score={data.formatting.score} model={model}>
        <Bullets items={data.formatting.issues} />
      </Block>

      <Block
        label="Section completeness"
        score={data.section_completeness.score}
        model={model}
      >
        <Mini>Present</Mini>
        <Terms terms={data.section_completeness.present} tone="present" />
        <Mini>Missing</Mini>
        <Terms terms={data.section_completeness.missing} tone="missing" />
      </Block>

      <Block label="Suggested edits" model={model}>
        <ol className="space-y-[11px]">
          {data.suggestions.map((s, i) => (
            <li
              key={i}
              className="grid grid-cols-[18px_1fr] gap-[10px] text-[0.92rem] leading-[1.45] text-ink-70"
            >
              <span className="text-[0.82rem] font-semibold tabular-nums text-ink-25">
                {i + 1}
              </span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </Block>
    </>
  );
}

export function ModelColumn({
  model,
  result,
}: {
  model: ModelKey;
  result: ModelResult;
}) {
  const color = model === "claude" ? "text-claude" : "text-gpt";
  const data = result.data;

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface md:min-h-0 md:max-h-[calc(100dvh-120px)] md:flex-1">
      {/* Identity bar — stays put while the body scrolls. */}
      <div className="flex items-start justify-between gap-4 border-b border-line px-6 pb-[14px] pt-[18px]">
        <div>
          <div className="flex items-center gap-[9px]">
            <Dot model={model} />
            <span className="text-[1rem] font-bold">{MODEL_LABEL[model]}</span>
            <span className="text-[0.78rem] text-ink-45">
              {MODEL_SUBLABEL[model]}
            </span>
          </div>
          {data && (
            <div className="mt-[5px] text-[0.78rem] text-ink-45">
              {standingLabel(data.match_score)}
            </div>
          )}
        </div>
        {data && (
          <span
            className={`text-[2rem] font-semibold leading-none tabular-nums ${color}`}
          >
            {Math.round(data.match_score)}
          </span>
        )}
      </div>

      {/* Body — scrolls independently on desktop. */}
      <div className="fp-scroll flex-1 overflow-y-auto px-6 pb-7 pt-[18px] md:min-h-0">
        {data ? (
          <Review model={model} data={data} />
        ) : (
          <div className="py-4">
            <p className="text-[0.95rem] font-semibold text-ink">
              {MODEL_LABEL[model]} couldn’t finish.
            </p>
            <p className="mt-2 text-[0.9rem] leading-[1.5] text-ink-70">
              {result.error || "It returned an error."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
