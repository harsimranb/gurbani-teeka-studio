import { describe, expect, it } from "vitest";
import { ApiClientError, createApiClient } from "./api";

describe("typed client boundary", () => {
  it("uses schema-validated fixtures and reports missing private source explicitly", async () => {
    const client = createApiClient({ useMocks: true });
    expect((await client.request("listRules", {})).rules).toHaveLength(66);
    expect((await client.request("getSabad", { shabad_id: "55" })).status).toBe("unavailable");
    expect((await client.request("getEval", {})).status).toBe("unavailable");
  });
  it("validates the request before reaching a transport", async () => {
    let calls = 0;
    const client = createApiClient({ useMocks: false, fetcher: async () => { calls++; return new Response("{}"); } });
    await expect(client.request("decide", { finding_id: "f", draft_id: "d", draft_version: 1, ruleset_version: 1, action: "waive", reason: " ", reviewer: "Test" })).rejects.toThrow();
    expect(calls).toBe(0);
  });
  it("encodes path IDs and validates actual transport responses", async () => {
    let url = "";
    const client = createApiClient({ useMocks: false, fetcher: async (input) => { url = String(input); return Response.json({ status: "unavailable", reason: "Source unavailable." }); } });
    expect((await client.request("getSabad", { shabad_id: "id/with space" })).status).toBe("unavailable");
    expect(url).toBe("/api/sabads/id%2Fwith%20space");
    const malformed = createApiClient({ useMocks: false, fetcher: async () => Response.json({ catch_rate: 1 }) });
    await expect(malformed.request("getEval", {})).rejects.toThrow();
  });
  it("surfaces the fixture publish blockers as a typed error", async () => {
    const client = createApiClient({ useMocks: true });
    await expect(client.request("publish", { draft_id: "synthetic-draft-1", draft_version: 1, ruleset_version: 1, actor: "Test", departure_reasons: [] })).rejects.toMatchObject({ code: "publish_blocked" });
    expect(ApiClientError).toBeDefined();
  });
});
