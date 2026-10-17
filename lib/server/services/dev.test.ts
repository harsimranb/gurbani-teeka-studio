import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiErrorSchema } from "../../contracts/api";
import { POST as reset } from "../../../app/api/dev/reset/route";
import { POST as seed } from "../../../app/api/dev/seed-synthetic/route";
import { __setSourceForTests, __setStoreForTests, getStore } from "./context";
import { testSabad } from "./testing";

beforeEach(() => { __setSourceForTests(testSabad()); });
afterEach(() => { vi.unstubAllEnvs(); __setSourceForTests(undefined); __setStoreForTests(null); });

describe("dev routes", () => {
  it("seed synthetic drafts, then reset the store", async () => {
    const seeded = await seed();
    expect(seeded.status).toBe(200);
    const { drafts } = await seeded.json();
    expect(drafts).toHaveLength(3);
    expect(getStore().listDraftsForSabad("TEST-SABAD")).toHaveLength(3);
    const done = await reset();
    expect(await done.json()).toEqual({ ok: true });
    expect(getStore().listDraftsForSabad("TEST-SABAD")).toEqual([]);
  });
  it("return 404 in production unless mock mode is on", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "");
    for (const handler of [reset, seed]) {
      const response = await handler();
      expect(response.status).toBe(404);
      expect(ApiErrorSchema.parse(await response.json()).error.code).toBe("not_found");
    }
    expect(getStore().listDraftsForSabad("TEST-SABAD")).toEqual([]);
    vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "1");
    expect((await seed()).status).toBe(200);
  });
});
