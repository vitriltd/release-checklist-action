const TAG_PATTERN = /\[release:[^\]\n]+?\]/gi;
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
  return line
    .replace(TAG_PATTERN, "")
    .replace(/(\S)[ \t]{2,}/g, "$1 ")
    .replace(/[ \t]+$/, "");
}
