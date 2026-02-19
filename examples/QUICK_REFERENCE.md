# Mock Task Quick Reference Card

## 🚀 Commands

```bash
# View all examples
npm run demo:mock-tasks

# Create custom task interactively
npm run generate:mock-task

# Use a template
npm run generate:mock-task -- --template feature
npm run generate:mock-task -- --template bugfix
npm run generate:mock-task -- --template test

# Validate a payload
npm run validate:payload my-task.json

# Run tests
npm run test:examples
```

## 📋 Minimal Payload

```typescript
const payload: DispatchPayload = {
  run_id: "run-001",
  assignment_id: "assign-001",
  card_id: "card-001",
  feature_branch: "feat/my-feature",
  allowed_paths: ["src/file.ts"],
  assignment_input_snapshot: {}
};
```

## 📦 Full Payload Structure

```typescript
const payload: DispatchPayload = {
  // Required
  run_id: "run-001",
  assignment_id: "assign-001",
  card_id: "card-001",
  feature_branch: "feat/my-feature",
  allowed_paths: ["src/file.ts"],
  assignment_input_snapshot: {},

  // Recommended
  card_title: "Task Title",
  card_description: "Brief description",
  acceptance_criteria: [
    "User can do X",
    "System validates Y"
  ],

  // Optional
  worktree_path: "/tmp/worktree",
  forbidden_paths: ["src/legacy/**"],
  memory_context_refs: ["mem-pattern-001"],

  // Advanced: Detailed file planning
  planned_files_detail: [{
    logical_file_name: "src/auth.ts",
    action: "create",
    artifact_kind: "service",
    intent_summary: "Implement JWT auth",
    contract_notes: "Export verifyToken(token) => User",
    module_hint: "Use jsonwebtoken library"
  }],

  // Advanced: Context artifacts
  context_artifacts: [{
    name: "security-spec.md",
    type: "spec",
    title: "Security Requirements",
    content: "# Security\n..."
  }]
};
```

## 🎯 Common Actions

| Action | File | Artifact Kind |
|--------|------|---------------|
| Create API | `app/api/*/route.ts` | `api` |
| Create Component | `components/*.tsx` | `component` |
| Create Service | `lib/services/*.ts` | `service` |
| Create Test | `__tests__/**/*.test.ts` | `test` |
| Create Migration | `lib/db/migrations/*.ts` | `migration` |
| Add Doc | `docs/**/*.md` | `doc` |

## 🏷️ Branch Conventions

```
feat/        - New features
fix/         - Bug fixes
refactor/    - Code refactoring
test/        - Adding tests
chore/       - Maintenance
docs/        - Documentation
```

## ✅ Good Acceptance Criteria

✅ **DO**: Be specific and measurable
```typescript
"User can upload files up to 5MB with progress indicator"
"System validates email format and shows inline error"
"API responds within 200ms for 95th percentile"
```

❌ **DON'T**: Be vague
```typescript
"It works"
"Make it better"
"Fix the bug"
```

## 🚫 Forbidden Paths Examples

```typescript
forbidden_paths: [
  "app/api/legacy/**",       // Legacy code
  "lib/db/alembic/**",       // Wrong migration system
  "src/external-cache/**",   // Deprecated
  "config/production.json"   // Production config
]
```

## 📚 Context Artifact Types

```typescript
type: "test"  // Existing tests, test templates
type: "spec"  // Requirements, specifications
type: "doc"   // Architecture docs, guides
```

## 🔄 Task Phases

```
Phase 1: PROCESS CHECK
├─ Rules audit
├─ Architecture audit
├─ Requirements audit
├─ Uncertainty register
├─ TDD verification
└─ Readiness checklist

Phase 2: IMPLEMENTATION
├─ Card details
├─ Planned files
├─ Context artifacts
└─ Implementation work

Phase 3: COMPLETION VERIFICATION
├─ All tests passing
├─ No linter errors
├─ Criteria met
└─ Production ready
```

## 💻 Code Examples

### Use Predefined Mock
```typescript
import { mockSimpleFeatureTask } from './examples/mock-task-example';

const task = mockSimpleFeatureTask();
console.log(task.taskDescription);
```

### Create Custom Task
```typescript
import { buildTaskFromPayload } from '@/lib/orchestration/build-task';

const payload = { /* ... */ };
const task = buildTaskFromPayload(payload);
```

### Validate Payload
```typescript
import { PayloadValidator } from './examples/validate-mock-payload';

const validator = new PayloadValidator();
const result = validator.validate(payload);

if (result.valid) {
  // Safe to use
  const task = buildTaskFromPayload(payload);
}
```

### Generate Template
```typescript
import { generateQuickTemplate } from './examples/generate-mock-task';

const template = generateQuickTemplate('feature');
const task = buildTaskFromPayload(template);
```

## 🎓 Example Types

| Example | Use Case | Key Features |
|---------|----------|--------------|
| Simple Feature | Straightforward implementation | Multiple files, criteria |
| Bug Fix | Investigation + fix | Detailed planning, context |
| Refactoring | Code improvement | Architecture docs, no breaks |
| Minimal | Quick fixes | Required fields only |
| TDD | Security/complex | Tests first, templates |

## 📊 Validation Checks

✅ Required fields present
✅ Correct types
✅ Branch naming conventions
✅ No path overlaps
✅ Quality acceptance criteria
✅ Complete file planning
✅ Valid context artifacts

## 🔗 Links

- **Full Docs**: `examples/README-mock-tasks.md`
- **Summary**: `examples/MOCK_TASK_SUMMARY.md`
- **Examples**: `examples/mock-task-example.ts`
- **Tests**: `__tests__/examples/mock-task-examples.test.ts`

## 📞 Support

Need help? Check:
1. Full README: `examples/README-mock-tasks.md`
2. Run examples: `npm run demo:mock-tasks`
3. View tests: `__tests__/examples/mock-task-examples.test.ts`
4. Run interactive generator: `npm run generate:mock-task`

---

**Quick Tip**: Start with `npm run demo:mock-tasks` to see all examples, then use `npm run generate:mock-task -- --template feature` for your first custom task!
