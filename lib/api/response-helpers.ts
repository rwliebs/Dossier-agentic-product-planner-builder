/**
 * Consistent JSON response and error handling for API routes.
 * Aligns with Step 4 error handling contract.
 */

import type { ApiError, ApiErrorCode } from "./error-types";

const HTTP_STATUS: Record<ApiErrorCode, number> = {
  validation_failed: 400,
  not_found: 404,
  conflict: 409,
  action_rejected: 422,
  internal_error: 500,
};

export function json<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export function errorResponse(
  error: ApiErrorCode,
  message: string,
  details?: Record<string, string[]>
): Response {
  const status = HTTP_STATUS[error];
  const body: ApiError = {
    error,
    message,
    ...(details && { details }),
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export function validationError(
  message: string,
  details?: Record<string, string[]>
): Response {
  return errorResponse("validation_failed", message, details);
}

export function notFoundError(message = "Resource not found"): Response {
  return errorResponse("not_found", message);
}

export function conflictError(
  message: string,
  details?: Record<string, string[]>
): Response {
  return errorResponse("conflict", message, details);
}

export function actionRejectedError(
  message: string,
  details?: Record<string, string[]>
): Response {
  return errorResponse("action_rejected", message, details);
}

export function internalError(
  message = "An unexpected error occurred"
): Response {
  return errorResponse("internal_error", message);
}
