import type { ApiErrorCode, ValidationErrorDetail } from "@innova/contracts";

export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: ValidationErrorDetail[],
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function invalidInput(message: string, details?: ValidationErrorDetail[]) {
  return new AppError(400, "INVALID_INPUT", message, details);
}

export function apiErrorBody(error: AppError) {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    },
  };
}
