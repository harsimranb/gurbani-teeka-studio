"use client";

import { useState } from "react";
import { useUserName } from "@/lib/client/hooks";

/** First-visit modal: asks for a name once per browser. No sign-in, no roles. */
export function NamePrompt() {
  const { name, setName, ready } = useUserName();
  const [value, setValue] = useState("");
  if (!ready || name) return null;
  const blank = value.trim().length === 0;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,28,46,0.35)] p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        onSubmit={(event) => { event.preventDefault(); if (!blank) setName(value); }}
        className="flex w-full max-w-[480px] flex-col gap-[18px] rounded-2xl border border-line bg-card p-8 shadow-[0_12px_40px_rgba(20,28,46,0.12)]"
      >
        <div className="flex flex-col gap-1.5">
          <h1 id="welcome-title" className="m-0 text-[26px] font-semibold tracking-tight text-ink">What should we call you?</h1>
          <p className="m-0 text-[15px] text-body">Eko saves your name with every draft, review decision and rule approval, so everyone can see who decided what, and why.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="eko-name" className="text-sm font-semibold text-ink">Your name</label>
          <input
            id="eko-name"
            type="text"
            autoFocus
            autoComplete="name"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="min-h-12 rounded-lg border-2 border-navy px-3.5 text-[17px] text-ink"
          />
        </div>
        <button
          type="submit"
          disabled={blank}
          className="inline-flex min-h-12 items-center justify-center rounded-lg bg-navy text-[15px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-hint-bg disabled:text-disabled-text"
        >
          Continue
        </button>
        <ul className="m-0 flex list-disc flex-col gap-1 border-t border-divider pt-3.5 pr-0 pb-0 pl-[18px] text-[13px] text-muted">
          <li>Asked once per browser. No sign-in and no password.</li>
          <li>No roles in this build: anyone can write, review and approve.</li>
          <li>Change it any time from your name in the top bar.</li>
        </ul>
      </form>
    </div>
  );
}
