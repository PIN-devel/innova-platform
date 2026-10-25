import type { CashFlowScreen } from "@/entities/cash-flow/model";

export const motifinBasePath = "/__wireframes/motifin";
export const cashFlowScreens: CashFlowScreen[] = ["review", "spending", "upcoming", "import", "settings"];
export function isCashFlowScreen(value: string | undefined): value is CashFlowScreen {
  return cashFlowScreens.some(screen => screen === value);
}
export function cashFlowLocation(screen: CashFlowScreen, month: string, category?: string | null) {
  if (screen === "import") return `${motifinBasePath}/import`;
  const search = new URLSearchParams({ month });
  if (category) search.set("category", category);
  return `${motifinBasePath}/${screen}?${search}`;
}
