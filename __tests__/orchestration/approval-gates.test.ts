import { describe, it, expect } from "vitest";
import { validateApprovalGates } from "@/lib/orchestration";

describe("validateApprovalGates", () => {
  it("returns canApprove true when all required checks passed", () => {
    const result = validateApprovalGates(
      ["dependency", "security", "lint"],
      [
        { check_type: "dependency", status: "passed" },
        { check_type: "security", status: "passed" },
        { check_type: "lint", status: "passed" },
      ]
    );

    expect(result.canApprove).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.missingChecks).toHaveLength(0);
    expect(result.failedChecks).toHaveLength(0);
  });

  it("returns canApprove false when required check is missing", () => {
    const result = validateApprovalGates(
      ["dependency", "security", "lint"],
      [
        { check_type: "dependency", status: "passed" },
        { check_type: "security", status: "passed" },
      ]
    );

    expect(result.canApprove).toBe(false);
    expect(result.missingChecks).toContain("lint");
    expect(result.errors.some((e) => e.includes("lint"))).toBe(true);
  });

  it("returns canApprove false when required check failed", () => {
    const result = validateApprovalGates(
      ["dependency", "security", "lint"],
      [
        { check_type: "dependency", status: "passed" },
        { check_type: "security", status: "failed" },
        { check_type: "lint", status: "passed" },
      ]
    );

    expect(result.canApprove).toBe(false);
    expect(result.failedChecks).toContain("security");
    expect(result.errors.some((e) => e.includes("failed"))).toBe(true);
  });

  it("returns canApprove false when required check was skipped", () => {
    const result = validateApprovalGates(
      ["dependency", "lint"],
      [
        { check_type: "dependency", status: "passed" },
        { check_type: "lint", status: "skipped" },
      ]
    );

    expect(result.canApprove).toBe(false);
    expect(result.errors.some((e) => e.includes("skipped"))).toBe(true);
  });

  it("allows extra checks beyond required", () => {
    const result = validateApprovalGates(
      ["dependency", "security"],
      [
        { check_type: "dependency", status: "passed" },
        { check_type: "security", status: "passed" },
        { check_type: "lint", status: "passed" },
        { check_type: "unit", status: "passed" },
      ]
    );

    expect(result.canApprove).toBe(true);
  });
});
