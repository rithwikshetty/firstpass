import type { ReactNode } from "react";
import type { FixType } from "@/lib/consolidator";
import type { ConsolidationState } from "./types";
import { Dot } from "./ui";

/**
 * The lead: one honest read of BOTH screeners together — a plain verdict, the
 * two scores as-given, and a short prioritized fix-list. It never rewrites the
 * CV and never asserts a skill the CV doesn't state (gaps stay conditional,
 * typed "add_if_true"). If consolidation fails, this stays quiet — the two full
 * reviews below are the source of truth.
 */

const TYPE_LABEL: Record<FixType, string> = {
  reframe: "Reframe",
  add_if_true: "Add if true",
  format: "Format",
  redirect: "Consider",
};

const TYPE_COLOR: Record<FixType, string> = {
  reframe: "text-ink",
  add_if_true: "text-warn",
  format: "text-ink-45",
  redirect: "text-claude",
};

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-ink-45">
      {children}
    </div>
  );
}

export function Consolidation({ state }: { state: ConsolidationState }) {
  if (state.loading) {
    return (
      <section className="fp-fade">
        <Eyebrow>Reading both screeners together…</Eyebrow>
        <div className="animate-pulse space-y-3 motion-reduce:animate-none">
          <div className="h-7 w-[82%] rounded-md bg-line" />
          <div className="h-4 w-[46%] rounded-md bg-line-soft" />
        </div>
      </section>
    );
  }

  const plan = state.data;
  if (!plan) {
    return state.error ? (
      <p className="text-[0.82rem] text-ink-45">
        Couldn’t summarise the two reads — see both screeners in full below.
      </p>
    ) : null;
  }

  return (
    <section className="fp-rise">
      <Eyebrow>The short version</Eyebrow>

      <h2 className="text-[clamp(1.35rem,2.6vw,1.85rem)] font-bold leading-[1.18] tracking-[-0.015em] text-ink">
        {plan.headline_verdict}
      </h2>

      <p className="mt-3 text-[0.88rem] leading-[1.5]">
        <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
          <Dot model="claude" />
          <Dot model="gpt" />
          {plan.consensus.scores}
        </span>
        <span className="text-ink-45"> — {plan.consensus.agreement_note}</span>
      </p>

      {plan.honest_caveat && (
        <p className="mt-4 border-l-2 border-warn pl-3 text-[0.9rem] leading-[1.5] text-ink-70">
          {plan.honest_caveat}
        </p>
      )}

      <div className="mt-6 border-t border-line-soft pt-5">
        <Eyebrow>Fix first</Eyebrow>
        <ol className="space-y-[15px]">
          {plan.fix_first.map((f, i) => (
            <li key={i} className="grid grid-cols-[20px_1fr] gap-[10px]">
              <span className="pt-[2px] text-[0.8rem] font-semibold tabular-nums text-ink-25">
                {i + 1}
              </span>
              <div>
                <p className="text-[0.95rem] leading-[1.5] text-ink-70">
                  <span
                    className={`mr-2 text-[0.62rem] font-semibold uppercase tracking-[0.1em] ${TYPE_COLOR[f.type]}`}
                  >
                    {TYPE_LABEL[f.type]}
                  </span>
                  {f.action}
                </p>
                {f.grounding && (
                  <p className="mt-1 text-[0.78rem] leading-[1.45] text-ink-45">
                    {f.grounding}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
