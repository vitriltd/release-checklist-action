import { describe, it, expect } from "vitest";
import {
  MARKER,
  parseExistingChecklist,
  renderChecklist,
  type ChecklistItem,
} from "../src/comment";

const sampleBody = [
  "## 📋 Release Checklist",
  "",
  "The following items were flagged by developers as requiring attention at release time:",
  "",
  "- [ ] add INVOICE_WEBHOOK_SECRET to prod env (`a1b2c34`)",
  "- [x] update CACHE_DRIVER=redis in all environment configs (`d4e5f67`)",
  "- [ ] run db migrations before deploying (`abc1234`, `def5678`)",
  "",
  "_Updated 25 Apr 2026_",
  "",
  MARKER,
].join("\n");

describe("parseExistingChecklist", () => {
  it("extracts checked state keyed by visible text (stripping the SHA suffix)", () => {
    const state = parseExistingChecklist(sampleBody);
    expect(state.get("add INVOICE_WEBHOOK_SECRET to prod env")).toBe(false);
    expect(state.get("update CACHE_DRIVER=redis in all environment configs")).toBe(true);
    expect(state.get("run db migrations before deploying")).toBe(false);
  });

  it("returns an empty map when body has no checklist items", () => {
    const state = parseExistingChecklist("Just some random text\n\nNo items here.");
    expect(state.size).toBe(0);
  });

  it("returns an empty map for null/undefined-ish body", () => {
    expect(parseExistingChecklist("").size).toBe(0);
  });

  it("ignores non-checkbox bullets and footer content", () => {
    const body = [
      "- bullet point not a checkbox",
      "- [ ] real item (`abc1234`)",
      "_Updated 2026_",
    ].join("\n");
    const state = parseExistingChecklist(body);
    expect(state.size).toBe(1);
    expect(state.get("real item")).toBe(false);
  });
});

describe("renderChecklist", () => {
  const items: ChecklistItem[] = [
    { text: "add INVOICE_WEBHOOK_SECRET to prod env", shas: ["a1b2c3d"] },
    { text: "update CACHE_DRIVER=redis in all environment configs", shas: ["d4e5f67"] },
    // hex shas above — note real SHAs only have [a-f0-9]; we don't render or parse non-hex.
    { text: "run db migrations before deploying", shas: ["abc1234", "def5678"] },
  ];

  it("renders a heading, list, and trailing marker", () => {
    const body = renderChecklist(items, new Map());
    expect(body).toContain("## 📋 Release Checklist");
    expect(body).toContain("- [ ] add INVOICE_WEBHOOK_SECRET to prod env (`a1b2c3d`)");
    expect(body).toContain("- [ ] run db migrations before deploying (`abc1234`, `def5678`)");
    expect(body.trimEnd().endsWith(MARKER)).toBe(true);
  });

  it("preserves checked state for items whose text matches a previous run", () => {
    const previous = new Map<string, boolean>([
      ["update CACHE_DRIVER=redis in all environment configs", true],
    ]);
    const body = renderChecklist(items, previous);
    expect(body).toContain("- [x] update CACHE_DRIVER=redis in all environment configs (`d4e5f67`)");
    expect(body).toContain("- [ ] add INVOICE_WEBHOOK_SECRET to prod env");
  });

  it("defaults new items to unchecked even if the previous map had unrelated entries", () => {
    const previous = new Map<string, boolean>([
      ["something completely different", true],
    ]);
    const body = renderChecklist(items, previous);
    expect(body).toContain("- [ ] add INVOICE_WEBHOOK_SECRET to prod env");
    expect(body).toContain("- [ ] update CACHE_DRIVER=redis in all environment configs");
  });

  it("drops items that no longer appear in the current run", () => {
    const previous = new Map<string, boolean>([
      ["a previously-flagged tag that was reverted", true],
    ]);
    const body = renderChecklist(items, previous);
    expect(body).not.toContain("a previously-flagged tag that was reverted");
  });

  it("renders items in the order provided (chronological from caller)", () => {
    const body = renderChecklist(items, new Map());
    const idxA = body.indexOf("INVOICE_WEBHOOK_SECRET");
    const idxB = body.indexOf("CACHE_DRIVER");
    const idxC = body.indexOf("run db migrations");
    expect(idxA).toBeLessThan(idxB);
    expect(idxB).toBeLessThan(idxC);
  });

  it("renders an empty-state body when items is empty", () => {
    const body = renderChecklist([], new Map());
    expect(body).toContain("## 📋 Release Checklist");
    expect(body.toLowerCase()).toContain("no items");
    expect(body).not.toContain("- [ ]");
    expect(body).not.toContain("- [x]");
    expect(body.trimEnd().endsWith(MARKER)).toBe(true);
  });

  it("treats edited tag text as a new item (state resets to unchecked)", () => {
    const previous = new Map<string, boolean>([
      ["run db migrations before deploying", true], // previous text
    ]);
    const editedItems: ChecklistItem[] = [
      { text: "run db migrations before deploying (see playbook)", shas: ["abc1234"] },
    ];
    const body = renderChecklist(editedItems, previous);
    expect(body).toContain("- [ ] run db migrations before deploying (see playbook)");
  });
});

describe("MARKER", () => {
  it("is the exact HTML comment the spec mandates", () => {
    expect(MARKER).toBe("<!-- release-checklist-action:marker -->");
  });
});
