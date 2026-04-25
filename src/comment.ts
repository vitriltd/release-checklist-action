export const MARKER = "<!-- release-checklist-action:marker -->";

export interface ChecklistItem {
  text: string;
  shas: string[];
}

const ITEM_LINE = /^- \[([x ])\]\s+(.+?)(?:\s*\(`[a-f0-9]+`(?:,\s*`[a-f0-9]+`)*\))?$/;

export function parseExistingChecklist(body: string): Map<string, boolean> {
  const state = new Map<string, boolean>();
  if (!body) return state;
  for (const rawLine of body.split("\n")) {
    const match = ITEM_LINE.exec(rawLine.trim());
    if (!match) continue;
    state.set(match[2].trim(), match[1] === "x");
  }
  return state;
}

export function renderChecklist(
  items: ChecklistItem[],
  previousState: Map<string, boolean>
): string {
  const lines: string[] = [];
  lines.push("## 📋 Release Checklist");
  lines.push("");
  if (items.length === 0) {
    lines.push("No items currently flagged. Nothing for the release manager to sign off on.");
  } else {
    lines.push(
      "The following items were flagged by developers as requiring attention at release time:"
    );
    lines.push("");
    for (const item of items) {
      const checked = previousState.get(item.text) ?? false;
      const box = checked ? "[x]" : "[ ]";
      const shaSuffix =
        item.shas.length > 0
          ? ` (${item.shas.map((s) => `\`${s}\``).join(", ")})`
          : "";
      lines.push(`- ${box} ${item.text}${shaSuffix}`);
    }
  }
  lines.push("");
  lines.push(`_Updated ${formatDate(new Date())}_`);
  lines.push("");
  lines.push(MARKER);
  return lines.join("\n");
}

function formatDate(d: Date): string {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
