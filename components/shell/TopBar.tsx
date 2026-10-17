"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { rulesetLabel } from "@/lib/contracts/domain";
import { useApi, useUserName } from "@/lib/client/hooks";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { LogoMark } from "./Logo";

const NAV = [
  { href: "/workspace", label: "Workspace" },
  { href: "/review", label: "Review" },
  { href: "/rules", label: "Rules" },
  { href: "/evaluation", label: "Evaluation" },
] as const;

function NameChip() {
  const { name, setName, ready } = useUserName();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const wrapper = useRef<HTMLDivElement>(null);
  const inputId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => { if (wrapper.current && !wrapper.current.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  if (!ready || !name) return null;
  const save = () => { if (value.trim()) { setName(value); setOpen(false); } };
  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        aria-label={`Your name: ${name}. Change name`}
        aria-expanded={open}
        onClick={() => { setValue(name); setOpen((o) => !o); }}
        className="inline-flex min-h-10 items-center gap-2 rounded-full bg-hint-bg py-0 pr-3.5 pl-1 text-sm font-medium text-ink hover:bg-line"
      >
        <span aria-hidden="true" className="inline-flex size-8 items-center justify-center rounded-full bg-navy text-[13px] font-semibold text-white">{name.trim().charAt(0).toUpperCase()}</span>
        {name}
      </button>
      {open ? (
        <form
          onSubmit={(event) => { event.preventDefault(); save(); }}
          className="absolute top-full right-0 z-40 mt-2 flex w-72 flex-col gap-3 rounded-xl border border-line bg-card p-4 shadow-lg"
        >
          <label htmlFor={inputId} className="text-sm font-semibold text-ink">Your name</label>
          <input
            id={inputId}
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            autoComplete="name"
            className="min-h-10 rounded-lg border border-line-strong px-3 text-[15px] text-ink focus:border-navy"
          />
          <p className="m-0 text-xs text-muted">Only later actions use the new name.</p>
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" variant="primary" type="submit" disabled={value.trim().length === 0}>Save</Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

export function TopBar() {
  const pathname = usePathname();
  const { name, ready } = useUserName();
  // Hide the nav links while the first-visit name prompt is up.
  const showNav = !(ready && !name);
  const queue = useApi("reviewQueue", {});
  const rules = useApi("listRules", {});
  const reviewCount = queue.data ? new Set(queue.data.drafts.map((draft) => draft.shabad_id)).size : 0;
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line bg-card px-7 py-2.5">
      <div className="flex flex-wrap items-center gap-x-7 gap-y-2">
        <Link href="/workspace" className="flex min-h-11 items-center gap-2.5 text-ink no-underline">
          <LogoMark />
          <span className="text-[21px] font-semibold tracking-tight">Eko</span>
        </Link>
        <nav aria-label="Main" className={cn("flex flex-wrap gap-0.5", !showNav && "invisible")} aria-hidden={!showNav}>
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 px-3 text-sm no-underline",
                  active ? "font-semibold text-ink shadow-[inset_0_-2px_0_var(--color-accent)]" : "font-medium text-muted hover:text-ink",
                )}
              >
                {item.label}
                {item.href === "/review" && reviewCount > 0 ? (
                  <span aria-label={`${reviewCount} in queue`} className="rounded-full bg-hint-bg px-[7px] text-[11px] font-semibold text-ink">{reviewCount}</span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <Link href="/rules" className="inline-flex min-h-8 items-center rounded-full border border-line-strong px-2.5 font-mono text-xs font-medium text-ink no-underline">
          Ruleset {rules.data ? rulesetLabel(rules.data.ruleset_version) : "…"}
        </Link>
        <NameChip />
      </div>
    </header>
  );
}
