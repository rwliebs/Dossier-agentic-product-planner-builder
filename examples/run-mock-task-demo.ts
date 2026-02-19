#!/usr/bin/env tsx
/**
 * Demo script to run mock task examples
 *
 * Usage:
 *   npx tsx examples/run-mock-task-demo.ts
 *   # or
 *   npm run demo:mock-tasks
 */

import {
  mockSimpleFeatureTask,
  mockBugFixTask,
  mockRefactoringTask,
  mockMinimalTask,
  mockTDDTask,
  demonstrateMockTasks,
} from "./mock-task-example";

// Run the demonstration
demonstrateMockTasks();

// Export for programmatic use
export {
  mockSimpleFeatureTask,
  mockBugFixTask,
  mockRefactoringTask,
  mockMinimalTask,
  mockTDDTask,
};
