import { ApiError } from "@/shared/api/client";

export type ActionResult<Field extends string = never> = {
  error?: string;
  code?: string;
  fields?: Partial<Record<Field, string>>;
  ok?: boolean;
};

export function actionError(error: unknown): ActionResult {
  return {
    error: error instanceof ApiError
      ? "요청을 처리하지 못했습니다. 입력 내용과 권한을 확인해 주세요."
      : "요청을 처리하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.",
    code: error instanceof ApiError ? error.code : undefined,
  };
}
