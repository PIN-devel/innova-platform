import { apiErrorResponseSchema, type ApiErrorCode, type ValidationErrorDetail } from "@innova/contracts";

export class ApiError extends Error {
  readonly status: number;
  readonly data: unknown;
  readonly code?: ApiErrorCode;
  readonly details?: ValidationErrorDetail[];
  readonly requestId?: string;

  constructor(
    message: string,
    status: number,
    data: unknown,
    requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
    this.requestId = requestId;
    const parsed = apiErrorResponseSchema.safeParse(data);
    this.code = parsed.success ? parsed.data.error.code : undefined;
    this.details = parsed.success ? parsed.data.error.details : undefined;
  }
}

const baseUrl = (import.meta.env?.VITE_API_BASE_URL ?? "/api").replace(/\/$/, "");

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${baseUrl}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    credentials: "include",
    headers,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type");
  const data = contentType?.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const parsedError = apiErrorResponseSchema.safeParse(data);
    const payloadMessage = parsedError.success ? parsedError.data.error.message : undefined;
    const message = payloadMessage ||
      (typeof data === "string" && data) ||
      `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status, data, response.headers.get("X-Request-Id") ?? undefined);
  }

  return data as T;
}

function withBody<T>(method: "POST" | "PUT" | "PATCH", body: unknown, init: RequestInit = {}) {
  return (path: string) =>
    request<T>(path, { ...init, method, body: JSON.stringify(body) });
}

export const apiClient = {
  get: <T>(path: string, init?: RequestInit) => request<T>(path, init),
  post: <T>(path: string, body: unknown, init?: RequestInit) => withBody<T>("POST", body, init)(path),
  put: <T>(path: string, body: unknown, init?: RequestInit) => withBody<T>("PUT", body, init)(path),
  patch: <T>(path: string, body: unknown, init?: RequestInit) => withBody<T>("PATCH", body, init)(path),
  delete: <T = void>(path: string, init?: RequestInit) => request<T>(path, { ...init, method: "DELETE" }),
};
