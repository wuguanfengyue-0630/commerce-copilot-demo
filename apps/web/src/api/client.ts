import { errorEnvelopeSchema } from "@commerce-copilot/contracts";

interface Schema<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

interface ApiRequestOptions extends RequestInit {
  baseUrl?: string;
  fetcher?: typeof fetch;
}

export class ApiClientError extends Error {
  readonly actionable = true;

  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export async function apiRequest<T>(
  path: string,
  schema: Schema<T>,
  { baseUrl, fetcher = fetch, ...init }: ApiRequestOptions = {},
): Promise<T> {
  const browserOrigin =
    typeof globalThis.location === "object" ? globalThis.location.origin : undefined;
  if (baseUrl === undefined && browserOrigin === undefined) {
    throw new ApiClientError("SSR 请求必须提供可信 baseUrl", "MISSING_API_BASE");
  }

  const trustedBase = new URL("/", baseUrl ?? browserOrigin);
  const normalized = new URL(path, trustedBase);
  if (
    normalized.origin !== trustedBase.origin ||
    normalized.username !== "" ||
    normalized.password !== "" ||
    normalized.hash !== "" ||
    !normalized.pathname.startsWith("/api/v1/")
  ) {
    throw new ApiClientError("仅允许访问同源 /api/v1/ 接口", "INVALID_API_PATH");
  }

  const headers = new Headers(init.headers);
  if (!headers.has("accept")) {
    headers.set("accept", "application/json");
  }

  let response: Response;
  try {
    response = await fetcher(`${normalized.pathname}${normalized.search}`, {
      ...init,
      headers,
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      error.name === "AbortError"
    ) {
      throw error;
    }
    throw new ApiClientError("暂时无法连接服务，请检查网络后重新加载。", "NETWORK_ERROR");
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiClientError("服务返回的数据无法使用，请重新加载。", "INVALID_RESPONSE");
  }

  if (!response.ok) {
    const error = errorEnvelopeSchema.safeParse(body);
    throw new ApiClientError(
      error.success ? `${error.data.error.message} 请重试。` : "请求未完成，请重新加载。",
      error.success ? error.data.error.code : "HTTP_ERROR",
    );
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiClientError("服务返回的数据无法使用，请重新加载。", "INVALID_RESPONSE");
  }
  return parsed.data;
}
