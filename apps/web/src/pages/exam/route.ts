import { isCancelledError, type QueryClient } from "@tanstack/react-query";
import { data, replace, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { examBankQuery } from "@/entities/exam-bank/queries";
import { assertSessionVersion } from "@/entities/auth/session-version";
import { requireAccess } from "@/features/auth/route-session";
import { examLocation, examPath } from "@/features/start-lesson/model/exam-location";
import { ExamBankImportError, importExamBank } from "@/features/start-lesson/model/import-bank";
import { actionError } from "@/shared/lib/router-query/action-result";
import { loadRouteQuery } from "@/shared/lib/router-query/route-query";

export const examLoader = (client: QueryClient) => async ({ request, context }: LoaderFunctionArgs) => {
  const { epoch } = requireAccess(context, client, request, "exam");
  const url = new URL(request.url); const location = examLocation(url);
  if (location.path !== url.pathname + url.search) throw replace(location.path);
  return loadRouteQuery(client, examBankQuery(location.bankId, epoch), request, () => assertSessionVersion(client, epoch));
};

export const examAction = (client: QueryClient) => async ({ request, context }: ActionFunctionArgs) => {
  const { epoch } = requireAccess(context, client, request, "exam");
  let saved;
  try {
    const form = await request.formData(); const file = form.get("file"); const mode = form.get("mode");
    if (!(file instanceof File) || (mode !== "merge" && mode !== "replace")) return data({ error: "문항 파일과 불러오기 방식을 확인해 주세요." }, { status: 400 });
    saved = await importExamBank(client, {
      source: file, mode, currentBankId: examLocation(new URL(request.url)).bankId, epoch, signal: request.signal,
    });
  } catch (error) {
    assertSessionVersion(client, epoch);
    if (isCancelledError(error)) throw error;
    if (error instanceof ExamBankImportError) return data({ error: error.message }, { status: error.reason === "busy" ? 409 : 400 });
    return data(actionError(error), { status: 400 });
  }
  request.signal.throwIfAborted(); return replace(examPath(saved.id));
};
