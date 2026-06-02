import { Brand } from "./ui";

interface GateProps {
  password: string;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
  error: string;
  loading: boolean;
}

export function Gate({
  password,
  onPasswordChange,
  onSubmit,
  error,
  loading,
}: GateProps) {
  return (
    <div className="fp-fade flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-[330px] text-center">
        <div className="mb-5">
          <Brand className="text-[2.4rem] font-medium tracking-[-0.03em]" />
        </div>
        <p className="mb-7 text-[0.94rem] text-ink-45">
          See how AI screening tools really read your resume.
        </p>
        <input
          type="password"
          className="mb-5 w-full border-0 border-b-[1.5px] border-line bg-transparent px-1 py-3 text-center tracking-[0.14em] text-ink outline-none transition-colors placeholder:tracking-normal placeholder:text-ink-25 focus:border-ink focus:placeholder:text-transparent"
          placeholder="Enter password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
        />
        {error && <p className="mb-3 text-[0.85rem] text-claude">{error}</p>}
        <button
          type="button"
          className="w-full rounded-[11px] bg-ink px-5 py-[15px] text-[0.96rem] font-semibold text-canvas transition-[opacity,transform] hover:-translate-y-px hover:opacity-90 disabled:translate-y-0 disabled:opacity-30"
          onClick={onSubmit}
          disabled={loading || !password}
        >
          {loading ? "Checking…" : "Continue"}
        </button>
      </div>
    </div>
  );
}
