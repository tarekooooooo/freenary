export type AssistantErrorCode =
  | "assistant_failed"
  | "assistant_rejected"
  | "assistant_timeout"
  | "assistant_unreachable";

export interface AssistantStreamError {
  code: AssistantErrorCode;
  detail: string | null;
}

const ERROR_DETAIL_SEPARATOR = " :: ";
const MAX_DETAIL_LENGTH = 500;

const errorText = (error: unknown): string => {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return String(error);
};

const sanitizeDetail = (text: string): string => {
  const withoutUrls = text.replace(/https?:\/\/\S+/gu, "[endpoint]");

  return withoutUrls.slice(0, MAX_DETAIL_LENGTH);
};

const classifyError = (text: string): AssistantErrorCode => {
  const lower = text.toLowerCase();

  if (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("abort")
  ) {
    return "assistant_timeout";
  }

  if (
    lower.includes("fetch failed") ||
    lower.includes("failed to fetch") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("econnreset") ||
    lower.includes("network")
  ) {
    return "assistant_unreachable";
  }

  if (
    lower.includes("invalid prompt") ||
    lower.includes("invalidprompt") ||
    lower.includes("bad request") ||
    lower.includes("rejected") ||
    lower.includes("400")
  ) {
    return "assistant_rejected";
  }

  return "assistant_failed";
};

export const assistantStreamError = (
  error: unknown,
  includeDetail: boolean,
): AssistantStreamError => {
  const text = errorText(error);

  return {
    code: classifyError(text),
    detail: includeDetail ? sanitizeDetail(text) : null,
  };
};

export const assistantStreamErrorMessage = (
  error: unknown,
  includeDetail: boolean,
): string => {
  const { code, detail } = assistantStreamError(error, includeDetail);

  if (detail === null) {
    return code;
  }

  return `${code}${ERROR_DETAIL_SEPARATOR}${detail}`;
};
