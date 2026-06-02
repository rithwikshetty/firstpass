import { useRef, useState } from "react";
import { CheckIcon, UploadIcon } from "./ui";

const ACCEPT = [".pdf", ".docx"];
const isAccepted = (name: string) =>
  ACCEPT.some((ext) => name.toLowerCase().endsWith(ext));

interface DropzoneProps {
  file: File | null;
  onFile: (file: File) => void;
}

export function Dropzone({ file, onFile }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && isAccepted(dropped.name)) onFile(dropped);
  };

  return (
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
      onDrop={handleDrop}
      className={`flex cursor-pointer items-center gap-4 rounded-xl border p-5 transition-colors ${
        file
          ? "border-gpt bg-gpt/[0.06]"
          : dragActive
            ? "border-ink-45 bg-surface"
            : "border-line bg-surface/40 hover:border-ink-25 hover:bg-surface"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx"
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) onFile(picked);
        }}
      />
      <div
        className={`flex h-11 w-11 flex-none items-center justify-center rounded-[10px] border ${
          file ? "border-gpt/30 text-gpt" : "border-line text-ink-45"
        } bg-canvas`}
      >
        {file ? <CheckIcon /> : <UploadIcon />}
      </div>
      <div className="min-w-0">
        <div className="truncate text-[0.92rem] font-semibold">
          {file ? file.name : "Drop your file, or click to browse"}
        </div>
        <div className="mt-0.5 text-[0.8rem] text-ink-45">
          {file ? "Attached · click to change" : "PDF or DOCX"}
        </div>
      </div>
    </div>
  );
}
