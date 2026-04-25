import { describe, it, expect } from "vitest";
import { extractTags } from "../src/parser";

describe("extractTags", () => {
  it("extracts a single tag from a commit subject", () => {
    const tags = extractTags("feat: webhook [release: add INVOICE_WEBHOOK_SECRET to prod env]");
    expect(tags).toEqual([{ text: "add INVOICE_WEBHOOK_SECRET to prod env" }]);
  });

  it("matches the `release` keyword case-insensitively", () => {
    const tags = extractTags("[RELEASE: notify on-call]");
    expect(tags).toEqual([{ text: "notify on-call" }]);
  });

  it("preserves case in the tag text itself", () => {
    const tags = extractTags("[release: add INVOICE_WEBHOOK_SECRET to prod env]");
    expect(tags[0].text).toBe("add INVOICE_WEBHOOK_SECRET to prod env");
  });

  it("trims surrounding whitespace from tag text", () => {
    const tags = extractTags("[release:    notify on-call team    ]");
    expect(tags).toEqual([{ text: "notify on-call team" }]);
  });

  it("extracts multiple tags from one string", () => {
    const tags = extractTags(
      "feat: api [release: smoke-test /healthz from prod] [release: notify on-call team]"
    );
    expect(tags).toEqual([
      { text: "smoke-test /healthz from prod" },
      { text: "notify on-call team" },
    ]);
  });

  it("returns an empty array when no tags are present", () => {
    const tags = extractTags("refactor: tidy logger setup");
    expect(tags).toEqual([]);
  });

  it("does not match tags spanning multiple lines", () => {
    const tags = extractTags("[release: this is\nbroken]");
    expect(tags).toEqual([]);
  });

  it("matches a tag-only commit subject with no other context", () => {
    const tags = extractTags("[release: notify on-call team before releasing]");
    expect(tags).toEqual([{ text: "notify on-call team before releasing" }]);
  });

  it("ignores `[release: ...]` content inside fenced code blocks when option is set", () => {
    const input = [
      "Some PR description",
      "",
      "```",
      "Example tag format: [release: do not pick this up]",
      "```",
      "",
      "[release: do pick this up]",
    ].join("\n");
    const tags = extractTags(input, { skipFencedCodeBlocks: true });
    expect(tags).toEqual([{ text: "do pick this up" }]);
  });

  it("ignores tilde-fenced code blocks too when option is set", () => {
    const input = [
      "~~~",
      "[release: ignored]",
      "~~~",
      "[release: kept]",
    ].join("\n");
    const tags = extractTags(input, { skipFencedCodeBlocks: true });
    expect(tags).toEqual([{ text: "kept" }]);
  });

  it("does NOT skip fenced code blocks by default (commit-message context)", () => {
    const input = "```\n[release: still found]\n```";
    const tags = extractTags(input);
    expect(tags).toEqual([{ text: "still found" }]);
  });

  it("nested brackets in tag text fall back to the inner ] (documented v1 limitation)", () => {
    const tags = extractTags("[release: see issue [#42] for context]");
    // Non-greedy on `]` — first `]` closes the tag.
    expect(tags).toEqual([{ text: "see issue [#42" }]);
  });
});
