"use client";

import Link from "next/link";
import { Banner, Button, buttonStyles, Card, StatusPill } from "@/components/ui";
import { cn } from "@/lib/utils";

export interface SaveBarProps {
  shabadId: string;
  anyDirty: boolean;
  saving: boolean;
  hasDrafts: boolean;
  needsName: boolean;
  /** Drafts whose current-version check runs are missing. */
  needsRerun: boolean;
  rerunning: boolean;
  /** Drafts in draft/changes_requested status. */
  markableCount: number;
  marking: boolean;
  /** Label shown after marking (for example "Ready for review"), when nothing is left to mark. */
  statusLabel: string | null;
  savedMessage: string | null;
  error: string | null;
  onSave: () => void;
  onMarkReady: () => void;
  onRerun: () => void;
}

const LINK_BUTTON = cn(buttonStyles({ variant: "secondary" }), "min-h-11 px-[18px] font-medium no-underline");

export function SaveBar(props: SaveBarProps) {
  const { anyDirty, saving, needsName } = props;
  return (
    <Card className="flex flex-col gap-3 px-[18px] py-3.5">
      {props.error ? <Banner tone="error">{props.error}</Banner> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          {props.savedMessage || props.statusLabel ? (
            <span className="flex flex-wrap items-center gap-2 text-[13px] text-body" role="status">
              {props.savedMessage}
              {props.statusLabel ? <StatusPill tone="ok">{props.statusLabel}</StatusPill> : null}
            </span>
          ) : null}
          {needsName ? <span className="text-[13px] text-body">Enter your name (top right) to save or mark ready.</span> : null}
          <span className="text-xs text-muted">You write every word. Eko reviews and never writes or suggests translation text.</span>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {props.needsRerun && !anyDirty ? <Button className="min-h-11 px-[18px]" disabled={needsName || props.rerunning} onClick={props.onRerun}>{props.rerunning ? "Re-running checks…" : "Re-run checks"}</Button> : null}
          <Button className="min-h-11 px-[18px]" disabled={!anyDirty || saving || needsName} onClick={props.onSave}>{saving ? "Saving…" : "Save changes"}</Button>
          <Link href={`/workspace/${encodeURIComponent(props.shabadId)}/report`} className={LINK_BUTTON}>Open report card</Link>
          <Button variant="primary" className="min-h-11 px-[18px]" disabled={anyDirty || !props.hasDrafts || props.markableCount === 0 || props.marking || needsName} onClick={props.onMarkReady}>Mark ready for review</Button>
        </div>
      </div>
    </Card>
  );
}
