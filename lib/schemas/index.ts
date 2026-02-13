/**
 * Central schema export point for the canonical domain model.
 * Schemas are organized by slice to reduce test/migration complexity.
 */

export * from "./slice-a";
export * from "./slice-b";

// Future slices
// export * from "./slice-c"; // execution, checks, approval, audit
