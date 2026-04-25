export interface ParsedTag {
  text: string;
}

export interface ExtractOptions {
  skipFencedCodeBlocks?: boolean;
}

const TAG_PATTERN = /\[release:\s*([^\]\n]+?)\s*\]/gi;
const FENCE_PATTERN = /^(?:```|~~~)/;

export function extractTags(input: string, options: ExtractOptions = {}): ParsedTag[] {
  const source = options.skipFencedCodeBlocks ? stripFencedCodeBlocks(input) : input;
  const tags: ParsedTag[] = [];
  for (const match of source.matchAll(TAG_PATTERN)) {
    tags.push({ text: match[1] });
  }
  return tags;
}

function stripFencedCodeBlocks(input: string): string {
  const lines = input.split("\n");
  const kept: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (FENCE_PATTERN.test(line.trim())) {
      inFence = !inFence;
      kept.push("");
      continue;
    }
    kept.push(inFence ? "" : line);
  }
  return kept.join("\n");
}
