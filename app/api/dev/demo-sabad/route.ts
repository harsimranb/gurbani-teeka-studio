// Dev-only mock source: serves the private, git-ignored demo Sabad so mock mode has source text.
// Real source reads belong to API-02. Never commit the fixture or copy its Gurmukhi.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { SabadSchema } from "@/lib/contracts/domain";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NEXT_PUBLIC_USE_MOCKS !== "1" && process.env.NODE_ENV === "production") {
    return NextResponse.json({ status: "unavailable", reason: "Not found." }, { status: 404 });
  }
  try {
    const raw = await readFile(path.join(process.cwd(), "lib/contracts/fixtures/sabad.demo.json"), "utf8");
    const parsed = SabadSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return NextResponse.json({ status: "unavailable", reason: "The demo Sabad file does not match the Sabad schema." });
    return NextResponse.json({ status: "available", sabad: parsed.data });
  } catch {
    return NextResponse.json({ status: "unavailable", reason: "The private demo Sabad fixture is not provisioned in this clone." });
  }
}
