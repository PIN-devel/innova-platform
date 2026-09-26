type ApiErrorPayload = {
  message?: string;
};

export class ApiError extends Error {
  readonly status: number;
  readonly data: unknown;

  constructor(
    message: string,
    status: number,
    data: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/$/, "");

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${baseUrl}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
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
    const payloadMessage = (data as ApiErrorPayload | null)?.message;
    const message = payloadMessage ||
      (typeof data === "string" && data) ||
      `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status, data);
  }

  return data as T;
}

function withBody<T>(method: "POST" | "PUT" | "PATCH", body: unknown) {
  return (path: string) =>
    request<T>(path, { method, body: JSON.stringify(body) });
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => withBody<T>("POST", body)(path),
  put: <T>(path: string, body: unknown) => withBody<T>("PUT", body)(path),
  patch: <T>(path: string, body: unknown) => withBody<T>("PATCH", body)(path),
  delete: <T = void>(path: string) => request<T>(path, { method: "DELETE" }),
};
