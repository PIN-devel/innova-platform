const STRIP_MARKS = /[()[\]{}（）「」『』<>〈〉]/g;
const STRIP_SEP = /[·•∙・/／|｜,，]/g;

export function normalizeAnswer(input: string): string {
  return input
    .replace(STRIP_MARKS, " ")
    .replace(STRIP_SEP, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function tokenize(input: string): string[] {
  return normalizeAnswer(input)
    .split(" ")
    .map((t) => t.trim())
    .filter(Boolean);
}

export function tokenSet(input: string): Set<string> {
  return new Set(tokenize(input));
}

export function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

export function answersMatch(given: string, accepted: readonly string[]): boolean {
  const g = normalizeAnswer(given);
  if (!g) return false;
  const acceptedNorm = accepted.map(normalizeAnswer).filter(Boolean);
  if (acceptedNorm.includes(g)) return true;

  const gSet = tokenSet(given);
  for (const candidate of accepted) {
    const cSet = tokenSet(candidate);
    if (cSet.size >= 2 && setsEqual(gSet, cSet)) return true;
  }
  return false;
}

const CHOSEONG = [
  "ㄱ",
  "ㄲ",
  "ㄴ",
  "ㄷ",
  "ㄸ",
  "ㄹ",
  "ㅁ",
  "ㅂ",
  "ㅃ",
  "ㅅ",
  "ㅆ",
  "ㅇ",
  "ㅈ",
  "ㅉ",
  "ㅊ",
  "ㅋ",
  "ㅌ",
  "ㅍ",
  "ㅎ",
];

export function chosung(input: string): string {
  return [...input]
    .map((ch) => {
      const code = ch.charCodeAt(0) - 0xac00;
      if (code < 0 || code > 11171) return ch;
      return CHOSEONG[Math.floor(code / 588)] ?? ch;
    })
    .join("");
}

export function hintFor(answer: string): string {
  const trimmed = answer.trim();
  if (!trimmed) return "";
  if (/[가-힣]/.test(trimmed)) return chosung(trimmed);
  return trimmed.slice(0, 1);
}
