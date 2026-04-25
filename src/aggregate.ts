import { extractTags } from "./parser";
import type { ChecklistItem } from "./comment";
import type { CommitSource } from "./github";

export function computeWithdrawnShas(sources: CommitSource[]): Set<string> {
  const present = new Set(sources.map((s) => s.sha));
  const withdrawn = new Set<string>();
  for (const c of sources) {
    const subject = c.message.split("\n", 1)[0];
    if (!subject.startsWith('Revert "')) continue;
    const bodyMatch = /This reverts commit ([a-f0-9]{7,40})/i.exec(c.message);
    if (!bodyMatch) continue;
    const target = bodyMatch[1];
    for (const sha of present) {
      if (sha.startsWith(target) || target.startsWith(sha)) {
        withdrawn.add(sha);
      }
    }
  }
  return withdrawn;
}

export function aggregateItems(
  sources: CommitSource[],
  withdrawnShas: Set<string>
): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const byText = new Map<string, ChecklistItem>();

  for (const c of sources) {
    if (withdrawnShas.has(c.sha)) continue;

    const seenInCommit = new Set<string>();
    for (const t of extractTags(c.message)) {
      if (seenInCommit.has(t.text)) continue;
      seenInCommit.add(t.text);
      addCitation(items, byText, t.text, c.shortSha);
    }

    if (c.prBody) {
      for (const t of extractTags(c.prBody, { skipFencedCodeBlocks: true })) {
        if (seenInCommit.has(t.text)) continue;
        seenInCommit.add(t.text);
        addCitation(items, byText, t.text, c.shortSha);
      }
    }
  }
  return items;
}

function addCitation(
  items: ChecklistItem[],
  byText: Map<string, ChecklistItem>,
  text: string,
  shortSha: string
): void {
  const existing = byText.get(text);
  if (existing) {
    if (!existing.shas.includes(shortSha)) existing.shas.push(shortSha);
    return;
  }
  const item: ChecklistItem = { text, shas: [shortSha] };
  byText.set(text, item);
  items.push(item);
}
