import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

// Synthetic ASCII only: no private fixture, no Gurmukhi.
const fixtureBytes = "SYNTHETIC TEST BYTES";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const sabad = {
  shabad_id: "900",
  lines: [{ line_id: "9001", is_rahao: false }, { line_id: "9002", is_rahao: true }],
};
const identity = {
  shabad_id: "900", line_ids: ["9001", "9002"], line_count: 2,
  rahao_line_ids: ["9002"], normalization: "NFC", fixture_sha256: sha(fixtureBytes),
};
const local = {
  source: "user-provided local BaniDB SQLite copy",
  source_path: "data/banidb/banidb.sqlite", source_table: "tmp_Verse", ...identity,
};
const api = {
  exported_at: "2026-01-01T00:00:00.000Z",
  source: "BaniDB hosted API; explicit one-time fallback", source_id: "G",
  endpoint: "https://api.banidb.com/v2/shabads/900", ...identity,
  fixture_path: "lib/contracts/fixtures/sabad.demo.json", raw_response_path: "data/banidb/api-sabad-900.json",
  raw_response_sha256: sha("SYNTHETIC RAW"), metadata_mapping: "synthetic", terms: "synthetic", limitation: "synthetic",
};

describe("private demo export provenance", () => {
  it("accepts the local SQLite record and reports its kind", async () => {
    const { verifyDemoProvenance } = await import("./banidb");
    expect(verifyDemoProvenance(fixtureBytes, local, sabad)).toBe("local_sqlite");
    expect(() => verifyDemoProvenance(fixtureBytes + "!", local, sabad)).toThrow("hash");
    expect(() => verifyDemoProvenance(fixtureBytes, { ...local, source_table: "Verse" }, sabad)).toThrow();
    expect(() => verifyDemoProvenance(fixtureBytes, { ...local, source_path: "elsewhere.sqlite" }, sabad)).toThrow();
    expect(() => verifyDemoProvenance(fixtureBytes, { ...local, line_ids: ["other-line", "9002"] }, sabad)).toThrow("line IDs");
  });

  it("accepts the hosted-API fallback record and reports its kind", async () => {
    const { verifyDemoProvenance } = await import("./banidb");
    expect(verifyDemoProvenance(fixtureBytes, api, sabad)).toBe("banidb_api_fallback");
  });

  it.each([["local", local], ["api", api]] as const)("rejects a changed hash, line IDs, Rahao or count (%s)", async (_name, record) => {
    const { verifyDemoProvenance } = await import("./banidb");
    expect(() => verifyDemoProvenance(fixtureBytes + "!", record, sabad)).toThrow("hash");
    expect(() => verifyDemoProvenance(fixtureBytes, { ...record, line_ids: ["9001", "9003"] }, sabad)).toThrow("line IDs");
    expect(() => verifyDemoProvenance(fixtureBytes, { ...record, rahao_line_ids: ["9001"] }, sabad)).toThrow("Rahao");
    expect(() => verifyDemoProvenance(fixtureBytes, { ...record, rahao_line_ids: [] }, sabad)).toThrow("Rahao");
    expect(() => verifyDemoProvenance(fixtureBytes, { ...record, line_count: 3 }, sabad)).toThrow("line IDs");
    expect(() => verifyDemoProvenance(fixtureBytes, { ...record, shabad_id: "901" }, { ...sabad })).toThrow();
    expect(() => verifyDemoProvenance(fixtureBytes, { ...record, normalization: "NFD" }, sabad)).toThrow();
    expect(() => verifyDemoProvenance(fixtureBytes, { ...record, fixture_sha256: "abc" }, sabad)).toThrow();
  });

  it("rejects an unknown source string, including one mixed with the other record's fields", async () => {
    const { verifyDemoProvenance } = await import("./banidb");
    expect(() => verifyDemoProvenance(fixtureBytes, { ...api, source: "some other export" }, sabad)).toThrow("source");
    expect(() => verifyDemoProvenance(fixtureBytes, { ...local, source: "some other export" }, sabad)).toThrow("source");
    expect(() => verifyDemoProvenance(fixtureBytes, { ...local, source: api.source }, sabad)).toThrow();
    expect(() => verifyDemoProvenance(fixtureBytes, { ...api, source: local.source }, sabad)).toThrow();
    expect(() => verifyDemoProvenance(fixtureBytes, null, sabad)).toThrow("source");
  });

  it("rejects an API record whose endpoint or source ID is not this Sabad's", async () => {
    const { verifyDemoProvenance } = await import("./banidb");
    expect(() => verifyDemoProvenance(fixtureBytes, { ...api, endpoint: "https://api.banidb.com/v2/shabads/901" }, sabad)).toThrow("endpoint");
    expect(() => verifyDemoProvenance(fixtureBytes, { ...api, endpoint: "https://example.com/v2/shabads/900" }, sabad)).toThrow();
    expect(() => verifyDemoProvenance(fixtureBytes, { ...api, endpoint: "https://api.banidb.com/v2/shabads/900?x=1" }, sabad)).toThrow();
    expect(() => verifyDemoProvenance(fixtureBytes, { ...api, source_id: "D" }, sabad)).toThrow();
  });
});
