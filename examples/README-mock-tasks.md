# Mock Task Examples for `buildTaskFromPayload`

This directory contains comprehensive examples of how to create mock tasks using the `buildTaskFromPayload` function from the agentic-flow orchestration system.

## Overview

The `buildTaskFromPayload` function transforms a `DispatchPayload` into a structured task description that agents can execute. The function generates:

1. **Task Description**: Human-readable instructions including:
   - Process check (rules audit, architecture audit, requirements audit, TDD verification)
   - Context artifacts (tests, specs, documentation)
   - Implementation instructions
   - Completion verification checklist

2. **Structured Context**: Programmatic data including:
   - Planned files with actions and intent
   - Allowed/forbidden paths
   - Acceptance criteria
   - Memory references

## Quick Start

```bash
# Run the demonstration
npx tsx examples/run-mock-task-demo.ts

# Or add to package.json scripts
npm run demo:mock-tasks
```

## Example Types

### 1. Simple Feature Task
**Use case**: Straightforward feature implementation with clear requirements

```typescript
import { mockSimpleFeatureTask } from './examples/mock-task-example';

const task = mockSimpleFeatureTask();
// Creates a task for implementing user avatar upload functionality
```

**Includes**:
- Multiple file paths (API route, component, service, migration)
- Forbidden paths to prevent legacy code changes
- Detailed acceptance criteria
- Memory context references

### 2. Bug Fix Task
**Use case**: Fixing bugs with detailed file plans and context artifacts

```typescript
import { mockBugFixTask } from './examples/mock-task-example';

const task = mockBugFixTask();
// Creates a task for fixing timezone display issues
```

**Includes**:
- `planned_files_detail` with specific intents and contracts
- Context artifacts (bug report, existing tests)
- Contract notes for file modifications
- Module hints for implementation guidance

### 3. Refactoring Task
**Use case**: Architecture improvements and code modernization

```typescript
import { mockRefactoringTask } from './examples/mock-task-example';

const task = mockRefactoringTask();
// Creates a task for migrating auth to new middleware pattern
```

**Includes**:
- Architecture documentation as context
- Clear migration strategy
- Forbidden legacy paths
- Non-breaking change requirements

### 4. Minimal Task
**Use case**: Quick fixes with minimal configuration

```typescript
import { mockMinimalTask } from './examples/mock-task-example';

const task = mockMinimalTask();
// Creates a task with only required fields
```

**Includes**:
- Only essential fields (run_id, assignment_id, card_id, feature_branch)
- Single file modification

### 5. Test-Driven Development Task
**Use case**: Security-critical features requiring tests first

```typescript
import { mockTDDTask } from './examples/mock-task-example';

const task = mockTDDTask();
// Creates a task for implementing webhook signature verification
```

**Includes**:
- Test files created BEFORE implementation files
- Security requirements specification
- Test templates as context artifacts
- Explicit TDD workflow

## Payload Structure

### Required Fields

```typescript
interface DispatchPayload {
  run_id: string;              // Unique run identifier
  assignment_id: string;       // Assignment identifier
  card_id: string;             // Card identifier
  feature_branch: string;      // Git branch name
  allowed_paths: string[];     // Files that can be modified
  assignment_input_snapshot: Record<string, unknown>; // Snapshot data

  // Optional fields...
}
```

### Optional Fields

```typescript
interface DispatchPayload {
  // ... required fields

  card_title?: string;         // Display title for the card
  card_description?: string;   // Brief description of the task
  worktree_path?: string | null; // Git worktree path
  forbidden_paths?: string[];  // Paths that must not be modified
  acceptance_criteria?: string[]; // Success criteria
  memory_context_refs?: string[]; // Memory system references

  // Detailed file planning
  planned_files_detail?: Array<{
    logical_file_name: string; // Full file path
    action: string;            // "create" | "edit" | "delete"
    artifact_kind: string;     // "component" | "service" | "test" | "api" | "doc"
    intent_summary: string;    // What this file accomplishes
    contract_notes?: string;   // Interface/API contracts
    module_hint?: string;      // Implementation guidance
  }>;

  // Context artifacts for agents
  context_artifacts?: Array<{
    name: string;              // Artifact identifier
    type: string;              // "test" | "spec" | "doc"
    title?: string;            // Display title
    content?: string;          // Artifact contents (code, markdown, etc.)
  }>;
}
```

## Generated Task Structure

The `buildTaskFromPayload` function generates a task with three phases:

### Phase 1: Process Check (Pre-Implementation)
Ensures the agent:
- Audits applicable rules from Cursor AI Rules, mode-specific rules, user rules
- Maps data flow architecture
- Lists all requirements from acceptance criteria
- Populates uncertainty register (KNOWN, UNKNOWN, ASSUMED)
- Writes TDD tests BEFORE implementation
- Completes readiness checklist

**Critical**: Agent MUST complete this phase before writing any implementation code.

### Phase 2: Implementation
Contains:
- Card title and description
- Feature branch and worktree path
- Planned files with intent (if using `planned_files_detail`)
- OR allowed paths (if using simple `allowed_paths`)
- Forbidden paths
- Acceptance criteria
- Memory context references
- Context artifacts (tests, specs, documentation)

### Phase 3: Completion Verification (Post-Implementation)
Ensures the agent:
- Runs all tests (unit, integration, e2e)
- Checks for linter and type errors
- Resolves uncertainty register
- Verifies all acceptance criteria
- Checks CRUD operations
- Updates documentation
- Verifies compliance with architectural rules
- Reports via webhook with knowledge discoveries

## Best Practices

### 1. Use `planned_files_detail` for Complex Tasks
When you need to communicate specific intent and contracts:

```typescript
planned_files_detail: [
  {
    logical_file_name: "lib/security/crypto.ts",
    action: "create",
    artifact_kind: "service",
    intent_summary: "Implement constant-time HMAC verification",
    contract_notes: "Export verifySignature(payload, sig, secret) => boolean",
    module_hint: "Use crypto.timingSafeEqual to prevent timing attacks",
  },
]
```

### 2. Provide Context Artifacts for Guidance
Include tests, specs, or documentation:

```typescript
context_artifacts: [
  {
    name: "security-requirements.md",
    type: "spec",
    title: "Security Requirements",
    content: "# Security\n\n1. HMAC-SHA256...",
  },
  {
    name: "existing-test.ts",
    type: "test",
    content: "import { describe, it, expect } from 'vitest'...",
  },
]
```

### 3. Use Acceptance Criteria for Clarity
Make success measurable:

```typescript
acceptance_criteria: [
  "User can upload files up to 5MB",
  "Invalid file types show error message",
  "Upload progress displays during transfer",
  "All tests pass with >80% coverage",
]
```

### 4. Protect Critical Paths
Use `forbidden_paths` to prevent dangerous changes:

```typescript
forbidden_paths: [
  "app/api/legacy/**",      // Legacy code
  "lib/db/alembic/**",      // Wrong migration system
  "src/external-cache/**",  // Deprecated cache
]
```

### 5. Leverage Memory Context
Reference stored patterns and knowledge:

```typescript
memory_context_refs: [
  "mem-auth-pattern-003",       // Known auth pattern
  "mem-file-upload-security",   // Security guidelines
  "mem-test-strategy-001",      // Testing approach
]
```

## Testing Your Mock Tasks

```typescript
import { describe, it, expect } from 'vitest';
import { buildTaskFromPayload } from '@/lib/orchestration/build-task';
import { mockSimpleFeatureTask } from './examples/mock-task-example';

describe('Mock task examples', () => {
  it('generates valid task description', () => {
    const result = mockSimpleFeatureTask();

    expect(result.taskDescription).toContain('Phase 1: PROCESS CHECK');
    expect(result.taskDescription).toContain('Phase 2: IMPLEMENTATION');
    expect(result.taskDescription).toContain('Phase 3: COMPLETION VERIFICATION');
    expect(result.context.plannedFiles.length).toBeGreaterThan(0);
  });

  it('includes all acceptance criteria', () => {
    const result = mockSimpleFeatureTask();

    expect(result.context.acceptanceCriteria).toContain(
      'User can upload an image file (PNG, JPG, max 5MB)'
    );
  });
});
```

## Integration with Agentic-Flow Client

The mock tasks are designed to work with the agentic-flow execution system:

```typescript
import { AgenticFlowClient } from '@/lib/orchestration/agentic-flow-client';
import { mockSimpleFeatureTask } from './examples/mock-task-example';

const client = new AgenticFlowClient({
  baseUrl: process.env.AGENTIC_FLOW_URL!,
  apiKey: process.env.AGENTIC_FLOW_API_KEY!,
});

// Build the task
const mockTask = mockSimpleFeatureTask();

// Dispatch to agent swarm
await client.dispatchTask({
  run_id: "run-001",
  assignment_id: "assign-001",
  card_id: "card-001",
  // ... other fields from mock
});
```

## References

- **Implementation**: `lib/orchestration/build-task.ts`
- **Tests**: `__tests__/orchestration/build-task.test.ts`
- **Client**: `lib/orchestration/agentic-flow-client.ts`
- **Architecture**: `docs/adr/0008-agentic-flow-execution-plane.md`
- **Remaining Work**: `REMAINING_WORK_PLAN.md` §5 O10.5

## Contributing

When adding new mock task examples:

1. Create a descriptive function name (e.g., `mockSecurityAuditTask`)
2. Include realistic file paths and acceptance criteria
3. Add documentation explaining the use case
4. Update the `demonstrateMockTasks` function to include your example
5. Add tests to verify the generated task structure

## License

See project LICENSE file.
