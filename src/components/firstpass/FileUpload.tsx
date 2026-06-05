import { useRef, useState } from "react";
import { CloseIcon, FileIcon, UploadIcon } from "./ui";

const ACCEPT = [".pdf", ".docx"];
const isAccepted = (name: string) =>
  ACCEPT.some((ext) => name.toLowerCase().endsWith(ext));

const sameFile = (a: File, b: File) => a.name === b.name && a.size === b.size;

interface FileUploadProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
  /** Maximum number of files this section accepts. */
  max: number;
  /** Empty-state primary line, e.g. "Drop your CV, or click to browse". */
  prompt: string;
}

/**
 * The shared multi-file uploader used by both the CV and the job-description
 * sections. Accepts PDF/DOCX via drop or click, de-dupes, caps at `max`, and
 * lists attached files with a remove control. Controlled — the parent owns the
 * file list.
 */
export function FileUpload({ files, onFilesChange, max, prompt }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const addFiles = (incoming: FileList | File[]) => {
    const next = [...files];
    for (const candidate of Array.from(incoming)) {
      if (next.length >= max) break;
      if (isAccepted(candidate.name) && !next.some((f) => sameFile(f, candidate))) {
        next.push(candidate);
      }
    }
    if (next.length !== files.length) onFilesChange(next);
  };

  const removeAt = (index: number) =>
    onFilesChange(files.filter((_, i) => i !== index));

  const atMax = files.length >= max;

  return (
    <div>
      {files.length > 0 && (
        <ul className="mb-2 flex flex-col gap-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${file.size}-${index}`}
              className="flex items-center gap-3 rounded-xl border border-line bg-surface/40 px-3.5 py-2.5"
            >
              <FileIcon className="flex-none text-ink-45" />
              <span className="min-w-0 flex-1 truncate text-[0.86rem]">
                {file.name}
              </span>
              <button
                type="button"
                onClick={() => removeAt(index)}
                aria-label={`Remove ${file.name}`}
                className="-mr-1 flex h-7 w-7 flex-none items-center justify-center rounded-md text-ink-45 transition-colors hover:bg-line hover:text-ink"
              >
                <CloseIcon />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!atMax && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) =>
            (e.key === "Enter" || e.key === " ") && inputRef.current?.click()
          }
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            addFiles(e.dataTransfer.files);
          }}
          className={`flex cursor-pointer items-center gap-3 rounded-xl border border-dashed p-4 transition-colors ${
            dragActive
              ? "border-ink-45 bg-surface"
              : "border-line bg-surface/40 hover:border-ink-25 hover:bg-surface"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-[10px] border border-line bg-canvas text-ink-45">
            <UploadIcon />
          </div>
          <div className="min-w-0">
            <div className="text-[0.86rem] font-medium">
              {files.length > 0 ? "Add another file" : prompt}
            </div>
            <div className="mt-0.5 text-[0.76rem] text-ink-45">
              PDF or DOCX · up to {max} files
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
