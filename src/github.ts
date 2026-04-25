import * as github from "@actions/github";
import { MARKER } from "./comment";

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

export async function listCommitSources(
  octokit: Octokit,
  ctx: RepoContext,
  prNumber: number
): Promise<CommitSource[]> {
  const commits = await octokit.paginate(octokit.rest.pulls.listCommits, {
    ...ctx,
    pull_number: prNumber,
    per_page: 100,
  });

  const sources: CommitSource[] = [];
  for (const c of commits) {
    const sha = c.sha;
    const message = c.commit.message;
    let prBody: string | null = null;
    try {
      const { data: associated } = await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
        ...ctx,
        commit_sha: sha,
      });
      const merged = associated.find((p) => p.merged_at) ?? associated[0];
      if (merged?.body) prBody = merged.body;
    } catch {
      // Ignore — commit-to-PR association is best-effort.
    }
    sources.push({
      sha,
      shortSha: sha.slice(0, 7),
      message,
      prBody,
    });
  }
  return sources;
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
