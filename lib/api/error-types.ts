/**
 * API error categories for consistent HTTP status mapping.
 * Aligns with Step 4 error handling contract.
 */

export type ApiErrorCode =
  | "validation_failed"
  | "not_found"
  | "conflict"
  | "action_rejected"
  | "internal_error";

export interface ApiError {
  error: ApiErrorCode;
  message: string;
  details?: Record<string, string[]>;
}

export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    "message" in value
  );
}
