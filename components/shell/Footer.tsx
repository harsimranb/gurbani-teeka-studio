"use client";

import { useEffect, useState } from "react";
import { notifyDataChanged } from "@/lib/client/events";
import { getMockEvalMode, resetMockStore, setMockEvalMode, type MockEvalMode } from "@/lib/client/mock-store";
import { cn } from "@/lib/utils";

const MOCKS_ON = process.env.NEXT_PUBLIC_USE_MOCKS === "1";

function MockChip() {
  const [mode, setMode] = useState<MockEvalMode>("unavailable");
  useEffect(() => { setMode(getMockEvalMode()); }, []);
  const choose = (next: MockEvalMode) => { setMockEvalMode(next); setMode(next); notifyDataChanged(); };
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-dashed border-line-strong px-2.5 py-1 text-xs text-muted">
      <span className="font-mono font-semibold text-ink">Mock data</span>
      <button
        type="button"
        onClick={() => { resetMockStore(); window.location.reload(); }}
        className="rounded text-xs font-medium text-link underline underline-offset-2 hover:text-link-dark"
      >
        Reset demo data
      </button>
      <span className="flex items-center gap-1.5" role="group" aria-label="Evaluation sample">
        Eval sample:
        {(["unavailable", "synthetic"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={mode === option}
            onClick={() => choose(option)}
            className={cn("rounded px-1.5 py-px text-xs", mode === option ? "bg-navy font-semibold text-white" : "text-muted underline underline-offset-2 hover:text-ink")}
          >
            {option}
          </button>
        ))}
      </span>
    </div>
  );
}

/** POST a dev route. Resolves with a short status message; never throws. */
async function postDev(path: string): Promise<{ ok: boolean; message: string }> {
  try {
    const response = await fetch(path, { method: "POST" });
    if (response.ok) return { ok: true, message: "Done." };
    let reason = `Request failed (HTTP ${response.status}).`;
    try {
      const body = (await response.json()) as { error?: { reason?: unknown } };
      if (typeof body.error?.reason === "string" && body.error.reason.trim()) reason = body.error.reason;
    } catch { /* keep the generic message */ }
    return { ok: false, message: reason };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Request failed." };
  }
}

function DevChip() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const run = async (path: string, afterOk: () => void) => {
    setBusy(true);
    setStatus(null);
    const result = await postDev(path);
    setBusy(false);
    if (result.ok) afterOk(); else setStatus(result);
  };
  const action = "rounded text-xs font-medium text-link underline underline-offset-2 hover:text-link-dark disabled:cursor-not-allowed disabled:opacity-50";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-dashed border-line-strong px-2.5 py-1 text-xs text-muted">
      <span className="font-mono font-semibold text-ink">Dev data</span>
      <button
        type="button"
        disabled={busy}
        onClick={() => void run("/api/dev/seed-synthetic", () => { setStatus({ ok: true, message: "Synthetic demo drafts loaded." }); notifyDataChanged(); })}
        className={action}
      >
        Load synthetic demo drafts
      </button>
      <button type="button" disabled={busy} onClick={() => void run("/api/dev/reset", () => window.location.reload())} className={action}>
        Reset dev data
      </button>
      {status ? <span role="status" className={status.ok ? "text-ok" : "text-error"}>{status.ok ? "" : "Failed: "}{status.message}</span> : null}
    </div>
  );
}

export function Footer() {
  return (
    <footer className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-x-6 gap-y-2.5 border-t border-line px-7 pt-4 pb-7 text-xs text-muted">
      <span className="inline-flex items-center gap-2.5">
        {/* TODO(FR-21): replace this text badge with the real BaniDB logo (<img src="/banidb-logo.svg">) once supplied. */}
        <span className="inline-flex h-6 items-center rounded border border-faint px-2 text-[11px] text-body">BaniDB</span>
        Gurmukhi text and metadata from BaniDB (Khalis Foundation)
      </span>
      <span>Eko · code MIT · SikhRI&apos;s translations and documents remain SikhRI&apos;s</span>
      {MOCKS_ON ? <MockChip /> : process.env.NODE_ENV !== "production" ? <DevChip /> : null}
    </footer>
  );
}
