import { z } from "zod";

export const apiErrorCodeSchema = z.enum([
  "INVALID_INPUT",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "BUSINESS_RULE_VIOLATION",
  "INTERNAL_ERROR",
  "INVALID_CREDENTIALS",
  "EMAIL_ALREADY_EXISTS",
  "APPROVAL_PENDING",
  "SIGNUP_REJECTED",
]);

export const validationErrorReasonSchema = z.enum([
  "required",
  "invalid_type",
  "invalid_format",
  "too_short",
  "too_long",
  "out_of_range",
  "invalid_value",
]);

export const validationErrorDetailSchema = z.object({
  field: z.string(),
  reason: validationErrorReasonSchema,
});

export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    details: z.array(validationErrorDetailSchema).optional(),
  }),
});

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ValidationErrorReason = z.infer<typeof validationErrorReasonSchema>;
export type ValidationErrorDetail = z.infer<typeof validationErrorDetailSchema>;
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

function getPathValue(value: unknown, path: readonly PropertyKey[]) {
  let current = value;
  for (const segment of path) {
    if ((typeof current !== "object" || current === null) && typeof current !== "function") return undefined;
    current = (current as Record<PropertyKey, unknown>)[segment];
  }
  return current;
}

function formatPath(path: readonly PropertyKey[]) {
  if (path.length === 0) return "$";
  return path.map((segment, index) => {
    if (typeof segment === "number") return `[${segment}]`;
    const escaped = String(segment).replaceAll("\\", "\\\\").replaceAll(".", "\\.");
    return index === 0 ? escaped : `.${escaped}`;
  }).join("");
}

/** Maps Zod's version-specific issue codes to the public validation vocabulary. */
export function toValidationErrorDetails(error: z.ZodError, input: unknown): ValidationErrorDetail[] {
  return error.issues.map((issue) => {
    const publicIssue = issue as unknown as {
      code: string;
      origin?: string;
      path: PropertyKey[];
    };
    let reason: ValidationErrorReason = "invalid_value";

    if (publicIssue.code === "invalid_type") {
      reason = getPathValue(input, publicIssue.path) === undefined ? "required" : "invalid_type";
    } else if (publicIssue.code === "invalid_format") {
      reason = "invalid_format";
    } else if (publicIssue.code === "too_small") {
      reason = publicIssue.origin === "string" || publicIssue.origin === "array" ? "too_short" : "out_of_range";
    } else if (publicIssue.code === "too_big") {
      reason = publicIssue.origin === "string" || publicIssue.origin === "array" ? "too_long" : "out_of_range";
    }

    return { field: formatPath(publicIssue.path), reason };
  });
}
