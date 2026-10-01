export type ExamView = "home" | "units" | "review" | "mock" | "settings";
export function examLocation(url: URL) {
  const raw = url.searchParams.get("bank");
  const bankId = !raw || raw === "default" ? "aws-sap" : raw;
  const value = url.searchParams.get("view");
  const view: ExamView = ["units", "review", "mock", "settings"].includes(value ?? "") ? value as ExamView : "home";
  const normalized = new URL(url);
  if (bankId === "aws-sap") normalized.searchParams.delete("bank"); else normalized.searchParams.set("bank", bankId);
  if (view === "home") normalized.searchParams.delete("view"); else normalized.searchParams.set("view", view);
  return { bankId, view, path: normalized.pathname + normalized.search };
}
export function examPath(bankId: string, view: ExamView = "home") {
  const url = new URL("/exam", "https://innova.invalid");
  if (bankId !== "aws-sap") url.searchParams.set("bank", bankId);
  if (view !== "home") url.searchParams.set("view", view);
  return url.pathname + url.search;
}
