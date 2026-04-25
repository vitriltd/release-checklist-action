import * as github from "@actions/github";
import { MARKER } from "./comment";
import { stripReleaseTagsFromText } from "./strip";

type Octokit = ReturnType<typeof github.getOctokit>;

export interface RepoContext {
  owner: string;
  repo: string;
}

export interface ReleasePleasePR {
  number: number;
}

export interface CommitSource {
  sha: string;
  shortSha: string;
  message: string;
  prBody: string | null;
}

export interface ExistingComment {
  id: number;
  body: string;
}

export async function findReleasePleasePR(
  octokit: Octokit,
  ctx: RepoContext,
  baseBranch: string
): Promise<ReleasePleasePR | null> {
  const headPrefix = `release-please--branches--${baseBranch}`;
  const { data: prs } = await octokit.rest.pulls.list({
    ...ctx,
    state: "open",
    base: baseBranch,
    per_page: 100,
  });

  const byHead = prs.find((pr) => pr.head.ref.startsWith(headPrefix));
  if (byHead) return { number: byHead.number };

  const byBot = prs.find((pr) => pr.user?.login === "release-please[bot]");
  if (byBot) return { number: byBot.number };

  return null;
}

export async function listReleaseCandidateCommits(
  octokit: Octokit,
  ctx: RepoContext,
  baseBranch: string
): Promise<CommitSource[]> {
  // The Release Please PR's own branch holds a single squashed commit, so we
  // can't read the source commits from `pulls/{number}/commits`. Instead,
  // walk `main` back to the last release tag and use that range.
  const lastReleaseSha = await resolveLastReleaseSha(octokit, ctx);

  const allCommits = await octokit.paginate(octokit.rest.repos.listCommits, {
    ...ctx,
    sha: baseBranch,
    per_page: 100,
  });

  const candidates: typeof allCommits = [];
  for (const c of allCommits) {
    if (lastReleaseSha && c.sha === lastReleaseSha) break;
    candidates.push(c);
  }
  candidates.reverse(); // chronological: oldest first

  const sources: CommitSource[] = [];
  for (const c of candidates) {
    let prBody: string | null = null;
    try {
      const { data: associated } =
        await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
          ...ctx,
          commit_sha: c.sha,
        });
      const merged = associated.find((p) => p.merged_at) ?? associated[0];
      if (merged?.body) prBody = merged.body;
    } catch {
      // Best-effort.
    }
    sources.push({
      sha: c.sha,
      shortSha: c.sha.slice(0, 7),
      message: c.commit.message,
      prBody,
    });
  }
  return sources;
}

async function resolveLastReleaseSha(
  octokit: Octokit,
  ctx: RepoContext
): Promise<string | null> {
  let tagName: string | undefined;
  try {
    const { data: latestRelease } = await octokit.rest.repos.getLatestRelease({ ...ctx });
    tagName = latestRelease.tag_name;
  } catch {
    return null; // No releases yet — first release.
  }
  if (!tagName) return null;

  try {
    const { data: ref } = await octokit.rest.git.getRef({
      ...ctx,
      ref: `tags/${tagName}`,
    });
    if (ref.object.type === "tag") {
      // Annotated tag — dereference to commit.
      const { data: tag } = await octokit.rest.git.getTag({
        ...ctx,
        tag_sha: ref.object.sha,
      });
      return tag.object.sha;
    }
    return ref.object.sha;
  } catch {
    return null;
  }
}

export async function findExistingChecklistComment(
  octokit: Octokit,
  ctx: RepoContext,
  prNumber: number
): Promise<ExistingComment | null> {
  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    ...ctx,
    issue_number: prNumber,
    per_page: 100,
  });

  for (const c of comments) {
    if (c.body && c.body.includes(MARKER)) {
      return { id: c.id, body: c.body };
    }
  }
  return null;
}

export async function stripTagsFromPRBody(
  octokit: Octokit,
  ctx: RepoContext,
  prNumber: number
): Promise<boolean> {
  const { data: pr } = await octokit.rest.pulls.get({ ...ctx, pull_number: prNumber });
  const original = pr.body ?? "";
  const stripped = stripReleaseTagsFromText(original);
  if (stripped === original) return false;
  await octokit.rest.pulls.update({ ...ctx, pull_number: prNumber, body: stripped });
  return true;
}

export async function upsertChecklistComment(
  octokit: Octokit,
  ctx: RepoContext,
  prNumber: number,
  body: string,
  existingCommentId: number | null
): Promise<void> {
  if (existingCommentId !== null) {
    await octokit.rest.issues.updateComment({
      ...ctx,
      comment_id: existingCommentId,
      body,
    });
  } else {
    await octokit.rest.issues.createComment({
      ...ctx,
      issue_number: prNumber,
      body,
    });
  }
}
