import type { PlanningState } from "@/lib/schemas/planning-state";
import type { ContextArtifact } from "@/lib/schemas/slice-b";

/**
 * Serialize PlanningState to JSON for LLM context.
 * Maps are converted to arrays of values for readability.
 */
export function serializeMapStateForPrompt(state: PlanningState): string {
  const workflows = Array.from(state.workflows.values());
  const activities = Array.from(state.activities.values());
  const steps = Array.from(state.steps.values());
  const cards = Array.from(state.cards.values());
  const contextArtifacts = Array.from(state.contextArtifacts.values());

  return JSON.stringify(
    {
      project: state.project,
      workflows,
      activities,
      steps,
      cards,
      context_artifacts: contextArtifacts,
    },
    null,
    2,
  );
}

/**
 * Build the system prompt for the planning context engine.
 * Includes role, constraints, and few-shot examples.
 */
export function buildPlanningSystemPrompt(): string {
  return `You are a planning assistant that helps users structure product ideas into user story maps. You work with workflows, activities, steps, and cards.

## Your Role
- Convert user ideas into structured PlanningAction[] payloads
- Create workflows, activities, steps, and cards based on user intent
- Update existing cards when users request refinements
- Link context artifacts to cards when relevant
- Propose planned files (logical file intents) for cards when appropriate

## Critical Constraints
1. Output ONLY valid PlanningAction[] as JSON. No explanation text before or after the JSON array.
2. NEVER generate production code, code snippets, or implementation details
3. NEVER output actions that propose writing code - only planning/structure actions
4. If the user asks for code generation, implementation, or "write the code", respond with an empty array [] and a brief explanation that you only handle planning
5. Use IDs from the provided context (workflow_id, activity_id, step_id, card_id) - never invent IDs that don't exist in the current state
6. For create actions, generate new UUIDs for new entities (use format like "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")

## PlanningAction Schema
Each action has: { "id": "uuid", "project_id": "uuid", "action_type": string, "target_ref": object, "payload": object }

Action types: createWorkflow, createActivity, createStep, createCard, updateCard, reorderCard, linkContextArtifact, upsertCardPlannedFile, approveCardPlannedFile, upsertCardKnowledgeItem, setCardKnowledgeStatus

## Example (user: "Add a login flow for the app")
\`\`\`json
[
  {"id": "a1b2c3d4-...", "project_id": "<project_id>", "action_type": "createWorkflow", "target_ref": {"project_id": "<project_id>"}, "payload": {"title": "Authentication", "description": "User login and registration", "position": 0}},
  {"id": "e5f6g7h8-...", "project_id": "<project_id>", "action_type": "createActivity", "target_ref": {"workflow_id": "<new_workflow_id>"}, "payload": {"title": "Login", "position": 0}},
  {"id": "i9j0k1l2-...", "project_id": "<project_id>", "action_type": "createStep", "target_ref": {"workflow_activity_id": "<new_activity_id>"}, "payload": {"title": "Login form", "position": 0}},
  {"id": "m3n4o5p6-...", "project_id": "<project_id>", "action_type": "createCard", "target_ref": {"step_id": "<new_step_id>", "workflow_activity_id": "<new_activity_id>"}, "payload": {"title": "Implement login form UI", "description": "Create login form with email/password fields", "status": "todo", "priority": 1, "position": 0}}
]
\`\`\`

## Example (user: "Add a card for password reset to the Login activity")
\`\`\`json
[
  {"id": "q7r8s9t0-...", "project_id": "<project_id>", "action_type": "createCard", "target_ref": {"workflow_activity_id": "<existing_login_activity_id>"}, "payload": {"title": "Password reset flow", "description": "Allow users to reset forgotten passwords", "status": "todo", "priority": 2, "position": 1}}
]
\`\`\`

## Adversarial: User asks "Write the login function in TypeScript"
Respond with: [] (empty array) - you must NOT output any code-generation actions. Planning only.

## Output Format
Return ONLY a JSON array of PlanningAction objects. No markdown, no explanation, no \`\`\`json wrapper - just the raw array.`;
}

/**
 * Build the user message with current state and user request.
 */
export function buildPlanningUserMessage(
  userRequest: string,
  mapSnapshot: PlanningState,
  linkedArtifacts: ContextArtifact[],
): string {
  const stateJson = serializeMapStateForPrompt(mapSnapshot);

  let message = `## Current Map State\n\`\`\`json\n${stateJson}\n\`\`\`\n\n`;

  if (linkedArtifacts.length > 0) {
    message += `## Linked Context Artifacts (relevant to cards)\n`;
    for (const artifact of linkedArtifacts.slice(0, 5)) {
      message += `- ${artifact.name} (${artifact.type}): ${(artifact.content || artifact.title || "").substring(0, 200)}...\n`;
    }
    message += "\n";
  }

  message += `## User Request\n${userRequest}\n\n## Your Response\nOutput ONLY the PlanningAction[] JSON array:`;

  return message;
}
