import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiErrorSchema } from "../../contracts/api";
import { handleRoute, ServiceError } from "./http";

const post = (body: unknown, raw = false) => new Request("http://localhost/api/proposals", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: raw ? String(body) : JSON.stringify(body),
});
const validProposal = { rule_text: "Test rule.", example: "Test example", reason: "Test reason", author: "Tester" };
const proposalResponse = { proposal: { id: "PR-001", source: "free_text", rule_text: "Test rule.", example: "Test example", reason: "Test reason", evidence_ids: [], author: "Tester", at: "2026-10-16T12:00:00.000Z", status: "pending" }, drift_results: [] } as never;
const errorOf = async (response: Response) => ApiErrorSchema.parse(await response.json()).error;

afterEach(() => vi.restoreAllMocks());

describe("handleRoute", () => {
  it("returns the validated response with no-store caching", async () => {
    let seen: unknown;
    const response = await handleRoute("submitProposal", post(validProposal), {}, (req) => { seen = req; return proposalResponse; });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(seen).toEqual(validProposal);
    expect((await response.json()).proposal.id).toBe("PR-001");
  });
  it("supports async handlers and path params on GET routes", async () => {
    const response = await handleRoute("listPublications", new Request("http://localhost/x"), { shabad_id: "S1" }, async (req) => {
      expect(req).toEqual({ shabad_id: "S1" });
      return { publications: [] };
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ publications: [] });
  });
  it("rejects a method mismatch without calling the handler", async () => {
    let called = false;
    const response = await handleRoute("submitProposal", new Request("http://localhost/api/proposals"), {}, () => { called = true; return proposalResponse; });
    expect(response.status).toBe(400);
    expect((await errorOf(response)).code).toBe("invalid_request");
    expect(called).toBe(false);
  });
  it("rejects bad JSON and non-object bodies", async () => {
    for (const body of ["{not json", "[1]", "null"]) {
      const response = await handleRoute("submitProposal", post(body, true), {}, () => proposalResponse);
      expect(response.status).toBe(400);
      expect((await errorOf(response)).code).toBe("invalid_request");
    }
  });
  it("rejects requests that fail the contract and never echoes the values", async () => {
    const response = await handleRoute("submitProposal", post({ ...validProposal, reason: "  ", extra: "SECRET-VALUE" }), {}, () => proposalResponse);
    expect(response.status).toBe(400);
    const error = await errorOf(response);
    expect(error.code).toBe("invalid_request");
    expect(error.reason).not.toContain("SECRET-VALUE");
  });
  it("rejects a path/body ID mismatch", async () => {
    const body = { draft_id: "d1", draft_version: 1, actor: "Tester" };
    const request = new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body) });
    const response = await handleRoute("markReady", request, { draft_id: "d2" }, () => ({ draft: {} }) as never);
    expect(response.status).toBe(400);
    expect((await errorOf(response)).reason).toContain("Path and body IDs");
  });
  it.each([
    ["invalid_request", 400], ["not_found", 404], ["version_conflict", 409], ["publish_blocked", 409],
    ["drift_blocked", 409], ["unavailable", 503], ["internal_error", 500],
  ] as const)("maps ServiceError %s to HTTP %i", async (code, status) => {
    const response = await handleRoute("submitProposal", post(validProposal), {}, () => { throw new ServiceError(code, "Synthetic reason."); });
    expect(response.status).toBe(status);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await errorOf(response)).toEqual({ code, reason: "Synthetic reason." });
  });
  it("carries publish blockers", async () => {
    const blockers = [{ kind: "check_phase", draft_id: "d", phase: "llm", status: "missing" } as const];
    const response = await handleRoute("submitProposal", post(validProposal), {}, () => { throw new ServiceError("publish_blocked", "Blocked.", [...blockers]); });
    expect((await errorOf(response)).blockers).toEqual(blockers);
  });
  it("hides unknown errors behind internal_error and logs them", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await handleRoute("submitProposal", post(validProposal), {}, () => { throw new Error("db password leaked"); });
    expect(response.status).toBe(500);
    const error = await errorOf(response);
    expect(error.code).toBe("internal_error");
    expect(error.reason).not.toContain("leaked");
    expect(log).toHaveBeenCalled();
  });
  it("turns a response that breaks its contract into a 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await handleRoute("submitProposal", post(validProposal), {}, () => ({ proposal: {}, drift_results: [] }) as never);
    expect(response.status).toBe(500);
    expect(await errorOf(response)).toEqual({ code: "internal_error", reason: "Response failed its contract" });
  });
});
