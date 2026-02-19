/**
 * Tests for mock task examples
 */

import { describe, it, expect } from "vitest";
import {
  mockSimpleFeatureTask,
  mockBugFixTask,
  mockRefactoringTask,
  mockMinimalTask,
  mockTDDTask,
} from "../../examples/mock-task-example";
import {
  PayloadValidator,
  validateAndReport,
} from "../../examples/validate-mock-payload";
import { generateQuickTemplate } from "../../examples/generate-mock-task";

describe("Mock Task Examples", () => {
  describe("mockSimpleFeatureTask", () => {
    it("generates valid task with all required fields", () => {
      const result = mockSimpleFeatureTask();

      expect(result.taskDescription).toBeTruthy();
      expect(result.taskDescription).toContain("Phase 1: PROCESS CHECK");
      expect(result.taskDescription).toContain("Phase 2: IMPLEMENTATION");
      expect(result.taskDescription).toContain("Phase 3: COMPLETION VERIFICATION");
      expect(result.taskDescription).toContain("Add User Profile Avatar Upload");
    });

    it("includes planned files in context", () => {
      const result = mockSimpleFeatureTask();

      expect(result.context.plannedFiles).toHaveLength(4);
      expect(result.context.plannedFiles[0].name).toBe(
        "app/api/user/avatar/route.ts"
      );
      expect(result.context.plannedFiles[0].action).toBe("create_or_edit");
    });

    it("includes acceptance criteria", () => {
      const result = mockSimpleFeatureTask();

      expect(result.context.acceptanceCriteria).toContain(
        "User can upload an image file (PNG, JPG, max 5MB)"
      );
      expect(result.context.acceptanceCriteria).toHaveLength(5);
    });

    it("includes forbidden paths", () => {
      const result = mockSimpleFeatureTask();

      expect(result.context.forbiddenPaths).toContain("app/api/legacy/**");
      expect(result.context.forbiddenPaths).toContain("lib/db/alembic/**");
    });

    it("includes memory references", () => {
      const result = mockSimpleFeatureTask();

      expect(result.context.memoryRefs).toContain("mem-user-service-001");
      expect(result.context.memoryRefs).toContain("mem-file-upload-pattern-002");
    });
  });

  describe("mockBugFixTask", () => {
    it("includes detailed file planning", () => {
      const result = mockBugFixTask();

      expect(result.taskDescription).toContain("lib/utils/timezone.ts");
      expect(result.taskDescription).toContain("edit");
      expect(result.taskDescription).toContain(
        "Fix timezone conversion logic to use tzid from database"
      );
    });

    it("includes context artifacts", () => {
      const result = mockBugFixTask();

      expect(result.taskDescription).toContain("timezone-bug-report.md");
      expect(result.taskDescription).toContain("existing-timezone-test.ts");
      expect(result.taskDescription).toContain("# Bug Report");
    });

    it("has bug-specific acceptance criteria", () => {
      const result = mockBugFixTask();

      expect(result.context.acceptanceCriteria).toContain(
        "Events display in user's local timezone"
      );
      expect(result.context.acceptanceCriteria).toContain(
        "All existing tests pass"
      );
    });

    it("includes file contract notes", () => {
      const result = mockBugFixTask();

      expect(result.taskDescription).toContain(
        "Export convertToLocalTimezone(utcDate, tzid) => LocalDate"
      );
      expect(result.taskDescription).toContain("Props: { startUtc, endUtc, tzid }");
    });
  });

  describe("mockRefactoringTask", () => {
    it("includes architecture documentation", () => {
      const result = mockRefactoringTask();

      expect(result.taskDescription).toContain("Auth Architecture");
      expect(result.taskDescription).toContain("Current Pattern (Legacy)");
      expect(result.taskDescription).toContain("New Pattern (Target)");
    });

    it("has refactoring-specific criteria", () => {
      const result = mockRefactoringTask();

      expect(result.context.acceptanceCriteria).toContain(
        "No breaking changes to public API"
      );
      expect(result.context.acceptanceCriteria).toContain(
        "Legacy code removed after migration"
      );
    });

    it("protects legacy code paths", () => {
      const result = mockRefactoringTask();

      expect(result.context.forbiddenPaths).toContain("lib/auth/legacy/**");
      expect(result.context.forbiddenPaths).toContain("app/api/legacy/**");
    });
  });

  describe("mockMinimalTask", () => {
    it("works with only required fields", () => {
      const result = mockMinimalTask();

      expect(result.taskDescription).toBeTruthy();
      expect(result.context.plannedFiles).toHaveLength(1);
      expect(result.context.acceptanceCriteria).toHaveLength(0);
      expect(result.context.memoryRefs).toHaveLength(0);
    });

    it("still includes all three phases", () => {
      const result = mockMinimalTask();

      expect(result.taskDescription).toContain("Phase 1: PROCESS CHECK");
      expect(result.taskDescription).toContain("Phase 2: IMPLEMENTATION");
      expect(result.taskDescription).toContain("Phase 3: COMPLETION VERIFICATION");
    });
  });

  describe("mockTDDTask", () => {
    it("prioritizes tests before implementation", () => {
      const result = mockTDDTask();

      expect(result.taskDescription).toContain(
        "__tests__/api/webhooks/verify.test.ts"
      );
      expect(result.taskDescription).toContain("Write failing tests");
      expect(result.taskDescription).toContain("FIRST before implementation");
    });

    it("includes security-specific requirements", () => {
      const result = mockTDDTask();

      expect(result.taskDescription).toContain("HMAC-SHA256");
      expect(result.taskDescription).toContain("timing attacks");
      expect(result.taskDescription).toContain("crypto.timingSafeEqual");
    });

    it("includes test template as context", () => {
      const result = mockTDDTask();

      expect(result.taskDescription).toContain("webhook-test-template.ts");
      expect(result.taskDescription).toContain("expect(false).toBe(true)"); // Failing test
    });

    it("has security-focused acceptance criteria", () => {
      const result = mockTDDTask();

      expect(result.context.acceptanceCriteria).toContain(
        "Webhook signatures verified using HMAC-SHA256"
      );
      expect(result.context.acceptanceCriteria).toContain(
        "Replay attacks prevented with timestamp checking"
      );
    });
  });

  describe("All mock tasks", () => {
    const allTasks = [
      { name: "Simple Feature", fn: mockSimpleFeatureTask },
      { name: "Bug Fix", fn: mockBugFixTask },
      { name: "Refactoring", fn: mockRefactoringTask },
      { name: "Minimal", fn: mockMinimalTask },
      { name: "TDD", fn: mockTDDTask },
    ];

    allTasks.forEach(({ name, fn }) => {
      it(`${name}: has valid structure`, () => {
        const result = fn();

        expect(result).toHaveProperty("taskDescription");
        expect(result).toHaveProperty("context");
        expect(result.context).toHaveProperty("plannedFiles");
        expect(result.context).toHaveProperty("allowedPaths");
        expect(result.context).toHaveProperty("forbiddenPaths");
        expect(result.context).toHaveProperty("acceptanceCriteria");
        expect(result.context).toHaveProperty("memoryRefs");
      });

      it(`${name}: includes process check phase`, () => {
        const result = fn();

        expect(result.taskDescription).toContain("PROCESS CHECK");
        expect(result.taskDescription).toContain("RULES AUDIT");
        expect(result.taskDescription).toContain("ARCHITECTURE AUDIT");
        expect(result.taskDescription).toContain("REQUIREMENTS AUDIT");
        expect(result.taskDescription).toContain("UNCERTAINTY REGISTER");
        expect(result.taskDescription).toContain("TDD VERIFICATION");
        expect(result.taskDescription).toContain("READINESS CHECKLIST");
      });

      it(`${name}: includes completion verification phase`, () => {
        const result = fn();

        expect(result.taskDescription).toContain("COMPLETION VERIFICATION");
        expect(result.taskDescription).toContain("All unit tests passing");
        expect(result.taskDescription).toContain("No new linter errors");
        expect(result.taskDescription).toContain("Ready for Production?");
      });
    });
  });
});

describe("PayloadValidator", () => {
  const validator = new PayloadValidator();

  describe("Required field validation", () => {
    it("rejects payload with missing required fields", () => {
      const result = validator.validate({});

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Required field "run_id" is missing');
      expect(result.errors).toContain('Required field "assignment_id" is missing');
      expect(result.errors).toContain('Required field "card_id" is missing');
      expect(result.errors).toContain(
        'Required field "feature_branch" is missing'
      );
      expect(result.errors).toContain('Required field "allowed_paths" is missing');
    });

    it("accepts payload with all required fields", () => {
      const payload = {
        run_id: "run-001",
        assignment_id: "assign-001",
        card_id: "card-001",
        feature_branch: "feat/test",
        allowed_paths: ["src/test.ts"],
        assignment_input_snapshot: {},
      };

      const result = validator.validate(payload);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("Field type validation", () => {
    it("rejects non-string run_id", () => {
      const payload = {
        run_id: 123,
        assignment_id: "assign-001",
        card_id: "card-001",
        feature_branch: "feat/test",
        allowed_paths: ["src/test.ts"],
        assignment_input_snapshot: {},
      };

      const result = validator.validate(payload);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Field "run_id" must be a string');
    });

    it("rejects non-array allowed_paths", () => {
      const payload = {
        run_id: "run-001",
        assignment_id: "assign-001",
        card_id: "card-001",
        feature_branch: "feat/test",
        allowed_paths: "src/test.ts",
        assignment_input_snapshot: {},
      };

      const result = validator.validate(payload);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Field "allowed_paths" must be an array');
    });
  });

  describe("Branch name validation", () => {
    it("warns about invalid branch name format", () => {
      const payload = {
        run_id: "run-001",
        assignment_id: "assign-001",
        card_id: "card-001",
        feature_branch: "my-random-branch",
        allowed_paths: ["src/test.ts"],
        assignment_input_snapshot: {},
      };

      const result = validator.validate(payload);

      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes("conventional naming"))).toBe(
        true
      );
    });

    it("accepts conventional branch names", () => {
      const validBranches = [
        "feat/add-login",
        "fix/timezone-bug",
        "refactor/auth-service",
        "test/add-coverage",
        "chore/update-deps",
      ];

      validBranches.forEach((branch) => {
        const payload = {
          run_id: "run-001",
          assignment_id: "assign-001",
          card_id: "card-001",
          feature_branch: branch,
          allowed_paths: ["src/test.ts"],
          assignment_input_snapshot: {},
        };

        const result = validator.validate(payload);
        const hasWarning = result.warnings.some((w) =>
          w.includes("conventional naming")
        );

        expect(hasWarning).toBe(false);
      });
    });
  });

  describe("Path overlap validation", () => {
    it("detects overlapping allowed and forbidden paths", () => {
      const payload = {
        run_id: "run-001",
        assignment_id: "assign-001",
        card_id: "card-001",
        feature_branch: "feat/test",
        allowed_paths: ["src/test.ts", "src/utils.ts"],
        forbidden_paths: ["src/test.ts"],
        assignment_input_snapshot: {},
      };

      const result = validator.validate(payload);

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes("appear in both allowed and forbidden"))
      ).toBe(true);
    });
  });

  describe("Acceptance criteria validation", () => {
    it("warns about vague criteria", () => {
      const payload = {
        run_id: "run-001",
        assignment_id: "assign-001",
        card_id: "card-001",
        feature_branch: "feat/test",
        allowed_paths: ["src/test.ts"],
        assignment_input_snapshot: {},
        acceptance_criteria: ["It works", "Make it better", "Fix it"],
      };

      const result = validator.validate(payload);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.includes("could be more specific"))).toBe(
        true
      );
    });

    it("accepts good criteria", () => {
      const payload = {
        run_id: "run-001",
        assignment_id: "assign-001",
        card_id: "card-001",
        feature_branch: "feat/test",
        allowed_paths: ["src/test.ts"],
        assignment_input_snapshot: {},
        acceptance_criteria: [
          "User can upload files up to 5MB in size",
          "System validates file type and rejects invalid formats",
          "Upload progress displays as percentage during transfer",
        ],
      };

      const result = validator.validate(payload);

      const hasVagueCriteria = result.warnings.some((w) =>
        w.includes("could be more specific")
      );
      expect(hasVagueCriteria).toBe(false);
    });
  });

  describe("Planned files detail validation", () => {
    it("validates planned file structure", () => {
      const payload = {
        run_id: "run-001",
        assignment_id: "assign-001",
        card_id: "card-001",
        feature_branch: "feat/test",
        allowed_paths: [],
        assignment_input_snapshot: {},
        planned_files_detail: [
          {
            logical_file_name: "",
            action: "",
            artifact_kind: "",
            intent_summary: "",
          },
        ],
      };

      const result = validator.validate(payload);

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes("logical_file_name is required"))
      ).toBe(true);
      expect(result.errors.some((e) => e.includes("action is required"))).toBe(true);
      expect(result.errors.some((e) => e.includes("artifact_kind is required"))).toBe(
        true
      );
      expect(result.errors.some((e) => e.includes("intent_summary is required"))).toBe(
        true
      );
    });
  });

  describe("generateReport", () => {
    it("generates formatted report for valid payload", () => {
      const result = {
        valid: true,
        errors: [],
        warnings: [],
      };

      const report = validator.generateReport(result);

      expect(report).toContain("VALID");
      expect(report).toContain("✅");
      expect(report).toContain("🎉");
    });

    it("generates formatted report for invalid payload", () => {
      const result = {
        valid: false,
        errors: ["Missing run_id", "Invalid branch name"],
        warnings: ["No acceptance criteria"],
      };

      const report = validator.generateReport(result);

      expect(report).toContain("INVALID");
      expect(report).toContain("❌");
      expect(report).toContain("ERRORS");
      expect(report).toContain("WARNINGS");
      expect(report).toContain("Missing run_id");
      expect(report).toContain("No acceptance criteria");
    });
  });
});

describe("Quick Templates", () => {
  it("generates feature template", () => {
    const template = generateQuickTemplate("feature");

    expect(template).toBeTruthy();
    expect(template?.card_title).toContain("Feature");
    expect(template?.feature_branch).toContain("feat/");
  });

  it("generates bugfix template", () => {
    const template = generateQuickTemplate("bugfix");

    expect(template).toBeTruthy();
    expect(template?.card_title).toContain("Bug Fix");
    expect(template?.feature_branch).toContain("fix/");
  });

  it("generates test template", () => {
    const template = generateQuickTemplate("test");

    expect(template).toBeTruthy();
    expect(template?.card_title).toContain("Test");
    expect(template?.feature_branch).toContain("test/");
  });

  it("returns null for unknown template", () => {
    const template = generateQuickTemplate("unknown");

    expect(template).toBeNull();
  });
});
