/**
 * Payload Validator for DispatchPayload
 *
 * Validates that mock payloads conform to the expected structure
 * and provides helpful error messages for common mistakes.
 */

import type { DispatchPayload } from "@/lib/orchestration/agentic-flow-client";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class PayloadValidator {
  /**
   * Validates a DispatchPayload object
   */
  validate(payload: unknown): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof payload !== "object" || payload === null) {
      errors.push("Payload must be an object");
      return { valid: false, errors, warnings };
    }

    const p = payload as Partial<DispatchPayload>;

    // Required fields
    this.validateRequired(p, "run_id", "string", errors);
    this.validateRequired(p, "assignment_id", "string", errors);
    this.validateRequired(p, "card_id", "string", errors);
    this.validateRequired(p, "feature_branch", "string", errors);
    this.validateRequired(p, "allowed_paths", "array", errors);
    this.validateRequired(p, "assignment_input_snapshot", "object", errors);

    // Optional but recommended fields
    if (!p.card_title) {
      warnings.push("card_title is recommended for clarity");
    }

    if (!p.card_description) {
      warnings.push("card_description is recommended for context");
    }

    if (!p.acceptance_criteria || p.acceptance_criteria.length === 0) {
      warnings.push("acceptance_criteria is recommended for clear success metrics");
    }

    // Feature branch validation
    if (p.feature_branch && !this.isValidBranchName(p.feature_branch)) {
      warnings.push(
        `feature_branch "${p.feature_branch}" doesn't follow conventional naming (feat/, fix/, refactor/, etc.)`
      );
    }

    // Allowed paths validation
    if (p.allowed_paths && Array.isArray(p.allowed_paths)) {
      if (p.allowed_paths.length === 0) {
        warnings.push("allowed_paths is empty - no files can be modified");
      }

      p.allowed_paths.forEach((path, index) => {
        if (typeof path !== "string") {
          errors.push(`allowed_paths[${index}] must be a string`);
        } else if (path.trim() === "") {
          errors.push(`allowed_paths[${index}] is empty`);
        }
      });
    }

    // Forbidden paths validation
    if (p.forbidden_paths && Array.isArray(p.forbidden_paths)) {
      p.forbidden_paths.forEach((path, index) => {
        if (typeof path !== "string") {
          errors.push(`forbidden_paths[${index}] must be a string`);
        }
      });

      // Check for overlap
      if (p.allowed_paths && Array.isArray(p.allowed_paths)) {
        const overlaps = this.findOverlaps(p.allowed_paths, p.forbidden_paths);
        if (overlaps.length > 0) {
          errors.push(
            `Paths appear in both allowed and forbidden: ${overlaps.join(", ")}`
          );
        }
      }
    }

    // Planned files detail validation
    if (p.planned_files_detail && Array.isArray(p.planned_files_detail)) {
      p.planned_files_detail.forEach((file, index) => {
        if (!file.logical_file_name) {
          errors.push(
            `planned_files_detail[${index}].logical_file_name is required`
          );
        }
        if (!file.action) {
          errors.push(`planned_files_detail[${index}].action is required`);
        } else if (
          !["create", "edit", "delete"].includes(file.action.toLowerCase())
        ) {
          warnings.push(
            `planned_files_detail[${index}].action "${file.action}" should be create, edit, or delete`
          );
        }
        if (!file.artifact_kind) {
          errors.push(`planned_files_detail[${index}].artifact_kind is required`);
        }
        if (!file.intent_summary) {
          errors.push(
            `planned_files_detail[${index}].intent_summary is required`
          );
        }
      });

      // Check if planned files match allowed paths
      if (p.allowed_paths && p.allowed_paths.length > 0) {
        const plannedPaths = p.planned_files_detail.map(
          (f) => f.logical_file_name
        );
        const allowedSet = new Set(p.allowed_paths);
        const notInAllowed = plannedPaths.filter((path) => !allowedSet.has(path));

        if (notInAllowed.length > 0) {
          warnings.push(
            `Some planned_files_detail not in allowed_paths: ${notInAllowed.join(", ")}`
          );
        }
      }
    }

    // Context artifacts validation
    if (p.context_artifacts && Array.isArray(p.context_artifacts)) {
      p.context_artifacts.forEach((artifact, index) => {
        if (!artifact.name) {
          errors.push(`context_artifacts[${index}].name is required`);
        }
        if (!artifact.type) {
          errors.push(`context_artifacts[${index}].type is required`);
        } else if (!["test", "spec", "doc"].includes(artifact.type)) {
          warnings.push(
            `context_artifacts[${index}].type "${artifact.type}" should be test, spec, or doc`
          );
        }
        if (!artifact.content) {
          warnings.push(
            `context_artifacts[${index}].content is empty - consider adding content for context`
          );
        }
      });
    }

    // Acceptance criteria validation
    if (p.acceptance_criteria && Array.isArray(p.acceptance_criteria)) {
      p.acceptance_criteria.forEach((criterion, index) => {
        if (typeof criterion !== "string") {
          errors.push(`acceptance_criteria[${index}] must be a string`);
        } else if (criterion.trim() === "") {
          warnings.push(`acceptance_criteria[${index}] is empty`);
        } else if (!this.isGoodCriterion(criterion)) {
          warnings.push(
            `acceptance_criteria[${index}] could be more specific: "${criterion}"`
          );
        }
      });
    }

    // Memory refs validation
    if (p.memory_context_refs && Array.isArray(p.memory_context_refs)) {
      p.memory_context_refs.forEach((ref, index) => {
        if (typeof ref !== "string") {
          errors.push(`memory_context_refs[${index}] must be a string`);
        } else if (ref.trim() === "") {
          warnings.push(`memory_context_refs[${index}] is empty`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private validateRequired(
    payload: Partial<DispatchPayload>,
    field: keyof DispatchPayload,
    expectedType: "string" | "array" | "object",
    errors: string[]
  ): void {
    if (!(field in payload)) {
      errors.push(`Required field "${field}" is missing`);
      return;
    }

    const value = payload[field];

    switch (expectedType) {
      case "string":
        if (typeof value !== "string") {
          errors.push(`Field "${field}" must be a string`);
        } else if (value.trim() === "") {
          errors.push(`Field "${field}" cannot be empty`);
        }
        break;

      case "array":
        if (!Array.isArray(value)) {
          errors.push(`Field "${field}" must be an array`);
        }
        break;

      case "object":
        if (typeof value !== "object" || value === null || Array.isArray(value)) {
          errors.push(`Field "${field}" must be an object`);
        }
        break;
    }
  }

  private isValidBranchName(branch: string): boolean {
    const validPrefixes = [
      "feat/",
      "feature/",
      "fix/",
      "bugfix/",
      "hotfix/",
      "refactor/",
      "test/",
      "chore/",
      "docs/",
    ];
    return validPrefixes.some((prefix) => branch.startsWith(prefix));
  }

  private findOverlaps(allowed: string[], forbidden: string[]): string[] {
    return allowed.filter((path) => forbidden.includes(path));
  }

  private isGoodCriterion(criterion: string): boolean {
    // Good criteria are specific and measurable
    const hasAction = /\b(can|should|must|displays|shows|validates|prevents|allows)\b/i.test(
      criterion
    );
    const isSpecific = criterion.length > 20; // At least somewhat descriptive
    const avoidVague = !/\b(works|good|better|fixed|done)\b/i.test(criterion);

    return hasAction && isSpecific && avoidVague;
  }

  /**
   * Generate a validation report as formatted text
   */
  generateReport(result: ValidationResult): string {
    const lines: string[] = [];

    lines.push("=".repeat(80));
    lines.push("PAYLOAD VALIDATION REPORT");
    lines.push("=".repeat(80));

    if (result.valid) {
      lines.push("\n✅ VALID - Payload meets all requirements");
    } else {
      lines.push("\n❌ INVALID - Payload has errors that must be fixed");
    }

    if (result.errors.length > 0) {
      lines.push("\n--- ERRORS (must fix) ---");
      result.errors.forEach((error, index) => {
        lines.push(`${index + 1}. ❌ ${error}`);
      });
    }

    if (result.warnings.length > 0) {
      lines.push("\n--- WARNINGS (should address) ---");
      result.warnings.forEach((warning, index) => {
        lines.push(`${index + 1}. ⚠️  ${warning}`);
      });
    }

    if (result.valid && result.warnings.length === 0) {
      lines.push("\n🎉 Perfect! No errors or warnings.");
    }

    lines.push("\n" + "=".repeat(80));

    return lines.join("\n");
  }
}

/**
 * Convenience function to validate and print report
 */
export function validateAndReport(payload: unknown): ValidationResult {
  const validator = new PayloadValidator();
  const result = validator.validate(payload);
  const report = validator.generateReport(result);

  console.log(report);

  return result;
}

/**
 * CLI usage example
 */
export async function validateFromFile(filepath: string): Promise<void> {
  const fs = await import("fs/promises");

  try {
    const content = await fs.readFile(filepath, "utf-8");
    const payload = JSON.parse(content);

    console.log(`\nValidating payload from: ${filepath}\n`);
    validateAndReport(payload);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`\n❌ Error: ${error.message}`);
    }
    process.exit(1);
  }
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Payload Validator

Usage:
  npx tsx examples/validate-mock-payload.ts <payload.json>

Example:
  npx tsx examples/validate-mock-payload.ts my-task-payload.json
    `);
    process.exit(1);
  }

  validateFromFile(args[0]).catch(console.error);
}
