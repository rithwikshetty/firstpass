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
import { Gate } from "./Gate";
import { InputScreen } from "./InputScreen";
import { Analyzing } from "./Analyzing";
import { Results } from "./Results";

type Phase = "booting" | "gate" | Screen;

interface FetchOutcome {
  status: number;
  data: ModelResult["data"];
  error: string | null;
}

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

  // Results
  const [results, setResults] = useState<Record<ModelKey, ModelResult>>({
    claude: emptyResult,
    gpt: emptyResult,
  });

  // The consolidation lead — one honest plan built from both reviews.
  const [consolidation, setConsolidation] =
    useState<ConsolidationState>(emptyConsolidation);
  // Identifies the current review run so a consolidation response from an
  // earlier run can't overwrite a newer one after "New review".
  const runIdRef = useRef(0);

  // Restore an existing session so a refresh doesn't force re-login.
  useEffect(() => {
    let active = true;
    fetch("/api/auth")
      .then((res) => res.json())
      .then((json) => active && setPhase(json.authed ? "input" : "gate"))
      .catch(() => active && setPhase("gate"));
    return () => {
      active = false;
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
    setConsolidation(emptyConsolidation);
    setPhase("analyzing");
    const runId = ++runIdRef.current;

    const fetchModel = async (model: ModelKey): Promise<FetchOutcome> => {
      const body = new FormData();
      cvFiles.forEach((cvFile) => body.append("cv", cvFile));
      body.append("jobDescription", jobDescription);
      jobFiles.forEach((jobFile) => body.append("jobFile", jobFile));

      try {
        const res = await fetch(`/api/review?model=${model}`, {
          method: "POST",
          body,
        });
        const json = await res.json().catch(() => ({}));
        const outcome: FetchOutcome = res.ok
          ? { status: res.status, data: json.data ?? null, error: json.error ?? null }
          : { status: res.status, data: null, error: json.error || "Request failed." };
        setResults((prev) => ({
          ...prev,
          [model]: { data: outcome.data, error: outcome.error, loading: false },
        }));
        return outcome;
      } catch {
        const outcome: FetchOutcome = {
          status: 0,
          data: null,
          error: "Network error.",
        };
        setResults((prev) => ({ ...prev, [model]: { ...outcome, loading: false } }));
        return outcome;
      }
    };

    const outcomes = await Promise.all(MODELS.map(fetchModel));

    // If the session lapsed and nothing came back, send the user back to the gate.
    if (outcomes.every((o) => o.status === 401)) {
      setPhase("gate");
      setAuthError("Session expired — please sign in again.");
      return;
    }
    setPhase("results");

    // Both reviews are in — consolidate them into one honest action plan. This
    // is a bonus lead layer (one Claude call, no re-screening); if it fails the
    // two full reviews still render below, so we never block on it.
    const [claudeOut, gptOut] = outcomes;
    if (claudeOut?.data && gptOut?.data) {
      setConsolidation({ data: null, error: null, loading: true });
      const body = new FormData();
      cvFiles.forEach((cvFile) => body.append("cv", cvFile));
      body.append("jobDescription", jobDescription);
      jobFiles.forEach((jobFile) => body.append("jobFile", jobFile));
      body.append("claude", JSON.stringify(claudeOut.data));
      body.append("gpt", JSON.stringify(gptOut.data));
      fetch("/api/consolidate", { method: "POST", body })
        .then(async (res) => {
          const json = await res.json().catch(() => ({}));
          if (runIdRef.current !== runId) return;
          setConsolidation({
            data: res.ok ? (json.data ?? null) : null,
            error: res.ok ? (json.error ?? null) : json.error || "Couldn’t summarise.",
            loading: false,
          });
        })
        .catch(() => {
          if (runIdRef.current !== runId) return;
          setConsolidation({ data: null, error: "Couldn’t summarise.", loading: false });
        });
    }
  }, [cvFiles, jobDescription, jobFiles]);

  const handleReset = useCallback(() => {
    runIdRef.current += 1;
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
    return <Analyzing fileName={cvLabel} />;
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
