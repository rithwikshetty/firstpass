import { FileUpload } from "./FileUpload";
import { Brand } from "./ui";
import { FileIcon, JobIcon, SearchIcon } from "./ui";
import { MAX_CV_FILES, MAX_JD_FILES } from "@/lib/budgets";

interface InputScreenProps {
  cvFiles: File[];
  onCvFilesChange: (files: File[]) => void;
  jobDescription: string;
  onJobDescriptionChange: (value: string) => void;
  jobFiles: File[];
  onJobFilesChange: (files: File[]) => void;
  onReview: () => void;
}

const labelClass =
  "mb-3 flex items-center gap-2 text-[0.78rem] font-semibold tracking-[0.04em] text-ink-70";

export function InputScreen({
  cvFiles,
  onCvFilesChange,
  jobDescription,
  onJobDescriptionChange,
  jobFiles,
  onJobFilesChange,
  onReview,
}: InputScreenProps) {
  const ready =
    cvFiles.length > 0 &&
    (jobDescription.trim().length > 0 || jobFiles.length > 0);

  return (
    <div className="fp-fade">
      <header className="sticky top-0 z-10 mx-auto flex max-w-[560px] items-center bg-canvas px-7 py-5">
        <Brand />
        <span className="pointer-events-none absolute inset-x-7 bottom-0 h-px bg-line" />
      </header>

      <div className="mx-auto w-full max-w-[560px] px-7 pb-20 pt-12">
        <div className="mb-9 text-center">
          <div className="mb-4 text-[0.74rem] font-medium uppercase tracking-[0.18em] text-ink-45">
            Two AI screeners · one CV
          </div>
          <h1 className="text-[clamp(2rem,5.2vw,2.7rem)] font-bold leading-[1.06] tracking-[-0.02em]">
            See how your CV actually reads.
          </h1>
          <p className="mx-auto mt-3 max-w-[42ch] text-[1.05rem] text-ink-70">
            Claude and GPT each screen it against the job you want — so you can
            see where they agree, and where they don’t.
          </p>
        </div>

        <div className="mb-6">
          <div className={labelClass}>
            <FileIcon className="opacity-45" /> Your CV &amp; related documents
          </div>
          <FileUpload
            files={cvFiles}
            onFilesChange={onCvFilesChange}
            max={MAX_CV_FILES}
            prompt="Drop your CV, or click to browse"
          />
        </div>

        <div className="mb-6">
          <div className={labelClass}>
            <JobIcon className="opacity-45" /> The job listing
          </div>
          <textarea
            className="min-h-[122px] w-full resize-y rounded-xl border border-line bg-surface/40 px-4 py-[14px] text-[0.92rem] leading-[1.6] text-ink outline-none transition-colors placeholder:text-ink-25 focus:border-ink-25 focus:bg-surface"
            placeholder="Paste the full job description here…"
            value={jobDescription}
            onChange={(e) => onJobDescriptionChange(e.target.value)}
          />
          <div className="my-3 flex items-center gap-3 text-[0.7rem] font-medium uppercase tracking-[0.14em] text-ink-25">
            <span className="h-px flex-1 bg-line" />
            or attach files
            <span className="h-px flex-1 bg-line" />
          </div>
          <FileUpload
            files={jobFiles}
            onFilesChange={onJobFilesChange}
            max={MAX_JD_FILES}
            prompt="Attach the listing, or click to browse"
          />
        </div>

        <button
          type="button"
          className="flex w-full items-center justify-center gap-[9px] rounded-[11px] bg-ink px-5 py-[15px] text-[0.96rem] font-semibold text-canvas transition-[opacity,transform] hover:-translate-y-px hover:opacity-90 disabled:translate-y-0 disabled:opacity-30"
          onClick={onReview}
          disabled={!ready}
        >
          <SearchIcon /> Review my CV
        </button>
        <p className="mt-[18px] text-center text-[0.8rem] text-ink-45">
          Your CV isn&apos;t stored after the review
        </p>
      </div>
    </div>
  );
}
