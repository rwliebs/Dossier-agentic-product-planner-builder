#!/usr/bin/env tsx
/**
 * Interactive Mock Task Generator
 *
 * Helps create custom DispatchPayload objects for testing buildTaskFromPayload
 *
 * Usage:
 *   npx tsx examples/generate-mock-task.ts
 */

import { buildTaskFromPayload } from "@/lib/orchestration/build-task";
import type { DispatchPayload } from "@/lib/orchestration/agentic-flow-client";
import * as readline from "readline";

interface GeneratorConfig {
  taskType: "feature" | "bugfix" | "refactor" | "test" | "custom";
  includeDetailedFiles: boolean;
  includeContextArtifacts: boolean;
  includeMemoryRefs: boolean;
}

class MockTaskGenerator {
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  private question(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(prompt, resolve);
    });
  }

  private questionBoolean(prompt: string): Promise<boolean> {
    return this.question(`${prompt} (y/n): `).then(
      (answer) => answer.toLowerCase() === "y"
    );
  }

  async generatePayload(): Promise<DispatchPayload> {
    console.log("\n=== Mock Task Generator ===\n");

    // Basic information
    const runId = await this.question("Run ID (e.g., run-001): ");
    const assignmentId = await this.question(
      "Assignment ID (e.g., assign-001): "
    );
    const cardId = await this.question("Card ID (e.g., card-001): ");
    const cardTitle = await this.question(
      "Card Title (optional, press Enter to skip): "
    );
    const cardDescription = await this.question(
      "Card Description (optional, press Enter to skip): "
    );
    const featureBranch = await this.question(
      "Feature Branch (e.g., feat/my-feature): "
    );

    // File paths
    console.log("\nFile Paths (enter one per line, empty line to finish)");
    const allowedPaths: string[] = [];
    while (true) {
      const path = await this.question(`Allowed path ${allowedPaths.length + 1}: `);
      if (!path.trim()) break;
      allowedPaths.push(path.trim());
    }

    const hasForbiddenPaths = await this.questionBoolean(
      "\nAdd forbidden paths?"
    );
    const forbiddenPaths: string[] = [];
    if (hasForbiddenPaths) {
      while (true) {
        const path = await this.question(
          `Forbidden path ${forbiddenPaths.length + 1} (empty to finish): `
        );
        if (!path.trim()) break;
        forbiddenPaths.push(path.trim());
      }
    }

    // Acceptance criteria
    const hasAcceptanceCriteria = await this.questionBoolean(
      "\nAdd acceptance criteria?"
    );
    const acceptanceCriteria: string[] = [];
    if (hasAcceptanceCriteria) {
      while (true) {
        const criterion = await this.question(
          `Criterion ${acceptanceCriteria.length + 1} (empty to finish): `
        );
        if (!criterion.trim()) break;
        acceptanceCriteria.push(criterion.trim());
      }
    }

    // Detailed file planning
    const useDetailedFiles = await this.questionBoolean(
      "\nUse detailed file planning (recommended for complex tasks)?"
    );
    let plannedFilesDetail: DispatchPayload["planned_files_detail"] = undefined;

    if (useDetailedFiles && allowedPaths.length > 0) {
      plannedFilesDetail = [];
      console.log("\nDetailed File Planning");

      for (const path of allowedPaths) {
        console.log(`\nFile: ${path}`);
        const action = await this.question("  Action (create/edit/delete): ");
        const artifactKind = await this.question(
          "  Kind (component/service/test/api/doc): "
        );
        const intentSummary = await this.question("  Intent summary: ");
        const contractNotes = await this.question(
          "  Contract notes (optional): "
        );
        const moduleHint = await this.question("  Module hint (optional): ");

        plannedFilesDetail.push({
          logical_file_name: path,
          action,
          artifact_kind: artifactKind,
          intent_summary: intentSummary,
          contract_notes: contractNotes || undefined,
          module_hint: moduleHint || undefined,
        });
      }
    }

    // Context artifacts
    const hasContextArtifacts = await this.questionBoolean(
      "\nAdd context artifacts (tests, specs, docs)?"
    );
    let contextArtifacts: DispatchPayload["context_artifacts"] = undefined;

    if (hasContextArtifacts) {
      contextArtifacts = [];
      while (true) {
        const addMore = await this.questionBoolean(
          `\nAdd context artifact ${contextArtifacts.length + 1}?`
        );
        if (!addMore) break;

        const name = await this.question("  Name: ");
        const type = await this.question("  Type (test/spec/doc): ");
        const title = await this.question("  Title (optional): ");
        const content = await this.question(
          "  Content (optional, multiline support limited): "
        );

        contextArtifacts.push({
          name,
          type,
          title: title || undefined,
          content: content || undefined,
        });
      }
    }

    // Memory references
    const hasMemoryRefs = await this.questionBoolean(
      "\nAdd memory context references?"
    );
    const memoryContextRefs: string[] = [];
    if (hasMemoryRefs) {
      while (true) {
        const ref = await this.question(
          `Memory ref ${memoryContextRefs.length + 1} (empty to finish): `
        );
        if (!ref.trim()) break;
        memoryContextRefs.push(ref.trim());
      }
    }

    // Build payload
    const payload: DispatchPayload = {
      run_id: runId,
      assignment_id: assignmentId,
      card_id: cardId,
      card_title: cardTitle || undefined,
      card_description: cardDescription || undefined,
      feature_branch: featureBranch,
      worktree_path: null,
      allowed_paths: allowedPaths,
      forbidden_paths: forbiddenPaths.length > 0 ? forbiddenPaths : undefined,
      assignment_input_snapshot: {},
      acceptance_criteria:
        acceptanceCriteria.length > 0 ? acceptanceCriteria : undefined,
      memory_context_refs:
        memoryContextRefs.length > 0 ? memoryContextRefs : undefined,
      planned_files_detail: plannedFilesDetail,
      context_artifacts: contextArtifacts,
    };

    return payload;
  }

  async generate() {
    try {
      const payload = await this.generatePayload();

      console.log("\n" + "=".repeat(80));
      console.log("GENERATED PAYLOAD");
      console.log("=".repeat(80));
      console.log(JSON.stringify(payload, null, 2));

      const buildTask = await this.questionBoolean(
        "\nBuild task description from this payload?"
      );

      if (buildTask) {
        const result = buildTaskFromPayload(payload);

        console.log("\n" + "=".repeat(80));
        console.log("TASK DESCRIPTION");
        console.log("=".repeat(80));
        console.log(result.taskDescription);

        console.log("\n" + "=".repeat(80));
        console.log("TASK CONTEXT");
        console.log("=".repeat(80));
        console.log(JSON.stringify(result.context, null, 2));
      }

      const saveToFile = await this.questionBoolean(
        "\nSave payload to file?"
      );

      if (saveToFile) {
        const filename = await this.question(
          "Filename (e.g., my-task-payload.json): "
        );
        const fs = await import("fs/promises");
        await fs.writeFile(filename, JSON.stringify(payload, null, 2));
        console.log(`\n✅ Saved to ${filename}`);
      }
    } catch (error) {
      console.error("\n❌ Error:", error);
    } finally {
      this.rl.close();
    }
  }
}

// Quick templates for common scenarios
function generateQuickTemplate(type: string): DispatchPayload | null {
  const baseId = Date.now();

  switch (type) {
    case "feature":
      return {
        run_id: `run-${baseId}`,
        assignment_id: `assign-${baseId}`,
        card_id: `card-${baseId}`,
        card_title: "Quick Feature Template",
        card_description: "Implement a new feature",
        feature_branch: `feat/run-${baseId}-quick-feature`,
        worktree_path: null,
        allowed_paths: ["src/feature.ts", "__tests__/feature.test.ts"],
        forbidden_paths: ["src/legacy/**"],
        assignment_input_snapshot: {},
        acceptance_criteria: [
          "Feature works as expected",
          "Tests pass with >80% coverage",
        ],
      };

    case "bugfix":
      return {
        run_id: `run-${baseId}`,
        assignment_id: `assign-${baseId}`,
        card_id: `card-${baseId}`,
        card_title: "Quick Bug Fix Template",
        card_description: "Fix a reported bug",
        feature_branch: `fix/run-${baseId}-bug-fix`,
        worktree_path: null,
        allowed_paths: ["src/buggy-file.ts"],
        assignment_input_snapshot: {},
        acceptance_criteria: [
          "Bug no longer reproduces",
          "Existing tests still pass",
        ],
      };

    case "test":
      return {
        run_id: `run-${baseId}`,
        assignment_id: `assign-${baseId}`,
        card_id: `card-${baseId}`,
        card_title: "Quick Test Template",
        card_description: "Add missing tests",
        feature_branch: `test/run-${baseId}-add-tests`,
        worktree_path: null,
        allowed_paths: ["__tests__/new-tests.test.ts"],
        assignment_input_snapshot: {},
        acceptance_criteria: [
          "All new tests pass",
          "Coverage increased by at least 10%",
        ],
      };

    default:
      return null;
  }
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);

  if (args.length > 0 && args[0] === "--template") {
    const templateType = args[1] || "feature";
    const template = generateQuickTemplate(templateType);

    if (template) {
      console.log("\n=== Quick Template ===\n");
      console.log(JSON.stringify(template, null, 2));

      const result = buildTaskFromPayload(template);
      console.log("\n=== Task Description (first 1000 chars) ===\n");
      console.log(result.taskDescription.substring(0, 1000) + "...");
    } else {
      console.error(`Unknown template type: ${templateType}`);
      console.log("Available: feature, bugfix, test");
      process.exit(1);
    }
  } else if (args.length > 0 && args[0] === "--help") {
    console.log(`
Mock Task Generator

Usage:
  npx tsx examples/generate-mock-task.ts              # Interactive mode
  npx tsx examples/generate-mock-task.ts --template <type>  # Quick template
  npx tsx examples/generate-mock-task.ts --help      # Show this help

Templates:
  feature   - Feature implementation template
  bugfix    - Bug fix template
  test      - Test addition template

Examples:
  npx tsx examples/generate-mock-task.ts
  npx tsx examples/generate-mock-task.ts --template feature
  npx tsx examples/generate-mock-task.ts --template bugfix
    `);
  } else {
    const generator = new MockTaskGenerator();
    await generator.generate();
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { MockTaskGenerator, generateQuickTemplate };
