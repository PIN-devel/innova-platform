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
    const payloadMessage = (data as ApiErrorPayload | null)?.message;
    const message = payloadMessage ||
      (typeof data === "string" && data) ||
      `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status, data);
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
