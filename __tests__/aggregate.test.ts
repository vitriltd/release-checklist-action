import { describe, it, expect } from "vitest";
import { aggregateItems, computeWithdrawnShas } from "../src/aggregate";
import type { CommitSource } from "../src/github";

function commit(partial: Partial<CommitSource> & { sha: string }): CommitSource {
  return {
    sha: partial.sha,
    shortSha: partial.shortSha ?? partial.sha.slice(0, 7),
    message: partial.message ?? "",
    prBody: partial.prBody ?? null,
  };
}

describe("aggregateItems", () => {
  it("collects a single tag from a single commit", () => {
    const items = aggregateItems(
      [commit({ sha: "aaaaaaa1111", message: "feat: x [release: do thing]" })],
      new Set()
    );
    expect(items).toEqual([{ text: "do thing", shas: ["aaaaaaa"] }]);
  });

  it("dedups identical tags across commits, citing both shas in chronological order", () => {
    const items = aggregateItems(
      [
        commit({ sha: "aaaaaaa1111", message: "feat: x [release: run db migrations]" }),
        commit({ sha: "bbbbbbb2222", message: "fix: y [release: run db migrations]" }),
      ],
      new Set()
    );
    expect(items).toEqual([
      { text: "run db migrations", shas: ["aaaaaaa", "bbbbbbb"] },
    ]);
  });

  it("preserves chronological order of items based on first appearance", () => {
    const items = aggregateItems(
      [
        commit({ sha: "aaaaaaa1111", message: "feat [release: first]" }),
        commit({ sha: "bbbbbbb2222", message: "feat [release: second]" }),
        commit({ sha: "ccccccc3333", message: "feat [release: first]" }),
      ],
      new Set()
    );
    expect(items.map((i) => i.text)).toEqual(["first", "second"]);
    expect(items[0].shas).toEqual(["aaaaaaa", "ccccccc"]);
  });

  it("collects tags from PR bodies (skipping fenced code blocks)", () => {
    const items = aggregateItems(
      [
        commit({
          sha: "aaaaaaa1111",
          message: "feat: simple",
          prBody: "Fixes a thing.\n\n```\n[release: ignored example]\n```\n\n[release: real PR-body tag]",
        }),
      ],
      new Set()
    );
    expect(items).toEqual([{ text: "real PR-body tag", shas: ["aaaaaaa"] }]);
  });

  it("does not double-cite the same SHA when commit message and PR body share a tag", () => {
    const items = aggregateItems(
      [
        commit({
          sha: "aaaaaaa1111",
          message: "feat [release: notify on-call]",
          prBody: "Body discusses [release: notify on-call] in detail.",
        }),
      ],
      new Set()
    );
    expect(items).toEqual([{ text: "notify on-call", shas: ["aaaaaaa"] }]);
  });

  it("excludes commits whose SHA is in the withdrawn set", () => {
    const items = aggregateItems(
      [
        commit({ sha: "aaaaaaa1111", message: "feat [release: kept]" }),
        commit({ sha: "bbbbbbb2222", message: "feat [release: dropped]" }),
      ],
      new Set(["bbbbbbb2222"])
    );
    expect(items).toEqual([{ text: "kept", shas: ["aaaaaaa"] }]);
  });
});

describe("computeWithdrawnShas", () => {
  it("identifies a SHA whose revert commit is also in the range", () => {
    const sources: CommitSource[] = [
      commit({
        sha: "0123456789abcdef0123456789abcdef01234567",
        message: 'feat: original [release: original tag]',
      }),
      commit({
        sha: "fedcba9876543210fedcba9876543210fedcba98",
        message:
          'Revert "feat: original"\n\nThis reverts commit 0123456789abcdef0123456789abcdef01234567.',
      }),
    ];
    const withdrawn = computeWithdrawnShas(sources);
    expect(withdrawn.has("0123456789abcdef0123456789abcdef01234567")).toBe(true);
  });

  it("returns empty set when no Revert commits are present", () => {
    const sources: CommitSource[] = [
      commit({ sha: "aaaaaaa1111", message: "feat: x" }),
      commit({ sha: "bbbbbbb2222", message: "fix: y" }),
    ];
    expect(computeWithdrawnShas(sources).size).toBe(0);
  });

  it("ignores Revert commits whose target SHA is outside the range", () => {
    const sources: CommitSource[] = [
      commit({
        sha: "aaaaaaa1111111111111111111111111111111111",
        message: 'Revert "feat: something"\n\nThis reverts commit 9999999999999999999999999999999999999999.',
      }),
    ];
    expect(computeWithdrawnShas(sources).size).toBe(0);
  });
});
