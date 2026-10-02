import { isCancelledError, type QueryClient } from "@tanstack/react-query";
import { data, replace, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { examBankQuery } from "@/entities/exam-bank/queries";
import { assertSessionVersion } from "@/entities/auth/session-version";
import { requireAccess } from "@/features/auth/route-session";
import { examLocation, examPath } from "@/features/start-lesson/model/exam-location";
import { ExamBankImportError, importExamBank } from "@/features/start-lesson/model/import-bank";
import { actionError } from "@/shared/lib/router-query/action-result";
import { loadRouteQuery } from "@/shared/lib/router-query/route-query";
import { routeQuery } from "@/shared/lib/router-query/route-query";
import { curriculumSubjectsQuery, curriculumChaptersQuery, curriculumChapterQuery, curriculumQuizQuery } from "@/entities/curriculum/queries";
import { CurriculumAnswerSubmissionSchema } from "@innova/contracts";
import { curriculumLocation } from "@/features/study-curriculum/location";
import { submitAnswer } from "@/features/study-curriculum/submit-answer";
import { ApiError } from "@/shared/api/client";

export const examLoader = (client: QueryClient) => async ({ request, context }: LoaderFunctionArgs) => {
  const { epoch } = requireAccess(context, client, request, "exam");
  const url = new URL(request.url);
  const curriculum = curriculumLocation(url);
  if (curriculum) {
    if (curriculum.path !== url.pathname + url.search) throw replace(curriculum.path);
    await loadRouteQuery(client, curriculumSubjectsQuery(epoch), request, () => assertSessionVersion(client, epoch));
    await loadRouteQuery(client, curriculumChaptersQuery(curriculum.subjectId, epoch), request, () => assertSessionVersion(client, epoch));
    if (curriculum.chapterId) {
      await loadRouteQuery(client, curriculumChapterQuery(curriculum.subjectId, curriculum.chapterId, epoch), request, () => assertSessionVersion(client, epoch));
      if (curriculum.view === "quiz") await loadRouteQuery(client, curriculumQuizQuery(curriculum.subjectId, curriculum.chapterId, epoch), request, () => assertSessionVersion(client, epoch));
    }
    return null;
  }
  // Optional discovery must not disable the existing AWS SAP path on runtimes
  // where Curriculum is unavailable. Permission errors still block the page.
  try { await routeQuery(client, curriculumSubjectsQuery(epoch)); } catch (error) {
    assertSessionVersion(client, epoch);
    if (isCancelledError(error) || (error instanceof ApiError && [401, 403].includes(error.status))) throw error;
  }
  const location = examLocation(url);
  if (location.path !== url.pathname + url.search) throw replace(location.path);
  return loadRouteQuery(client, examBankQuery(location.bankId, epoch), request, () => assertSessionVersion(client, epoch));
};

export const examAction = (client: QueryClient) => async ({ request, context }: ActionFunctionArgs) => {
  const { epoch } = requireAccess(context, client, request, "exam");
  const curriculum = curriculumLocation(new URL(request.url));
  if (curriculum) {
    try {
      const form = await request.formData();
      if (!curriculum.chapterId || form.get("intent") !== "curriculum-grade" || typeof form.get("questionId") !== "string") return data({ error: "문항과 Chapter를 확인해 주세요." }, { status: 400 });
      const kind = form.get("kind");
      const input = CurriculumAnswerSubmissionSchema.safeParse(kind === "short-answer" ? { kind, text: form.get("text") } : kind === "self-assessment" ? { kind } : { kind, choiceIds: form.getAll("choiceIds") });
      if (!input.success) return data({ error: "답안을 확인해 주세요." }, { status: 400 });
      const grade = await submitAnswer(client, epoch, curriculum.subjectId, curriculum.chapterId, String(form.get("questionId")), input.data);
      request.signal.throwIfAborted();
      return { ok: true, grade };
    } catch (error) {
      assertSessionVersion(client, epoch);
      if (isCancelledError(error)) throw error;
      return data(actionError(error), { status: 400 });
    }
  }
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
