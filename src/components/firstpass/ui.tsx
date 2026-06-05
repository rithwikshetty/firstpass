import type { ModelKey } from "./types";

/* ── Brand wordmark — single source of truth; pass className to resize ── */
export function Brand({ className }: { className?: string } = {}) {
  return (
    <span className={className ?? "text-[1.18rem] font-semibold tracking-[-0.02em]"}>
      first<span className="text-claude">.</span>pass
    </span>
  );
}

/* ── Model dot ── */
export function Dot({ model, className = "" }: { model: ModelKey; className?: string }) {
  const color = model === "claude" ? "bg-claude" : "bg-gpt";
  return <span className={`inline-block h-2 w-2 rounded-full ${color} ${className}`} />;
}

/* ── Thin meter bar ── */
export function Meter({ value, model }: { value: number; model: ModelKey }) {
  const color = model === "claude" ? "bg-claude" : "bg-gpt";
  return (
    <div className="h-[5px] overflow-hidden rounded-full bg-line">
      <div
        className={`h-full rounded-full ${color}`}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

/* ── Section header (small label + hint, over a hairline) ── */
export function SectionHeader({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="mb-5 flex items-baseline justify-between gap-4">
      <span className="text-[0.74rem] font-semibold uppercase tracking-[0.16em] text-ink">
        {label}
      </span>
      {hint && <span className="text-right text-[0.82rem] text-ink-45">{hint}</span>}
    </div>
  );
}

/* ── Inline SVG icons ── */
type IconProps = { className?: string };

export function FileIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

export function JobIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className}>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}

export function UploadIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className={className}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export function EditIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className={className}>
      <path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
      <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={className}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className={className}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
