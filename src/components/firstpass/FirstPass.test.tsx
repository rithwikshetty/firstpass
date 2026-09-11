import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FirstPass } from "./FirstPass";
import type { ReviewEvent } from "@/lib/review-stream";
import type { ReviewResult } from "@/lib/schema";

const review: ReviewResult = {
  match_score: 80, match_summary: "Résumé fits the role.",
  keywords: { present: [], missing: [], semantic: [] },
  experience_alignment: { score: 80, explanation: "Aligned." },
  skills_gap: { score: 80, present: [], missing: [] },
  formatting: { score: 80, issues: [] },
  section_completeness: { score: 80, present: [], missing: [] },
  suggestions: [],
};
const fetchMock = vi.fn();
const encoder = new TextEncoder();
let controller: ReadableStreamDefaultController<Uint8Array>;

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValueOnce(Response.json({ authed: true }));
  fetchMock.mockResolvedValueOnce(new Response(new ReadableStream<Uint8Array>({
    start(value) { controller = value; },
  })));
});

afterEach(() => vi.unstubAllGlobals());

async function startReview() {
  const view = render(<FirstPass />);
  await screen.findByRole("button", { name: "Review my CV" });
  fireEvent.drop(screen.getByRole("button", { name: /Drop your CV/ }), { dataTransfer: { files: [new File(["cv"], "cv.pdf")] } });
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "TypeScript engineer" } });
  fireEvent.click(screen.getByRole("button", { name: "Review my CV" }));
  await screen.findByText("Screening…");
  return view;
}

async function send(...events: ReviewEvent[]) {
  await act(async () => {
    controller.enqueue(encoder.encode(events.map((event) => JSON.stringify(event) + "\n").join("")));
  });
}

describe("FirstPass streaming workflow", () => {
  it("sends one multipart request and handles split lines, UTF-8, stages and later consolidation", async () => {
    await startReview();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, options] = fetchMock.mock.calls[1];
    expect(url).toBe("/api/review");
    expect(options.body.get("effort")).toBeNull();
    expect(options.body.get("cv").name).toBe("cv.pdf");
    expect(options.body.get("jobDescription")).toBe("TypeScript engineer");
    await send({ type: "ping" }, { type: "stage", model: "claude", stage: "keywords" });
    expect(screen.getByText("Matching keywords")).toBeInTheDocument();
    const bytes = encoder.encode(JSON.stringify({ type: "review", model: "claude", data: review }) + "\n");
    const split = bytes.indexOf(0xc3) + 1;
    await act(async () => { controller.enqueue(bytes.slice(0, split)); });
    expect(screen.getByText("Screening…")).toBeInTheDocument();
    await act(async () => { controller.enqueue(bytes.slice(split)); });
    expect(screen.getByText("Screening…")).toBeInTheDocument();
    await send({ type: "review", model: "gpt", data: review });
    expect(screen.getAllByText(/Résumé fits the role/)).toHaveLength(2);
    expect(screen.getByText("Reading both screeners together…")).toBeInTheDocument();
    await send({ type: "consolidation", data: {
      headline_verdict: "The consolidated verdict.", consensus: { scores: "Claude 80 · GPT 80", agreement_note: "Agree." },
      lead_with: [], fix_first: [], honest_caveat: null,
    } }, { type: "done" });
    expect(screen.getByText("The consolidated verdict.")).toBeInTheDocument();
    expect(screen.queryByText("Reading both screeners together…")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows a per-model error and clears the consolidation skeleton on done", async () => {
    await startReview();
    await send({ type: "review", model: "gpt", error: "GPT failed." }, { type: "review", model: "claude", data: review }, { type: "done" });
    expect(screen.getByText("GPT failed.")).toBeInTheDocument();
    expect(screen.getByText(/Résumé fits the role/)).toBeInTheDocument();
    expect(screen.queryByText("Reading both screeners together…")).not.toBeInTheDocument();
    expect(screen.queryByText("The short version")).not.toBeInTheDocument();
  });

  it("preserves a completed review when the stream disconnects early", async () => {
    await startReview();
    await send({ type: "review", model: "claude", data: review });
    await act(async () => controller.close());
    expect(screen.getByText(/Résumé fits the role/)).toBeInTheDocument();
    expect(screen.getByText("The review connection ended early. Please try again.")).toBeInTheDocument();
  });

  it("aborts on reset and ignores a late consolidation", async () => {
    await startReview();
    await send({ type: "review", model: "claude", data: review }, { type: "review", model: "gpt", data: review });
    fireEvent.click(screen.getByRole("button", { name: /New review/ }));
    expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(true);
    await send({ type: "consolidation", error: "Late result" }, { type: "done" });
    expect(screen.getByRole("button", { name: "Review my CV" })).toBeInTheDocument();
    expect(screen.queryByText(/Couldn’t summarise/)).not.toBeInTheDocument();
  });

  it("aborts the request on unmount", async () => {
    const view = await startReview();
    view.unmount();
    expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(true);
    await act(async () => controller.close());
  });

  it.each([401, 413])("handles a pre-stream %s JSON error", async (status) => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(Response.json({ authed: true }));
    fetchMock.mockResolvedValueOnce(Response.json({ error: "Request too large." }, { status }));
    const view = render(<FirstPass />);
    await screen.findByRole("button", { name: "Review my CV" });
    fireEvent.drop(screen.getByRole("button", { name: /Drop your CV/ }), { dataTransfer: { files: [new File(["cv"], "cv.pdf")] } });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Engineer" } });
    fireEvent.click(screen.getByRole("button", { name: "Review my CV" }));
    if (status === 401) {
      await screen.findByText("Session expired — please sign in again.");
    } else {
      expect(await screen.findByText("Request too large. · Request too large.")).toBeInTheDocument();
    }
    view.unmount();
  });
});
