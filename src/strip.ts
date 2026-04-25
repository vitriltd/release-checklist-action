const TAG_PATTERN = /([ \t]*)\[release:[^\]\n]+?\]([ \t]*)/gi;
const FENCE_PATTERN = /^[ \t]*(?:```|~~~)/;

export function stripReleaseTagsFromText(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let inFence = false;

  for (const line of lines) {
    if (FENCE_PATTERN.test(line)) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    out.push(stripTagsFromSingleLine(line));
  }
  return out.join("\n");
}

function stripTagsFromSingleLine(line: string): string {
  const stripped = line.replace(TAG_PATTERN, (match, _before, _after, offset: number) => {
    const isAtStart = offset === 0;
    const isAtEnd = offset + match.length === line.length;
    if (isAtStart || isAtEnd) return "";
    return " ";
  });
  return stripped.replace(/[ \t]+$/, "");
}
