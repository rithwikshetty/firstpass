import type { ModelResult, ConsolidationState } from "./types";
import { Brand, EditIcon } from "./ui";
import { ModelColumn } from "./ModelColumn";
import { Consolidation } from "./Consolidation";

interface ResultsProps {
  results: Record<"claude" | "gpt", ModelResult>;
  fileName: string;
  onReset: () => void;
  consolidation?: ConsolidationState;
}

function Header({ onReset }: { onReset: () => void }) {
  return (
    <header className="sticky top-0 z-10 mx-auto flex w-full max-w-[1200px] items-center justify-between bg-canvas px-7 py-5">
      <Brand />
      <button
        type="button"
        onClick={onReset}
        className="flex items-center gap-[7px] text-[0.85rem] text-ink-45 transition-colors hover:text-ink"
      >
        <EditIcon /> New review
      </button>
      <span className="pointer-events-none absolute inset-x-7 bottom-0 h-px bg-line" />
    </header>
  );
}

function BothFailed({
  results,
  onReset,
}: {
  results: Record<"claude" | "gpt", ModelResult>;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-20 text-center">
      <h1 className="text-[1.6rem] font-bold">Both screeners failed.</h1>
      <p className="mx-auto mt-2 max-w-[46ch] text-ink-70">
        {results.claude.error || "Claude errored."} ·{" "}
        {results.gpt.error || "GPT errored."}
      </p>
      <button
        type="button"
        onClick={onReset}
        className="mt-6 rounded-[11px] bg-ink px-6 py-3 text-[0.95rem] font-semibold text-canvas hover:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}

export function Results({ results, fileName, onReset, consolidation }: ResultsProps) {
  const noneOk = !results.claude.data && !results.gpt.data;

  return (
    <div className="fp-fade flex min-h-screen flex-col">
      <Header onReset={onReset} />

      <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col px-7 pb-12 pt-[14px]">
        <p className="mb-6 text-[0.82rem] text-ink-45">
          <span className="font-semibold text-ink-70">{fileName}</span> · screened
          by two independent AI models
        </p>

        {noneOk ? (
          <BothFailed results={results} onReset={onReset} />
        ) : (
          <>
            {consolidation && (
              <div className="mb-9">
                <Consolidation state={consolidation} />
              </div>
            )}

            <div className="mb-[18px] flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line pt-5">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-ink-45">
                Both screeners, in full
              </span>
              <span className="text-[0.78rem] text-ink-25">
                each model’s own read — side by side, unmerged
              </span>
            </div>

            <div className="flex flex-col gap-5 md:flex-row md:items-stretch">
              <ModelColumn model="claude" result={results.claude} />
              <ModelColumn model="gpt" result={results.gpt} />
            </div>
          </>
        )}

        <p className="mt-10 text-center text-[0.78rem] text-ink-25">
          Simulated ATS screening — real results vary by employer configuration.
        </p>
      </main>
    </div>
  );
}
