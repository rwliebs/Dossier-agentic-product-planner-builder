/**
 * Build a keyed validation details object from a Zod error for 400 responses.
 * Use with validationError(message, zodErrorDetails(error)).
 */

import type { ZodError } from "zod";

export function zodErrorDetails(error: ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const e of error.errors) {
    const path = e.path.join(".") || "body";
    if (!details[path]) details[path] = [];
    details[path].push(e.message);
  }
  return details;
}
