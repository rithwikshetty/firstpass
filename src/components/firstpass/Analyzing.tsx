import type { ModelKey } from "./types";
import { Brand } from "./ui";

function Bar({ w, h = "h-4", className = "" }: { w: string; h?: string; className?: string }) {
  return <div className={`${h} ${w} rounded-md bg-line ${className}`} />;
}

/**
 * Loading state while both models run. Deliberately a skeleton of the two-column
 * results layout rather than a progress bar — model latency is non-deterministic,
 * so a filling bar would imply a completion estimate we don't have. It mirrors the
 * real panes so nothing jumps when the reviews land. The two pulsing dots honestly
 * signal "both screeners are working".
 */
function SkeletonColumn({ model }: { model: ModelKey }) {
  const dot = model === "claude" ? "bg-claude" : "bg-gpt";
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface md:min-h-0 md:flex-1">
      <div className="flex items-center justify-between border-b border-line px-6 pb-[14px] pt-[18px]">
        <span className="flex items-center gap-[9px]">
          <span className={`h-2 w-2 animate-pulse motion-reduce:animate-none rounded-full ${dot}`} />
          <Bar w="w-16" h="h-[18px]" />
        </span>
        <Bar w="w-9" h="h-7" />
      </div>
      <div className="animate-pulse motion-reduce:animate-none px-6 pb-7 pt-[18px]">
        <Bar w="w-[92%]" h="h-3.5" className="mb-2.5" />
        <Bar w="w-[80%]" h="h-3.5" className="mb-2.5" />
        <Bar w="w-[58%]" h="h-3.5" />

        <div className="mt-[22px] border-t border-line-soft pt-5">
          <Bar w="w-24" h="h-3" className="mb-4" />
          <div className="flex flex-wrap gap-[7px]">
            <Bar w="w-16" h="h-6" />
            <Bar w="w-20" h="h-6" />
            <Bar w="w-14" h="h-6" />
            <Bar w="w-24" h="h-6" />
          </div>
        </div>

        <div className="mt-[22px] border-t border-line-soft pt-5">
          <Bar w="w-32" h="h-3" className="mb-4" />
          <Bar w="w-full" h="h-[5px]" className="mb-4 rounded-full" />
          <Bar w="w-[88%]" h="h-3.5" className="mb-2.5" />
          <Bar w="w-[64%]" h="h-3.5" />
        </div>
      </div>
    </div>
  );
}

export function Analyzing({ fileName }: { fileName: string }) {
  return (
    <div className="fp-fade flex min-h-screen flex-col md:h-screen md:overflow-hidden">
      <header className="relative mx-auto flex w-full max-w-[1200px] items-center justify-between px-7 py-5">
        <Brand />
        <span className="flex items-center gap-2 text-[0.85rem] text-ink-45">
          <span className="h-[7px] w-[7px] animate-pulse motion-reduce:animate-none rounded-full bg-claude" />
          <span className="h-[7px] w-[7px] animate-pulse motion-reduce:animate-none rounded-full bg-gpt [animation-delay:350ms]" />
          Screening…
        </span>
        <span className="pointer-events-none absolute inset-x-7 bottom-0 h-px bg-line" />
      </header>

      <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col px-7 pb-6 pt-[14px] md:min-h-0">
        <p className="mb-[18px] text-[0.82rem] text-ink-45">
          <span className="font-semibold text-ink-70">{fileName}</span> · screening
          against your job listing
        </p>

        <div className="flex flex-col gap-5 md:min-h-0 md:flex-1 md:flex-row">
          <SkeletonColumn model="claude" />
          <SkeletonColumn model="gpt" />
        </div>
      </main>
    </div>
  );
}
