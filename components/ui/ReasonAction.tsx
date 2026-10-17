"use client";

import { useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, type ButtonVariant } from "./Button";

export interface ReasonActionItem {
  label: string;
  variant?: ButtonVariant;
  /** Receives the trimmed reason. May be async. */
  onClick: (reason: string) => void | Promise<void>;
}
export interface ReasonActionProps {
  /** Label above the textarea, for example "Reason for override". */
  label: string;
  placeholder?: string;
  actions: ReasonActionItem[];
  /** Disables every action and shows a spinner (a request is in flight). */
  busy?: boolean;
  /** Error from the last attempt, shown as an alert. */
  error?: string | null;
  className?: string;
}

/** Written reason plus action buttons. Every button stays disabled until the reason is nonblank. */
export function ReasonAction({ label, placeholder, actions, busy = false, error, className }: ReasonActionProps) {
  const [reason, setReason] = useState("");
  const id = useId();
  const empty = reason.trim().length === 0;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={`${id}-reason`} className="text-sm font-semibold text-ink">{label}</label>
      <textarea
        id={`${id}-reason`}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder={placeholder}
        rows={3}
        className="min-h-20 w-full resize-y rounded-lg border border-line-strong bg-card px-3 py-2 text-[15px] text-ink focus:border-navy"
      />
      <div className="flex flex-wrap items-center gap-2">
        {actions.map((action) => (
          <Button
            key={action.label}
            variant={action.variant ?? "secondary"}
            disabled={empty || busy}
            aria-describedby={empty ? `${id}-help` : undefined}
            onClick={() => { void action.onClick(reason.trim()); }}
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {action.label}
          </Button>
        ))}
        {empty ? <span id={`${id}-help`} className="text-[13px] text-muted">Enter a reason first</span> : null}
      </div>
      {error ? <p role="alert" className="m-0 text-sm text-error">{error}</p> : null}
    </div>
  );
}
