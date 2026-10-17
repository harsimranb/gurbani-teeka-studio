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

export function Footer() {
  return (
    <footer className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-x-6 gap-y-2.5 border-t border-line px-7 pt-4 pb-7 text-xs text-muted">
      <span className="inline-flex items-center gap-2.5">
        {/* TODO(FR-21): replace this text badge with the real BaniDB logo (<img src="/banidb-logo.svg">) once supplied. */}
        <span className="inline-flex h-6 items-center rounded border border-faint px-2 text-[11px] text-body">BaniDB</span>
        Gurmukhi text and metadata from BaniDB (Khalis Foundation)
      </span>
      <span>Eko · code MIT · SikhRI&apos;s translations and documents remain SikhRI&apos;s</span>
      {MOCKS_ON ? <MockChip /> : null}
    </footer>
  );
}
