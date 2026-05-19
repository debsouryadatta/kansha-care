export const apiBase = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

type ApiErrorPayload = {
  error?: string;
  details?: unknown;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "content-type": "application/json",
        ...(init?.headers ?? {})
      }
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : undefined;
    throw new ApiError("Cannot reach the Kansha API", 0, details);
  }

  const json = await readPayload(response);
  if (!response.ok) {
    throw new ApiError(json.error ?? `Request failed with HTTP ${response.status}`, response.status, json.details);
  }
  return json as T;
}

async function readPayload(response: Response): Promise<ApiErrorPayload & Record<string, unknown>> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json().catch(() => ({}));
  }

  const text = await response.text().catch(() => "");
  return text ? { error: text } : {};
}

export function getErrorMessage(error: unknown, fallback = "Something went wrong") {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

export function getErrorDescription(error: unknown) {
  if (!(error instanceof ApiError)) return undefined;

  if (error.status === 0) {
    return `Network request failed. Check that the backend is running at ${apiBase}.`;
  }

  const detailText = formatErrorDetails(error.details);
  if (detailText) return `HTTP ${error.status}: ${detailText}`;
  return `HTTP ${error.status}`;
}

function formatErrorDetails(details: unknown) {
  if (!details) return "";
  if (typeof details === "string") return details;

  if (typeof details === "object" && details) {
    const flattened = details as {
      formErrors?: unknown;
      fieldErrors?: Record<string, unknown>;
    };
    const messages: string[] = [];
    if (Array.isArray(flattened.formErrors)) {
      messages.push(...flattened.formErrors.filter((item): item is string => typeof item === "string"));
    }
    if (flattened.fieldErrors && typeof flattened.fieldErrors === "object") {
      for (const [field, fieldMessages] of Object.entries(flattened.fieldErrors)) {
        if (Array.isArray(fieldMessages)) {
          const text = fieldMessages.filter((item): item is string => typeof item === "string").join(", ");
          if (text) messages.push(`${field}: ${text}`);
        }
      }
    }
    if (messages.length) return messages.slice(0, 3).join(" · ");
  }

  return "";
}
