import { z } from "zod";
import {
  CheckInputSchema, CheckPhaseSchema, CheckResultSchema, DriftContextSchema,
  DriftResultSchema, FindingSeveritySchema, ProposalSchema, ReferenceSchema, findingMatchesInput,
} from "../contracts/domain";
import { checkResultFixture, draftFixture, driftFixtures } from "../contracts/fixtures";
import type { Engine } from "../contracts/ports";

/** C-02 SYNTHETIC FIXTURE STUB. Replace with CHK/LLM implementations; no real checks run. */
export const engine: Engine = {
  async runChecks(rawInput, rawPhase) {
    const input = CheckInputSchema.parse(rawInput);
    const phase = CheckPhaseSchema.parse(rawPhase);
    const rule = input.rules.find((candidate) => candidate.id === "LAYER-07" && candidate.resolution.active && candidate.resolution.scope === "p0_check");
    const severity = FindingSeveritySchema.safeParse(rule?.severity);
    // Emit this planted test marker only. Never borrow a fixture span from another draft.
    const findings = phase === "code" && rule && severity.success ? input.sabadDrafts
      .filter((draft) => draft.text === draftFixture.text)
      .map((draft) => ({ ...checkResultFixture.findings[0], id: `synthetic-stub:${draft.id}:${draft.version}:${input.rulesetVersion}`, draft_id: draft.id, draft_version: draft.version, ruleset_version: input.rulesetVersion, rule_version: rule.version, severity: severity.data }))
      .filter((finding) => findingMatchesInput(finding, input)) : [];
    return CheckResultSchema.parse({
      findings,
      notEvaluable: input.rules.filter((candidate) => candidate.resolution.active && candidate.resolution.scope === "p0_check" && !findings.some((finding) => finding.rule_id === candidate.id))
        .map((candidate) => ({ ruleId: candidate.id, reason: `Synthetic fixture stub only: ${phase} checking is not implemented for this rule/input.` })),
    });
  },
  async runDriftCheck(rawProposal, rawContext) {
    const proposal = ProposalSchema.parse(rawProposal);
    DriftContextSchema.parse(rawContext);
    return driftFixtures.map((result) => DriftResultSchema.parse({ ...result, id: `synthetic-stub:${proposal.id}:${result.assessment.check}`, proposal_id: proposal.id }));
  },
  async indexReferences(references) {
    z.array(ReferenceSchema).parse(references); // Validating no-op; each check receives its current snapshot.
  },
};
export const runChecks: Engine["runChecks"] = engine.runChecks;
export const runDriftCheck: Engine["runDriftCheck"] = engine.runDriftCheck;
export const indexReferences: Engine["indexReferences"] = engine.indexReferences;
