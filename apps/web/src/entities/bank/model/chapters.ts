/** SAP-C02 domain units (장 탭). `chapter` fields on notes map to these unit ids. */
export const UNITS = [
  { id: 1, title: "조직 복잡도" },
  { id: 2, title: "신규 설계" },
  { id: 3, title: "기존 개선" },
  { id: 4, title: "마이그레이션·모던화" },
] as const;

/** @deprecated Prefer UNITS — kept as alias for minimal churn */
export const CHAPTERS = UNITS;

export function unitTitle(id: number): string {
  return UNITS.find((u) => u.id === id)?.title ?? `유닛 ${id}`;
}

/** @deprecated Prefer unitTitle */
export function chapterTitle(id: number): string {
  return unitTitle(id);
}
