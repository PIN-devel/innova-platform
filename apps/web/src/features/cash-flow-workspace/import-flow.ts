import type { ImportDecision, ImportResult } from "@/entities/cash-flow/model";

export type ImportStep = "sources" | "attention" | "done";
export type ImportState = {
  step: ImportStep;
  selectedIds: string[];
  excludedIds: string[];
  passwordProvided: boolean;
  useSavedPassword: boolean;
  rememberPassword: boolean;
  decisions: Record<string, ImportDecision>;
  result: ImportResult | null;
  error: string | null;
};
export type ImportEvent =
  | { type: "select"; fileId: string }
  | { type: "password" }
  | { type: "remember"; value: boolean }
  | { type: "use-saved"; value: boolean }
  | { type: "start" }
  | { type: "attention" }
  | { type: "decide"; id: string; value: ImportDecision }
  | { type: "exclude"; fileId: string }
  | { type: "complete"; result: ImportResult }
  | { type: "error"; message: string }
  | { type: "back" }
  | { type: "reset" };
export const initialImportState: ImportState = {
  step: "sources", selectedIds: [], excludedIds: [], passwordProvided: false, useSavedPassword: true,
  rememberPassword: false, decisions: {}, result: null, error: null,
};

/** Interaction storyboard only. No files, passwords or persisted secrets are handled. */
export function importFlow(state: ImportState, event: ImportEvent): ImportState {
  switch (event.type) {
    case "select": return state.step === "sources" ? {
      ...state, selectedIds: state.selectedIds.includes(event.fileId) ? state.selectedIds.filter(id => id !== event.fileId) : [...state.selectedIds, event.fileId], error: null,
    } : state;
    case "password": return { ...state, passwordProvided: true, error: null };
    case "remember": return { ...state, rememberPassword: event.value };
    case "use-saved": return { ...state, useSavedPassword: event.value, error: null };
    case "attention": return { ...state, step: "attention", error: null };
    case "decide": return { ...state, decisions: { ...state.decisions, [event.id]: event.value }, error: null };
    case "exclude": return { ...state, excludedIds: [...new Set([...state.excludedIds, event.fileId])], error: null };
    case "complete": return { ...state, step: "done", result: event.result, passwordProvided: false, error: null };
    case "error": return { ...state, error: event.message };
    case "back": return { ...state, step: "sources", selectedIds: state.selectedIds.filter(id => !state.excludedIds.includes(id)), excludedIds: [], decisions: {}, error: null };
    case "reset": return { ...initialImportState };
    case "start": return state;
  }
}
