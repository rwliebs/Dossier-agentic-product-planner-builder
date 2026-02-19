/**
 * Mock Task Examples for buildTaskFromPayload
 *
 * Demonstrates how to create various task payloads and generate
 * task descriptions for the agentic-flow execution system.
 */

import { buildTaskFromPayload } from "@/lib/orchestration/build-task";
import type { DispatchPayload } from "@/lib/orchestration/agentic-flow-client";

/**
 * Example 1: Simple feature implementation task
 */
export function mockSimpleFeatureTask() {
  const payload: DispatchPayload = {
    run_id: "run-001",
    assignment_id: "assign-001",
    card_id: "card-feature-001",
    card_title: "Add User Profile Avatar Upload",
    card_description: "Allow users to upload and display profile avatars",
    feature_branch: "feat/run-001-user-avatar",
    worktree_path: "/tmp/worktree-001",
    allowed_paths: [
      "app/api/user/avatar/route.ts",
      "components/profile/AvatarUpload.tsx",
      "lib/services/user-service.ts",
      "lib/db/migrations/0025_add_user_avatar.ts",
    ],
    forbidden_paths: [
      "app/api/legacy/**",
      "lib/db/alembic/**",
    ],
    assignment_input_snapshot: {},
    acceptance_criteria: [
      "User can upload an image file (PNG, JPG, max 5MB)",
      "Avatar displays in profile header after upload",
      "Old avatar is replaced when new one is uploaded",
      "Invalid file types show user-friendly error",
      "Upload progress indicator displays during upload",
    ],
    memory_context_refs: ["mem-user-service-001", "mem-file-upload-pattern-002"],
  };

  return buildTaskFromPayload(payload);
}

/**
 * Example 2: Bug fix task with detailed file plans
 */
export function mockBugFixTask() {
  const payload: DispatchPayload = {
    run_id: "run-002",
    assignment_id: "assign-002",
    card_id: "card-bugfix-002",
    card_title: "Fix Timezone Display Bug",
    card_description: "Event times showing in wrong timezone for international users",
    feature_branch: "fix/run-002-timezone-bug",
    worktree_path: null,
    allowed_paths: [],
    forbidden_paths: ["lib/db/legacy/**"],
    assignment_input_snapshot: {
      reportedBy: "user-123",
      affectedUsers: 45,
      severity: "high",
    },
    acceptance_criteria: [
      "Events display in user's local timezone",
      "Timezone conversion preserves exact moment in time",
      "Past events show correct historical timezone",
      "All existing tests pass",
    ],
    planned_files_detail: [
      {
        logical_file_name: "lib/utils/timezone.ts",
        action: "edit",
        artifact_kind: "service",
        intent_summary: "Fix timezone conversion logic to use tzid from database",
        contract_notes: "Export convertToLocalTimezone(utcDate, tzid) => LocalDate",
        module_hint: "Use date-fns-tz library for conversions",
      },
      {
        logical_file_name: "components/events/EventTime.tsx",
        action: "edit",
        artifact_kind: "component",
        intent_summary: "Update component to use fixed timezone utility",
        contract_notes: "Props: { startUtc, endUtc, tzid }",
        module_hint: "Add data-testid for timezone display",
      },
      {
        logical_file_name: "__tests__/utils/timezone.test.ts",
        action: "create",
        artifact_kind: "test",
        intent_summary: "Add comprehensive timezone conversion tests",
        contract_notes: "Test DST transitions, edge timezones (UTC+14, UTC-12)",
        module_hint: "Use vitest for unit tests",
      },
    ],
    context_artifacts: [
      {
        name: "timezone-bug-report.md",
        type: "spec",
        title: "User Report: Events showing wrong times",
        content: `# Bug Report

## Observed Behavior
Events scheduled for 2:00 PM PST showing as 10:00 PM for users in that timezone.

## Expected Behavior
Events should display in the user's local timezone correctly.

## Steps to Reproduce
1. Create event at 2:00 PM PST
2. View event as user with PST timezone
3. Time shows as 10:00 PM instead of 2:00 PM

## Environment
- Browser: Chrome 120
- Timezone: America/Los_Angeles
- User locale: en-US`,
      },
      {
        name: "existing-timezone-test.ts",
        type: "test",
        title: "Current Timezone Tests",
        content: `import { describe, it, expect } from 'vitest';
import { formatEventTime } from '@/lib/utils/timezone';

describe('Timezone formatting', () => {
  it('formats UTC time', () => {
    const result = formatEventTime(new Date('2024-01-15T14:00:00Z'));
    expect(result).toBeDefined();
  });
});`,
      },
    ],
  };

  return buildTaskFromPayload(payload);
}

/**
 * Example 3: Refactoring task with architecture constraints
 */
export function mockRefactoringTask() {
  const payload: DispatchPayload = {
    run_id: "run-003",
    assignment_id: "assign-003",
    card_id: "card-refactor-003",
    card_title: "Migrate Auth to New Pattern",
    card_description: "Refactor authentication to use new middleware pattern",
    feature_branch: "refactor/run-003-auth-middleware",
    worktree_path: "/tmp/worktree-003",
    allowed_paths: [
      "lib/middleware/auth.ts",
      "app/api/auth/**",
      "lib/services/auth-service.ts",
    ],
    forbidden_paths: [
      "lib/auth/legacy/**",
      "app/api/legacy/**",
    ],
    assignment_input_snapshot: {},
    acceptance_criteria: [
      "All auth checks use new middleware pattern",
      "No breaking changes to public API",
      "All existing tests pass without modification",
      "Legacy code removed after migration",
      "Performance maintained or improved",
    ],
    memory_context_refs: ["mem-auth-pattern-003"],
    context_artifacts: [
      {
        name: "auth-architecture.md",
        type: "doc",
        title: "Authentication Architecture",
        content: `# Auth Architecture

## Current Pattern (Legacy)
- Direct database calls in API routes
- JWT verification in each endpoint
- Session management scattered across files

## New Pattern (Target)
- Centralized auth middleware
- Token validation in single location
- Consistent error handling
- Better testability

## Migration Strategy
1. Create new middleware
2. Wrap existing endpoints gradually
3. Remove direct auth calls
4. Delete legacy code`,
      },
    ],
  };

  return buildTaskFromPayload(payload);
}

/**
 * Example 4: Minimal task (just required fields)
 */
export function mockMinimalTask() {
  const payload: DispatchPayload = {
    run_id: "run-004",
    assignment_id: "assign-004",
    card_id: "card-004",
    feature_branch: "feat/run-004-quick-fix",
    allowed_paths: ["lib/utils/format.ts"],
    assignment_input_snapshot: {},
  };

  return buildTaskFromPayload(payload);
}

/**
 * Example 5: Test-driven development task
 */
export function mockTDDTask() {
  const payload: DispatchPayload = {
    run_id: "run-005",
    assignment_id: "assign-005",
    card_id: "card-tdd-005",
    card_title: "Implement Webhook Signature Verification",
    card_description: "Add cryptographic signature verification for incoming webhooks",
    feature_branch: "feat/run-005-webhook-security",
    worktree_path: null,
    allowed_paths: [],
    forbidden_paths: [],
    assignment_input_snapshot: {},
    acceptance_criteria: [
      "Webhook signatures verified using HMAC-SHA256",
      "Invalid signatures rejected with 401 status",
      "Replay attacks prevented with timestamp checking",
      "All security tests pass",
    ],
    planned_files_detail: [
      {
        logical_file_name: "__tests__/api/webhooks/verify.test.ts",
        action: "create",
        artifact_kind: "test",
        intent_summary: "Write failing tests for signature verification",
        contract_notes: "Test valid signatures, invalid signatures, replay attacks, timing attacks",
        module_hint: "Write these tests FIRST before implementation",
      },
      {
        logical_file_name: "lib/security/webhook-verify.ts",
        action: "create",
        artifact_kind: "service",
        intent_summary: "Implement signature verification after tests are written",
        contract_notes: "Export verifyWebhookSignature(payload, signature, secret) => boolean",
        module_hint: "Use Node.js crypto module, constant-time comparison",
      },
      {
        logical_file_name: "app/api/webhooks/stripe/route.ts",
        action: "edit",
        artifact_kind: "api",
        intent_summary: "Add signature verification to webhook endpoint",
        contract_notes: "Return 401 for invalid signatures, 200 for valid",
        module_hint: "Call verification before processing webhook",
      },
    ],
    context_artifacts: [
      {
        name: "webhook-security-requirements.md",
        type: "spec",
        title: "Webhook Security Requirements",
        content: `# Webhook Security

## Requirements
1. HMAC-SHA256 signature verification
2. Timestamp-based replay prevention (5 min window)
3. Constant-time comparison to prevent timing attacks
4. Detailed security logging

## Test Cases Required
- Valid signature accepted
- Invalid signature rejected
- Expired timestamp rejected
- Missing signature rejected
- Tampered payload rejected

## Implementation Notes
- Use crypto.timingSafeEqual for comparison
- Log security events to Sentry
- Never log the secret key`,
      },
      {
        name: "webhook-test-template.ts",
        type: "test",
        title: "Test Template",
        content: `import { describe, it, expect, beforeEach } from 'vitest';
import { verifyWebhookSignature } from '@/lib/security/webhook-verify';

describe('Webhook signature verification', () => {
  const secret = 'test-secret-key';
  const validPayload = '{"event":"test"}';

  describe('valid signatures', () => {
    it('accepts correctly signed payload', () => {
      // TODO: Implement
      expect(false).toBe(true); // Failing test
    });
  });

  describe('invalid signatures', () => {
    it('rejects tampered payload', () => {
      // TODO: Implement
      expect(false).toBe(true); // Failing test
    });

    it('rejects expired timestamp', () => {
      // TODO: Implement
      expect(false).toBe(true); // Failing test
    });
  });
});`,
      },
    ],
  };

  return buildTaskFromPayload(payload);
}

/**
 * Demo: Print all mock tasks
 */
export function demonstrateMockTasks() {
  console.log("=".repeat(80));
  console.log("MOCK TASK EXAMPLES FOR buildTaskFromPayload");
  console.log("=".repeat(80));

  const examples = [
    { name: "Simple Feature Task", fn: mockSimpleFeatureTask },
    { name: "Bug Fix Task", fn: mockBugFixTask },
    { name: "Refactoring Task", fn: mockRefactoringTask },
    { name: "Minimal Task", fn: mockMinimalTask },
    { name: "TDD Task", fn: mockTDDTask },
  ];

  examples.forEach(({ name, fn }, index) => {
    console.log(`\n${"=".repeat(80)}`);
    console.log(`Example ${index + 1}: ${name}`);
    console.log("=".repeat(80));

    const result = fn();

    console.log("\n--- Task Description Preview (first 500 chars) ---");
    console.log(result.taskDescription.substring(0, 500) + "...\n");

    console.log("--- Context Summary ---");
    console.log(`Planned Files: ${result.context.plannedFiles.length}`);
    console.log(`Allowed Paths: ${result.context.allowedPaths.length}`);
    console.log(`Forbidden Paths: ${result.context.forbiddenPaths.length}`);
    console.log(`Acceptance Criteria: ${result.context.acceptanceCriteria.length}`);
    console.log(`Memory Refs: ${result.context.memoryRefs.length}`);

    if (result.context.plannedFiles.length > 0) {
      console.log("\n--- Planned Files ---");
      result.context.plannedFiles.forEach(pf => {
        console.log(`  • ${pf.name} (${pf.action})`);
        if (pf.intent) console.log(`    Intent: ${pf.intent}`);
      });
    }

    if (result.context.acceptanceCriteria.length > 0) {
      console.log("\n--- Acceptance Criteria ---");
      result.context.acceptanceCriteria.forEach(ac => {
        console.log(`  ✓ ${ac}`);
      });
    }
  });

  console.log("\n" + "=".repeat(80));
  console.log("END OF EXAMPLES");
  console.log("=".repeat(80));
}

// Uncomment to run the demo
// demonstrateMockTasks();
