"use client";

import type { ReactNode } from "react";
import { Footer, NamePrompt, TopBar } from "@/components/shell";

/** Client shell for every studio page: top bar, main, footer and the first-visit name prompt. */
export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-card focus:p-2">Skip to content</a>
      <TopBar />
      <main id="main" className="mx-auto w-full max-w-[1440px] flex-1 px-7 pt-6 pb-10">{children}</main>
      <Footer />
      <NamePrompt />
    </div>
  );
}
