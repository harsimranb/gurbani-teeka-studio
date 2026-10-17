import { describe, expect, it } from "vitest";
import { ApiErrorSchema, CheckResponseSchema, ReportSchema, routes } from "./api";
import { mockResponses } from "./fixtures";

const at = "2026-10-16T12:00:00.000Z";
const draft = { id: "synthetic-draft", shabad_id: "synthetic-sabad", line_ids: ["line-1"], layer: "transcreation", text: "SYNTHETIC TEST: [sample]", author: "Test author", status: "draft", version: 2, updated_at: at };
const finding = { id: "synthetic-finding", draft_id: draft.id, draft_version: 2, ruleset_version: 3, rule_id: "LAYER-07", rule_version: 1, layer: "L1", severity: "error", quoted_span: "[", start: 16, end: 17, explanation: "Synthetic bracket evidence.", reference_ids: [], model: "fixture-stub", prompt_version: "fixture-v1", state: "current", cleared_at: null };
const run = { id: "run-1", draft_id: draft.id, draft_version: 2, ruleset_version: 3, phase: "code", status: "succeeded", started_at: at, completed_at: at, error: null, cached: false, not_evaluable: [] };

describe("P0 API contracts", () => {
  it("rejects stale findings/runs in the current report but retains cleared versioned history", () => {
    const report = { draft, ruleset_version: 3, findings: [finding], history: [{ ...finding, draft_version: 1, state: "cleared", cleared_at: at }], decisions: [], check_runs: [run] };
    expect(ReportSchema.safeParse(report).success).toBe(true);
    expect(ReportSchema.safeParse({ ...report, findings: [{ ...finding, draft_version: 1 }] }).success).toBe(false);
    expect(ReportSchema.safeParse({ ...report, check_runs: [{ ...run, ruleset_version: 2 }] }).success).toBe(false);
    expect(ReportSchema.safeParse({ ...report, history: [finding] }).success).toBe(false);
  });
  it("binds a check response and every finding to the durable run version", () => {
    const response = { affected_drafts: [draft], check_runs: [run], result: { findings: [finding], notEvaluable: [] } };
    expect(CheckResponseSchema.safeParse(response).success).toBe(true);
    expect(CheckResponseSchema.safeParse({ ...response, result: { findings: [{ ...finding, ruleset_version: 2 }], notEvaluable: [] } }).success).toBe(false);
  });
  it("requires current versions and written reasons on every approval/decision action", () => {
    expect(routes.decide.request.safeParse({ finding_id: finding.id, draft_id: draft.id, draft_version: 2, ruleset_version: 3, action: "waive", reason: " ", reviewer: "Test" }).success).toBe(false);
    expect(routes.approveProposal.request.safeParse({ proposal_id: "p-1", ruleset_version: 3, actor: "Test", reason: " ", drift_override_reason: null }).success).toBe(false);
    expect(routes.approveProposal.request.safeParse({ proposal_id: "p-1", ruleset_version: 3, actor: "Test", reason: "Synthetic approval.", drift_override_reason: " " }).success).toBe(false);
  });
  it("makes version conflicts and publish blockers explicit HTTP error payloads", () => {
    expect(ApiErrorSchema.safeParse({ error: { code: "version_conflict", reason: "Draft changed; reload the current report." } }).success).toBe(true);
    expect(ApiErrorSchema.safeParse({ error: { code: "publish_blocked", reason: "Current model phase is missing.", blockers: [{ kind: "check_phase", draft_id: draft.id, phase: "llm", status: "missing" }] } }).success).toBe(true);
  });
  it("lists published records by Sabad as a read route with a contract-valid fixture", () => {
    expect(Object.keys(routes)).toHaveLength(19);
    expect(routes.listPublications).toMatchObject({ method: "GET", path: "/api/sabads/:shabad_id/publications" });
    expect(routes.listPublications.request.safeParse({ shabad_id: "s" }).success).toBe(true);
    expect(routes.listPublications.request.safeParse({ shabad_id: " " }).success).toBe(false);
    expect(routes.listPublications.response.safeParse(mockResponses.listPublications).success).toBe(true);
    const gate = { draft_id: draft.id, draft_version: 2, ruleset_version: 3, can_publish: true, blockers: [], warning_ids: [] };
    const publication = { reference: { id: "PUB-0001", line_ids: ["line-1"], english: draft.text, source: "published", exceptions: [] }, draft_id: draft.id, approver: "Approver", at, gate };
    expect(routes.listPublications.response.safeParse({ publications: [publication] }).success).toBe(true);
    expect(routes.listPublications.response.safeParse({ publications: [{ ...publication, gate: { ...gate, can_publish: false } }] }).success).toBe(false);
  });
});
