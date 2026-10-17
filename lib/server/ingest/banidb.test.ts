import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

describe("private demo export provenance", () => {
  it("requires the approved local SQLite source, exact bytes and source IDs", async () => {
    const { verifyDemoProvenance } = await import("./banidb");
    const fixtureBytes = "SYNTHETIC TEST BYTES";
    const sabad = { shabad_id: "synthetic-sabad", lines: [{ line_id: "synthetic-line-1", is_rahao: true }] };
    const metadata = {
      source: "user-provided local BaniDB SQLite copy",
      source_path: "data/banidb/banidb.sqlite",
      source_table: "tmp_Verse",
      shabad_id: sabad.shabad_id,
      line_ids: ["synthetic-line-1"], line_count: 1,
      rahao_line_ids: ["synthetic-line-1"], normalization: "NFC",
      fixture_sha256: createHash("sha256").update(fixtureBytes).digest("hex"),
    };
    expect(() => verifyDemoProvenance(fixtureBytes, metadata, sabad)).not.toThrow();
    expect(() => verifyDemoProvenance(fixtureBytes + "!", metadata, sabad)).toThrow("hash");
    expect(() => verifyDemoProvenance(fixtureBytes, { ...metadata, source_table: "Verse" }, sabad)).toThrow();
    expect(() => verifyDemoProvenance(fixtureBytes, { ...metadata, source: "BaniDB hosted API; explicit one-time fallback" }, sabad)).toThrow();
    expect(() => verifyDemoProvenance(fixtureBytes, { ...metadata, line_ids: ["other-line"] }, sabad)).toThrow("line IDs");
  });
});
