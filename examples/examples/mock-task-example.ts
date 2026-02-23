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

// Export for demonstration
console.log("Mock task example loaded successfully!");
