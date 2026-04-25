import * as core from "@actions/core";
import * as github from "@actions/github";

import { aggregateItems, computeWithdrawnShas } from "./aggregate";
import { parseExistingChecklist, renderChecklist } from "./comment";
import {
  findExistingChecklistComment,
  findReleasePleasePR,
  listReleaseCandidateCommits,
  stripTagsFromPRBody,
  upsertChecklistComment,
} from "./github";

async function run(): Promise<void> {
  try {
    const token = core.getInput("github-token", { required: true });
    const baseBranch = core.getInput("base-branch") || "main";
    const stripFromBody = core.getBooleanInput("strip-tags-from-pr-body");

    const octokit = github.getOctokit(token);
    const ctx = github.context.repo;

    const pr = await findReleasePleasePR(octokit, ctx, baseBranch);
    if (!pr) {
      core.info("No open Release Please PR found. Exiting silently.");
      return;
    }
    core.info(`Found Release Please PR #${pr.number}`);

    const sources = await listReleaseCandidateCommits(octokit, ctx, baseBranch);
    core.info(`Loaded ${sources.length} candidate commit(s) from ${baseBranch} since last release`);

    const withdrawnShas = computeWithdrawnShas(sources);
    if (withdrawnShas.size > 0) {
      core.info(`Treating tags from ${withdrawnShas.size} reverted commit(s) as withdrawn`);
    }

    const items = aggregateItems(sources, withdrawnShas);

    if (stripFromBody) {
      const stripped = await stripTagsFromPRBody(octokit, ctx, pr.number);
      if (stripped) {
        core.info(`Stripped [release: ...] tags from PR #${pr.number} body`);
      }
    }

    const existing = await findExistingChecklistComment(octokit, ctx, pr.number);

    if (items.length === 0 && !existing) {
      core.info("No release tags found and no existing comment. Nothing to post.");
      return;
    }

    const previousState = existing
      ? parseExistingChecklist(existing.body)
      : new Map<string, boolean>();

    const body = renderChecklist(items, previousState);
    await upsertChecklistComment(octokit, ctx, pr.number, body, existing?.id ?? null);

    core.info(`Upserted checklist with ${items.length} item(s) on PR #${pr.number}`);
  } catch (err) {
    core.setFailed(err instanceof Error ? err.message : String(err));
  }
}

run();
