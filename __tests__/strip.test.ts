import { describe, it, expect } from "vitest";
import { stripReleaseTagsFromText } from "../src/strip";

describe("stripReleaseTagsFromText", () => {
  it("removes a single inline tag and the leading space that joined it", () => {
    expect(stripReleaseTagsFromText("feat: webhook [release: add INVOICE_WEBHOOK_SECRET]")).toBe(
      "feat: webhook"
    );
  });

  it("removes multiple tags on the same line", () => {
    expect(
      stripReleaseTagsFromText("feat: api [release: smoke-test /healthz] [release: notify on-call]")
    ).toBe("feat: api");
  });

  it("preserves trailing context after the tag", () => {
    expect(stripReleaseTagsFromText("feat: x [release: y] (abc1234)")).toBe(
      "feat: x (abc1234)"
    );
  });

  it("matches the keyword case-insensitively", () => {
    expect(stripReleaseTagsFromText("feat: x [RELEASE: y]")).toBe("feat: x");
  });

  it("is idempotent — running twice yields the same result", () => {
    const once = stripReleaseTagsFromText("feat: x [release: y]");
    const twice = stripReleaseTagsFromText(once);
    expect(once).toBe(twice);
  });

  it("leaves text without tags unchanged", () => {
    const input = "## 1.0.0\n\n### Features\n* feat: x ([abc](url))\n";
    expect(stripReleaseTagsFromText(input)).toBe(input);
  });

  it("removes tags across multiple lines (preserving newlines)", () => {
    const input = [
      "* feat: webhook [release: add INVOICE_WEBHOOK_SECRET] (abc1234)",
      "* fix: cache [release: update CACHE_DRIVER=redis] (def5678)",
    ].join("\n");
    const expected = [
      "* feat: webhook (abc1234)",
      "* fix: cache (def5678)",
    ].join("\n");
    expect(stripReleaseTagsFromText(input)).toBe(expected);
  });

  it("trims trailing whitespace introduced on a line", () => {
    expect(stripReleaseTagsFromText("feat: x [release: y]   ")).toBe("feat: x");
  });

  it("collapses any double-space left after the tag is removed mid-sentence", () => {
    // Edge case: leading space gets eaten with the tag, but if there are two
    // spaces around the tag we still want to end up with a single space.
    expect(stripReleaseTagsFromText("feat: x  [release: y]  rest")).toBe("feat: x rest");
  });

  it("does not touch tags inside fenced code blocks (changelog examples)", () => {
    // The Release Please PR body itself doesn't contain fenced code blocks
    // around tags, but if someone puts an example tag in a fenced block
    // we should leave it as-is — same posture as the parser.
    const input = "Some text [release: stripped]\n\n```\n[release: kept-as-example]\n```\n";
    expect(stripReleaseTagsFromText(input)).toBe(
      "Some text\n\n```\n[release: kept-as-example]\n```\n"
    );
  });
});
