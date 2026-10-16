import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Eko",
  description: "Review workspace for human-written transcreations",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
