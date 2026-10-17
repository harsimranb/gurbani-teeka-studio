import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as rulesRoute } from "../../../app/api/rules/route";
import { rulesFixture } from "../../contracts/fixtures";
import { __setStoreForTests, getStore } from "./context";
import { createMemoryRepository } from "./memory-repo";

describe("listRules historical ruleset lookup", () => {
  beforeEach(() => {
    __setStoreForTests(createMemoryRepository());
    const rule = rulesFixture[0];
    const versioned = (decision: string) => ({ ...rule, decision, resolution: { ...rule.resolution, decision } });
    getStore().saveRuleset(1, [versioned("Synthetic historical decision.")]);
    getStore().saveRuleset(2, [versioned("Synthetic current decision.")]);
  });
  afterEach(() => __setStoreForTests(null));

  it("returns the requested immutable ruleset snapshot", async () => {
    const response = await rulesRoute(new Request("http://test/api/rules?ruleset_version=1"));
    expect(response.status).toBe(200);
    const body = await response.json() as { ruleset_version: number; rules: Array<{ resolution: { decision: string | null } }> };
    expect(body.ruleset_version).toBe(1);
    expect(body.rules[0].resolution.decision).toBe("Synthetic historical decision.");
  });

  it("continues returning the latest ruleset when no version is requested", async () => {
    const response = await rulesRoute(new Request("http://test/api/rules"));
    expect(response.status).toBe(200);
    const body = await response.json() as { ruleset_version: number; rules: Array<{ resolution: { decision: string | null } }> };
    expect(body.ruleset_version).toBe(2);
    expect(body.rules[0].resolution.decision).toBe("Synthetic current decision.");
  });
});
