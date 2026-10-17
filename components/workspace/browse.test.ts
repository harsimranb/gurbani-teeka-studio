import { describe, expect, it } from "vitest";
import { angLabel, BROWSE_STATUS, isFiltered, readFilters, workspaceHref } from "./browse";

const read = (query: string) => readFilters(new URLSearchParams(query));

describe("browse URL state", () => {
  it("reads valid filters and ignores malformed ones", () => {
    expect(read("")).toEqual({ ang: undefined, raag: undefined, writer: undefined, page: 0 });
    expect(read("ang=12&raag=R&writer=W&page=2")).toEqual({ ang: 12, raag: "R", writer: "W", page: 2 });
    expect(read("ang=0&page=-1")).toMatchObject({ ang: undefined, page: 0 });
    expect(read("ang=1431")).toMatchObject({ ang: undefined });
    expect(read("ang=1.5&page=x&raag=%20")).toEqual({ ang: undefined, raag: undefined, writer: undefined, page: 0 });
  });

  it("builds workspace links that keep the filters and the chosen Sabad", () => {
    expect(workspaceHref(null, { page: 0 })).toBe("/workspace");
    expect(workspaceHref("55", { page: 0 })).toBe("/workspace?sabad=55");
    expect(workspaceHref("55", { ang: 3, raag: "A B/C", writer: "W", page: 2 })).toBe("/workspace?sabad=55&ang=3&raag=A+B%2FC&writer=W&page=2");
    // A page without any filter is meaningless.
    expect(workspaceHref(null, { page: 4 })).toBe("/workspace");
    expect(isFiltered({ page: 0 })).toBe(false);
    expect(isFiltered({ raag: "R", page: 0 })).toBe(true);
  });

  it("labels every status and the ang span", () => {
    expect(Object.keys(BROWSE_STATUS).sort()).toEqual(["changes_requested", "draft", "not_started", "partly_published", "published", "ready_for_review"]);
    expect(BROWSE_STATUS.not_started.label).toBe("Not started");
    expect(angLabel(3, 3)).toBe("Ang 3");
    expect(angLabel(3, 5)).toBe("Ang 3–5");
  });
});
