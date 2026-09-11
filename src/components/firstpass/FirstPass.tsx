"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MODELS,
  emptyResult,
  emptyConsolidation,
  type ModelKey,
  type ModelResult,
  type ConsolidationState,
  type Screen,
} from "./types";
import type { ReviewEvent, ReviewStage } from "@/lib/review-stream";
import { Gate } from "./Gate";
import { InputScreen } from "./InputScreen";
import { Analyzing } from "./Analyzing";
import { Results } from "./Results";

type Phase = "booting" | "gate" | Screen;

export function FirstPass() {
  const [phase, setPhase] = useState<Phase>("booting");

  // Gate
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // Input
  const [cvFiles, setCvFiles] = useState<File[]>([]);
  const [jobDescription, setJobDescription] = useState("");
  const [jobFiles, setJobFiles] = useState<File[]>([]);
  const [stages, setStages] = useState<Partial<Record<ModelKey, ReviewStage>>>({});

  // Results
  const [results, setResults] = useState<Record<ModelKey, ModelResult>>({
    claude: emptyResult,
    gpt: emptyResult,
  });

  // The consolidation lead — one honest plan built from both reviews.
  const [consolidation, setConsolidation] =
    useState<ConsolidationState>(emptyConsolidation);
  const abortRef = useRef<AbortController | null>(null);

  // Restore an existing session so a refresh doesn't force re-login.
  useEffect(() => {
    let active = true;
    fetch("/api/auth")
      .then((res) => res.json())
      .then((json) => active && setPhase(json.authed ? "input" : "gate"))
      .catch(() => active && setPhase("gate"));
    return () => {
      active = false;
      abortRef.current?.abort();
    };
  }, []);

  const handleAuth = useCallback(async () => {
    setAuthLoading(true);
    setAuthError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setAuthError(json.error || "Wrong password.");
        return;
      }
      setPassword("");
      setPhase("input");
    } catch {
      setAuthError("Connection error — please try again.");
    } finally {
      setAuthLoading(false);
    }
  }, [password]);

  const handleReview = useCallback(async () => {
    if (cvFiles.length === 0 || (!jobDescription.trim() && jobFiles.length === 0))
      return;

    setResults({
      claude: { data: null, error: null, loading: true },
      gpt: { data: null, error: null, loading: true },
    });
    setConsolidation({ data: null, error: null, loading: true });
    setStages({});
    setPhase("analyzing");
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    const received = new Set<ModelKey>();
    let finished = false;

    const dispatch = (event: ReviewEvent) => {
      switch (event.type) {
        case "stage":
          setStages((prev) => ({ ...prev, [event.model]: event.stage }));
          break;
        case "review":
          received.add(event.model);
          setResults((prev) => ({
            ...prev,
            [event.model]: {
              data: "data" in event ? event.data : null,
              error: "error" in event ? event.error : null,
              loading: false,
            },
          }));
          if (received.size === MODELS.length) setPhase("results");
          break;
        case "consolidation":
          setConsolidation({
            data: "data" in event ? event.data : null,
            error: "error" in event ? event.error : null,
            loading: false,
          });
          break;
        case "done":
          finished = true;
          setConsolidation((prev) => ({ ...prev, loading: false }));
          break;
        case "ping":
          break;
      }
    };

    const body = new FormData();
    cvFiles.forEach((cvFile) => body.append("cv", cvFile));
    body.append("jobDescription", jobDescription);
    jobFiles.forEach((jobFile) => body.append("jobFile", jobFile));

    try {
      const res = await fetch("/api/review", { method: "POST", body, signal: abort.signal });
      if (abort.signal.aborted) return;
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        if (abort.signal.aborted) return;
        if (res.status === 401) {
          setPhase("gate");
          setAuthError("Session expired — please sign in again.");
          return;
        }
        throw new Error(json.error || "Request failed.");
      }
      if (!res.body) throw new Error("No review stream received.");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      try {
        while (!finished) {
          const { value, done } = await reader.read();
          if (abort.signal.aborted) return;
          pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
          const lines = pending.split("\n");
          pending = lines.pop() ?? "";
          for (const line of lines) {
            if (line.trim()) dispatch(JSON.parse(line) as ReviewEvent);
          }
          if (done) break;
        }
        if (!finished || received.size !== MODELS.length) {
          throw new Error("The review connection ended early. Please try again.");
        }
      } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
    } catch (err) {
      if (abort.signal.aborted) return;
      const error = err instanceof Error ? err.message : "Network error.";
      setResults((prev) => ({
        claude: received.has("claude") ? prev.claude : { data: null, error, loading: false },
        gpt: received.has("gpt") ? prev.gpt : { data: null, error, loading: false },
      }));
      setPhase("results");
    } finally {
      if (!abort.signal.aborted) {
        setConsolidation((prev) => ({ ...prev, loading: false }));
      }
    }
  }, [cvFiles, jobDescription, jobFiles]);

  const handleReset = useCallback(() => {
    abortRef.current?.abort();
    setStages({});
    setResults({ claude: emptyResult, gpt: emptyResult });
    setConsolidation(emptyConsolidation);
    setPhase("input");
  }, []);

  // What to call the CV in the analyzing/results header: the filename when it's
  // a single document, otherwise a count.
  const cvLabel =
    cvFiles.length === 0
      ? "your CV"
      : cvFiles.length === 1
        ? cvFiles[0].name
        : `${cvFiles.length} documents`;

  if (phase === "booting") {
    return <div className="min-h-screen bg-canvas" />;
  }

  if (phase === "gate") {
    return (
      <Gate
        password={password}
        onPasswordChange={setPassword}
        onSubmit={handleAuth}
        error={authError}
        loading={authLoading}
      />
    );
  }

  if (phase === "analyzing") {
    return <Analyzing fileName={cvLabel} stages={stages} />;
  }

  if (phase === "results") {
    return (
      <Results
        results={results}
        fileName={cvLabel}
        onReset={handleReset}
        consolidation={consolidation}
      />
    );
  }

  return (
    <InputScreen
      cvFiles={cvFiles}
      onCvFilesChange={setCvFiles}
      jobDescription={jobDescription}
      onJobDescriptionChange={setJobDescription}
      jobFiles={jobFiles}
      onJobFilesChange={setJobFiles}
      onReview={handleReview}
    />
  );
}
