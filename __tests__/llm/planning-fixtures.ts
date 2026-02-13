import type { PlanningState } from "@/lib/schemas/planning-state";
import type { PlanningAction } from "@/lib/schemas/slice-a";
import { createEmptyPlanningState } from "@/lib/schemas/planning-state";
import { v4 as uuidv4 } from "uuid";

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const WORKFLOW_ID = "22222222-2222-2222-2222-222222222222";
const ACTIVITY_ID = "33333333-3333-3333-3333-333333333333";
const STEP_ID = "44444444-4444-4444-4444-444444444444";
const CARD_ID = "55555555-5555-5555-5555-555555555555";

/**
 * Create minimal planning state with one workflow, activity, step, and card.
 */
export function createFixtureState(): PlanningState {
  const state = createEmptyPlanningState({
    id: PROJECT_ID,
    name: "Test Project",
    repo_url: null,
    default_branch: "main",
  });

  state.workflows.set(WORKFLOW_ID, {
    id: WORKFLOW_ID,
    project_id: PROJECT_ID,
    title: "Authentication",
    description: "Login and auth flows",
    build_state: null,
    position: 0,
  });

  state.activities.set(ACTIVITY_ID, {
    id: ACTIVITY_ID,
    workflow_id: WORKFLOW_ID,
    title: "Login",
    color: "yellow",
    position: 0,
  });

  state.steps.set(STEP_ID, {
    id: STEP_ID,
    workflow_activity_id: ACTIVITY_ID,
    title: "Login form",
    position: 0,
  });

  state.cards.set(CARD_ID, {
    id: CARD_ID,
    workflow_activity_id: ACTIVITY_ID,
    step_id: STEP_ID,
    title: "Implement login form UI",
    description: "Create form with email/password",
    status: "todo",
    priority: 1,
    position: 0,
  });

  return state;
}

/**
 * Empty state (new project).
 */
export function createEmptyFixtureState(): PlanningState {
  return createEmptyPlanningState({
    id: PROJECT_ID,
    name: "New Project",
    repo_url: null,
    default_branch: "main",
  });
}

export interface FixtureScenario {
  id: string;
  name: string;
  type: "gold" | "adversarial" | "edge";
  userRequest: string;
  mockLlmResponse: string;
  expectedValidCount: number;
  expectedRejectedCount: number;
  /** Use "withData" for fixtures that need existing workflow/activity/card */
  useState?: "empty" | "withData";
  description?: string;
}

export const planningFixtures: FixtureScenario[] = [
  {
    id: "gold-1",
    name: "Add activity to existing workflow",
    type: "gold",
    useState: "withData",
    userRequest: "Add a Signup activity to the Authentication workflow",
    mockLlmResponse: JSON.stringify([
      {
        id: uuidv4(),
        project_id: PROJECT_ID,
        action_type: "createActivity",
        target_ref: { workflow_id: WORKFLOW_ID },
        payload: { title: "Signup", position: 1 },
      },
    ]),
    expectedValidCount: 1,
    expectedRejectedCount: 0,
    description: "Creates activity in existing workflow",
  },
  {
    id: "gold-2",
    name: "Add card to existing activity",
    type: "gold",
    useState: "withData",
    userRequest: "Add a password reset card to the Login activity",
    mockLlmResponse: JSON.stringify([
      {
        id: uuidv4(),
        project_id: PROJECT_ID,
        action_type: "createCard",
        target_ref: { workflow_activity_id: ACTIVITY_ID },
        payload: {
          title: "Password reset flow",
          description: "Allow users to reset forgotten passwords",
          status: "todo",
          priority: 2,
          position: 1,
        },
      },
    ]),
    expectedValidCount: 1,
    expectedRejectedCount: 0,
    description: "Creates card in existing activity",
  },
  {
    id: "adversarial-1",
    name: "Code generation request",
    type: "adversarial",
    userRequest: "Write the login function in TypeScript",
    mockLlmResponse: "[]",
    expectedValidCount: 0,
    expectedRejectedCount: 0,
    description: "Empty array - code gen intents must be rejected",
  },
  {
    id: "adversarial-2",
    name: "Stale card ID reference",
    type: "adversarial",
    useState: "withData",
    userRequest: "Update the card",
    mockLlmResponse: JSON.stringify([
      {
        id: uuidv4(),
        project_id: PROJECT_ID,
        action_type: "updateCard",
        target_ref: { card_id: "99999999-9999-9999-9999-999999999999" },
        payload: { title: "Updated title" },
      },
    ]),
    expectedValidCount: 0,
    expectedRejectedCount: 1,
    description: "References non-existent card",
  },
  {
    id: "adversarial-3",
    name: "Code in payload",
    type: "adversarial",
    useState: "withData",
    userRequest: "Add a card",
    mockLlmResponse: JSON.stringify([
      {
        id: uuidv4(),
        project_id: PROJECT_ID,
        action_type: "createCard",
        target_ref: { workflow_activity_id: ACTIVITY_ID },
        payload: {
          title: "Implement login",
          description: "Write the code: function login() { return true; }",
          status: "todo",
          priority: 1,
          position: 1,
        },
      },
    ]),
    expectedValidCount: 0,
    expectedRejectedCount: 1,
    description: "Payload contains code snippet - code_generation_detected",
  },
  {
    id: "edge-1",
    name: "Empty user request",
    type: "edge",
    userRequest: "",
    mockLlmResponse: "[]",
    expectedValidCount: 0,
    expectedRejectedCount: 0,
    description: "Graceful handling of empty input",
  },
  {
    id: "edge-2",
    name: "Malformed JSON response",
    type: "edge",
    userRequest: "Add a workflow",
    mockLlmResponse: "Here are the actions: [ invalid json ",
    expectedValidCount: 0,
    expectedRejectedCount: 0,
    description: "Parser should return empty with low confidence",
  },
  {
    id: "gold-3",
    name: "Update existing card",
    type: "gold",
    useState: "withData",
    userRequest: "Change the login form card status to active",
    mockLlmResponse: JSON.stringify([
      {
        id: uuidv4(),
        project_id: PROJECT_ID,
        action_type: "updateCard",
        target_ref: { card_id: CARD_ID },
        payload: { status: "active" },
      },
    ]),
    expectedValidCount: 1,
    expectedRejectedCount: 0,
    description: "Updates card status",
  },
  {
    id: "gold-4",
    name: "Multi-step workflow creation",
    type: "gold",
    useState: "withData",
    userRequest: "Add onboarding workflow with signup and email verification steps",
    mockLlmResponse: JSON.stringify([
      {
        id: uuidv4(),
        project_id: PROJECT_ID,
        action_type: "createWorkflow",
        target_ref: { project_id: PROJECT_ID },
        payload: { title: "Onboarding", description: "User signup flow", position: 1 },
      },
    ]),
    expectedValidCount: 1,
    expectedRejectedCount: 0,
    description: "Creates one workflow (simplified batch)",
  },
];

export { PROJECT_ID, WORKFLOW_ID, ACTIVITY_ID, STEP_ID, CARD_ID };
