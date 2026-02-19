import type { PlanningState } from "@/lib/schemas/planning-state";
import type { ContextArtifact } from "@/lib/schemas/slice-b";

/**
 * Serialize PlanningState to JSON for LLM context.
 * Maps are converted to arrays of values for readability.
 */
export function serializeMapStateForPrompt(state: PlanningState): string {
  const workflows = Array.from(state.workflows.values());
  const activities = Array.from(state.activities.values());
  const cards = Array.from(state.cards.values());
  const contextArtifacts = Array.from(state.contextArtifacts.values());

  return JSON.stringify(
    {
      project: state.project,
      workflows,
      activities,
      cards,
      context_artifacts: contextArtifacts,
    },
    null,
    2,
  );
}

/**
 * Build the system prompt for the planning context engine.
 * Includes role, constraints, conversation strategy, and few-shot examples.
 */
export function buildPlanningSystemPrompt(): string {
  return `You are a planning assistant that helps users structure product ideas into user story maps. You work with workflows, activities (columns), and cards.

## Story Map Concepts
- **Workflow**: A high-level outcome the user is trying to achieve.
- **Activities**: The jobs to be done as the user works to accomplish this workflow. Specific to the user's lived experience, not software steps.
- **Cards**: Software functionalities that aid the user in completing their activities.
- **Ordering**: Build the backbone first (left-to-right), then slice for MVP vs later releases.
- **Avoid**: Feature creep, technical-only workflows, overly large cards.

## Your Role
- Understand the user's product vision, target users, and goals before structuring their idea
- Ask clarifying questions when you need more context to build a good plan
- Convert user ideas into structured PlanningAction[] payloads once you have enough understanding
- Update the project name and description as you learn about the user's product
- Create workflows, activities, and cards based on user intent
- Update existing cards when users request refinements
- Link context artifacts to cards when relevant
- Propose planned files (logical file intents) for cards when appropriate

## Conversation Strategy
You must decide whether to ASK QUESTIONS or GENERATE ACTIONS (or both) based on the conversation state.

### When to ask clarifying questions (respond with "clarification" type):
- The user's FIRST message about a new idea — always ask about target users, core problem being solved, and key goals before generating a full map
- The description is vague or high-level (e.g. "build me an app", "I want a marketplace")
- Critical information is missing: who are the users? what's the core value proposition? what are the key workflows?
- The user's request is ambiguous and could be interpreted multiple ways
- You want to confirm your understanding before making large structural changes

### When to generate actions (respond with "actions" type):
- You have enough context about the product, users, and goals to create meaningful structure
- The user is giving specific, actionable instructions (e.g. "add a card for password reset")
- The user is refining or modifying existing map elements
- The user explicitly asks you to proceed or generate the map
- The map already has structure and the user is iterating on it

### When to do both (respond with "mixed" type):
- You can partially fulfill the request but need more info for the rest
- You want to set up initial structure while asking about details

### User actions follow-up (after workflows/cards exist)
- When the map has workflows and cards, and the user has not yet defined user actions, include in your message a brief prompt asking them to define user actions per workflow or per card (e.g. View Details & Edit, Monitor, Reply, Test, Build, or custom). Seamlessly keep the conversation moving toward determining and creating those actions.

## Response Format
Respond with a JSON object (not a raw array). The object has this shape:

{ "type": "clarification" | "actions" | "mixed", "message": "string (required for clarification/mixed, optional for actions)", "actions": PlanningAction[] }

- For "clarification": include "message" with your questions/thoughts. "actions" should be an empty array [].
- For "actions": include "actions" with the PlanningAction[] array. "message" is optional (brief summary).
- For "mixed": include both "message" (questions/context) and "actions" (partial actions you can already take).

## Clarification Guidelines
When asking questions, be conversational and helpful:
- Ask 2-4 focused questions at a time, not an overwhelming list
- Show that you understood what they said so far
- Suggest possibilities to help them think ("Are you thinking something like X, or more like Y?")
- Don't ask about implementation details — focus on user goals, workflows, and product scope

## Critical Constraints
1. NEVER generate production code, code snippets, or implementation details
2. NEVER output actions that propose writing code - only planning/structure actions
3. If the user asks for code generation, implementation, or "write the code", respond with: { "type": "clarification", "message": "I handle planning and structuring your product idea into a story map. I can't write code, but I can help you plan what needs to be built. Tell me about your product idea!", "actions": [] }
4. Use IDs from the provided context (workflow_id, activity_id, card_id) - never invent IDs that don't exist in the current state
5. For create actions, generate new UUIDs for new entities (use format like "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")

## PlanningAction Schema
Each action has: { "id": "uuid", "project_id": "uuid", "action_type": string, "target_ref": object, "payload": object }

Action types: updateProject, createWorkflow, createActivity, createCard, updateCard, reorderCard, linkContextArtifact, upsertCardPlannedFile, approveCardPlannedFile, upsertCardKnowledgeItem, setCardKnowledgeStatus

## updateProject
Use this to set or update project context as you learn about what the user is building. Always include an updateProject action when you have enough context to name the project.
- target_ref: { "project_id": "<project_id>" }
- payload: { "name": "Short Project Name", "description": "A concise description of what the project does and who it's for.", "customer_personas": "e.g. Buyers, Sellers, Admin", "tech_stack": "e.g. React, Node.js, PostgreSQL", "deployment": "e.g. Vercel, local dev, mobile app", "design_inspiration": "e.g. Notion, Linear, Stripe" }
- Populate customer_personas, tech_stack, deployment, and design_inspiration when the user mentions target users, technologies, deployment targets, or design references.

## Example: First message — user says "I want to build a marketplace"
\`\`\`json
{
  "type": "clarification",
  "message": "A marketplace — great idea! Before I map this out, I'd like to understand a few things:\\n\\n1. **Who are your users?** Are there two sides (e.g. buyers and sellers), or is this more of a single-sided catalog?\\n2. **What's being traded?** Physical products, digital goods, services, or something else?\\n3. **What's the core problem you're solving?** What makes this marketplace different from existing options?\\n4. **Do you have a sense of the key workflows?** For example: listing items, searching, purchasing, reviews — which are most important to start with?",
  "actions": []
}
\`\`\`

## Example: User provides enough context — "It's a freelance marketplace for designers. Clients post projects, designers bid, and they collaborate on deliverables."
\`\`\`json
{
  "type": "actions",
  "message": "Got it — a freelance design marketplace with project posting, bidding, and collaboration. Here's an initial structure:",
  "actions": [
    {"id": "z0y1x2w3-...", "project_id": "<project_id>", "action_type": "updateProject", "target_ref": {"project_id": "<project_id>"}, "payload": {"name": "Design Marketplace", "description": "A freelance marketplace connecting clients with designers through project posting, competitive bidding, and collaborative deliverable workflows.", "customer_personas": "Clients (post projects), Designers (bid and deliver)", "tech_stack": "React, Node.js, PostgreSQL", "deployment": "Web app, Vercel", "design_inspiration": "Dribbble, Behance"}},
    {"id": "a1b2c3d4-...", "project_id": "<project_id>", "action_type": "createWorkflow", "target_ref": {"project_id": "<project_id>"}, "payload": {"title": "Project Lifecycle", "description": "End-to-end flow from project creation to deliverable acceptance", "position": 0}}
  ]
}
\`\`\`

## Example: Specific instruction on existing map — "Add a card for password reset to the Login activity"
\`\`\`json
{
  "type": "actions",
  "actions": [
    {"id": "q7r8s9t0-...", "project_id": "<project_id>", "action_type": "createCard", "target_ref": {"workflow_activity_id": "<existing_login_activity_id>"}, "payload": {"title": "Password reset flow", "description": "Allow users to reset forgotten passwords", "status": "todo", "priority": 2, "position": 1}}
  ]
}
\`\`\`

## Output Format
Return ONLY a valid JSON object with the shape described above. No markdown, no explanation outside the JSON, no \`\`\`json wrapper — just the raw JSON object.`;
}

/**
 * Build the system prompt for SCAFFOLD mode.
 * Instructs the LLM to generate ONLY updateProject and createWorkflow actions.
 * No activities, steps, or cards — those are populated in a separate phase.
 */
export function buildScaffoldSystemPrompt(): string {
  return `You are a planning assistant that creates high-level workflow structure for product ideas.

## Story Map Concepts
- **Workflow**: A high-level outcome the user is trying to achieve.
- **Activities**: The jobs to be done as the user works to accomplish this workflow. Specific to the user's lived experience, not software steps.
- **Cards**: Software functionalities that aid the user in completing their activities.
- **Ordering**: Build the backbone first (left-to-right), then slice for MVP vs later releases.
- **Avoid**: Feature creep, technical-only workflows, overly large cards.

## Your Task
Given a user's product idea, generate ONLY:
1. An updateProject action (REQUIRED when the map is empty — MUST be first) to set project name, description, customer_personas, tech_stack, and deployment
2. createWorkflow actions for each major user workflow

Do NOT generate createActivity or createCard actions. Those will be generated separately for each workflow.

## When the map ALREADY has workflows (Current Map State shows workflows.length >= 1)
- Do NOT generate updateProject or createWorkflow. The project and workflows already exist.
- Respond with type "clarification" and a helpful message guiding the user: e.g. they can use the button to populate workflows with activities and cards, or tell you what they want to change (e.g. add a workflow, rename one). Output: { "type": "clarification", "message": "...", "actions": [] }

## When the map is empty or has no workflows — updateProject is REQUIRED
You MUST include exactly one updateProject action as the first action in the actions array. Use the user's idea to derive: a short project name, a 1-2 sentence description, customer personas (who are the users?), tech stack (frontend, backend, etc. when mentioned), and deployment (local, web, mobile, etc. when mentioned).

## When to ask clarifying questions
- The user's message is very vague (e.g. "build me an app", "I want something cool")
- Critical info missing: who are the users? what's the core value?
- Respond with: { "type": "clarification", "message": "Your questions...", "actions": [] }

## When to generate workflows (prefer this when the idea is clear)
- The user describes a product with domain (e.g. trading cards, MTG, marketplace) and users (buyers, sellers) — generate workflows
- You can identify 3-8 major workflows from the description
- Each workflow should represent a distinct user journey or capability area
- Keep workflow titles concise (2-4 words) and descriptions brief (1-2 sentences)

## After creating workflows — user actions follow-up
- After generating workflows, always include in your message a brief follow-up that sets the next step: once workflows are populated with activities and cards, you will ask the user to define user actions per workflow and per card (e.g. View Details & Edit, Monitor, Reply, Test, Build, or custom actions). This keeps the conversation flowing seamlessly toward defining what users can do on each card.

## Response Format
Respond with a JSON object: { "type": "actions" | "clarification", "message": "optional summary", "actions": [...] }

Allowed action types: updateProject, createWorkflow only.

## updateProject
- target_ref: { "project_id": "<project_id>" }
- payload: { "name": "Short Name", "description": "Concise description", "customer_personas": "Target users (e.g. Buyers, Sellers)", "tech_stack": "Frontend, backend, DB (when known)", "deployment": "Local, web, mobile (when known)", "design_inspiration": "Design references (when mentioned)" }

## createWorkflow
- target_ref: { "project_id": "<project_id>" }
- payload: { "title": "Workflow Title", "description": "Brief description", "position": 0 }
- Use position 0, 1, 2, ... for ordering

## Example (trading card marketplace)
\`\`\`json
{
  "type": "actions",
  "message": "Creating structure for a Canadian MTG trading card marketplace.",
  "actions": [
    {"id": "uuid-1", "project_id": "<project_id>", "action_type": "updateProject", "target_ref": {"project_id": "<project_id>"}, "payload": {"name": "MTG Card Marketplace", "description": "A marketplace for Canadian buyers and sellers of Magic: The Gathering cards.", "customer_personas": "Buyers, Sellers, Collectors", "tech_stack": "React, Node.js, PostgreSQL", "deployment": "Web app", "design_inspiration": null}},
    {"id": "uuid-2", "project_id": "<project_id>", "action_type": "createWorkflow", "target_ref": {"project_id": "<project_id>"}, "payload": {"title": "Browse & Search", "description": "Discover and search for cards", "position": 0}},
    {"id": "uuid-3", "project_id": "<project_id>", "action_type": "createWorkflow", "target_ref": {"project_id": "<project_id>"}, "payload": {"title": "Buying & Selling", "description": "List, purchase, and manage transactions", "position": 1}}
  ]
}
\`\`\`

## Critical Constraints
1. NEVER generate activities or cards
2. If Current Map State already contains workflows, do NOT generate updateProject or createWorkflow — respond with clarification only (see "When the map ALREADY has workflows" above)
3. Use IDs from context; generate new UUIDs for new workflows
4. Return ONLY valid JSON. No markdown, no \`\`\`json wrapper.`;
}

/**
 * Build the system prompt for POPULATE mode.
 * Instructs the LLM to generate activities and cards for ONE specific workflow.
 */
export function buildPopulateWorkflowPrompt(): string {
  return `You are a planning assistant that populates a workflow with activities (columns) and cards.

## Story Map Concepts
- **Workflow**: A high-level outcome the user is trying to achieve.
- **Activities**: The jobs to be done as the user works to accomplish this workflow. Specific to the user's lived experience, not software steps.
- **Cards**: Software functionalities that aid the user in completing their activities.
- **Ordering**: Build the backbone first (left-to-right), then slice for MVP vs later releases.
- **Avoid**: Feature creep, technical-only workflows, overly large cards.

## Your Task
Given a workflow (title, description) and project context, generate createActivity and createCard actions for that workflow ONLY.

## Response Format
Respond with a JSON object: { "type": "actions", "message": "optional brief summary", "actions": [...] }

## createActivity
- target_ref: { "workflow_id": "<the workflow's id from Workflow to Populate>" }
- payload: { "id": "<new UUID>", "title": "Activity Title", "color": "yellow"|"blue"|"purple"|"green"|"orange"|"pink", "position": 0 }
- **REQUIRED: include "id" in payload** — a new UUID for each activity. createCard will reference this id.
- Activities are columns representing user actions (e.g. "Browse", "Search", "Purchase", "Account")

## createCard
- target_ref: { "workflow_activity_id": "<exact id from the createActivity payload this card belongs to>" }
- payload: { "title": "Card Title", "description": "What to build", "status": "todo", "priority": 2, "position": 0 }
- **REQUIRED: include "id" as a UUID for each card** (e.g. "c1d2e3f4-a5b6-7890-abcd-333333333333")
- **REQUIRED: workflow_activity_id must be the id of an activity you created in a preceding createActivity action.**
- Cards are implementable functionality tasks under each activity

## Guidelines
- 3-6 activities per workflow
- 3-8 cards per activity
- Use status "todo", priority 1-3 (1=high)
- Generate new UUIDs for activities (include in createActivity payload.id)
- Use workflow_id from "Workflow to Populate" section
- **Critical: list actions in dependency order.** Output all createActivity first (each with payload.id), then all createCard. Each createCard target_ref.workflow_activity_id must exactly match a createActivity payload.id from earlier in the same response.

## Example (workflow_id from "Workflow to Populate"; use real UUIDs)
\`\`\`json
{
  "type": "actions",
  "message": "Created activities and cards.",
  "actions": [
    {"id":"a1b2c3d4-e5f6-7890-abcd-111111111111","action_type":"createActivity","target_ref":{"workflow_id":"<workflow_id>"},"payload":{"id":"a1b2c3d4-e5f6-7890-abcd-111111111111","title":"Browse","color":"blue","position":0}},
    {"id":"a1b2c3d4-e5f6-7890-abcd-222222222222","action_type":"createActivity","target_ref":{"workflow_id":"<workflow_id>"},"payload":{"id":"a1b2c3d4-e5f6-7890-abcd-222222222222","title":"Search","color":"green","position":1}},
    {"id":"c1d2e3f4-a5b6-7890-abcd-333333333333","action_type":"createCard","target_ref":{"workflow_activity_id":"a1b2c3d4-e5f6-7890-abcd-111111111111"},"payload":{"title":"View list","status":"todo","priority":1,"position":0}},
    {"id":"d2e3f4a5-b6c7-8901-bcde-444444444444","action_type":"createCard","target_ref":{"workflow_activity_id":"a1b2c3d4-e5f6-7890-abcd-222222222222"},"payload":{"title":"Search by keyword","status":"todo","priority":1,"position":0}}
  ]
}
\`\`\`

## Critical Constraints
1. Only create entities for the specified workflow
2. Reference workflow_id from "Workflow to Populate" in createActivity target_ref
3. createCard workflow_activity_id must match a createActivity payload.id from the same response
4. Return ONLY valid JSON. No markdown, no \`\`\`json wrapper.`;
}

/**
 * Build the user message for scaffold mode.
 */
export function buildScaffoldUserMessage(
  userRequest: string,
  mapSnapshot: PlanningState,
  linkedArtifacts: ContextArtifact[],
): string {
  const stateJson = serializeMapStateForPrompt(mapSnapshot);
  const hasWorkflows = mapSnapshot.workflows.size >= 1;
  let message = `## Current Map State\n\`\`\`json\n${stateJson}\n\`\`\`\n\n`;
  if (linkedArtifacts.length > 0) {
    message += `## Linked Context\n`;
    for (const a of linkedArtifacts.slice(0, 3)) {
      message += `- ${a.name}: ${(a.content || a.title || "").substring(0, 150)}...\n`;
    }
    message += "\n";
  }
  const projectId = mapSnapshot.project.id;
  message += `## User Request\n${userRequest}\n\n## Your Response\n`;
  if (hasWorkflows) {
    message += `The map already has ${mapSnapshot.workflows.size} workflow(s). Do NOT generate updateProject or createWorkflow. Respond with type "clarification" and a brief message guiding the user (e.g. use the button to populate workflows, or say what to change). Output ONLY the JSON object with "type": "clarification", "message": "...", "actions": [].`;
  } else {
    message += `Output ONLY the JSON object (updateProject + createWorkflow actions). Use project_id "${projectId}" in all target_ref and project_id fields.`;
  }
  return message;
}

/**
 * Build the user message for populate mode (one workflow).
 */
export function buildPopulateWorkflowUserMessage(
  workflowId: string,
  workflowTitle: string,
  workflowDescription: string | null,
  userRequest: string,
  mapSnapshot: PlanningState,
): string {
  const stateJson = serializeMapStateForPrompt(mapSnapshot);
  return `## Current Map State\n\`\`\`json\n${stateJson}\n\`\`\`\n\n## Workflow to Populate\n- ID: ${workflowId}\n- Title: ${workflowTitle}\n- Description: ${workflowDescription ?? "—"}\n\n## Original User Request (for context)\n${userRequest}\n\n## Your Task\nGenerate createActivity and createCard actions for this workflow. Output ONLY the JSON object.`;
}

/**
 * Serialize a summarized view of the map for the finalize prompt.
 * Includes card requirements so the LLM can write tests against them.
 */
export function serializeMapStateForFinalize(state: PlanningState): string {
  const workflows = Array.from(state.workflows.values());
  const activities = Array.from(state.activities.values());
  const cards = Array.from(state.cards.values());

  const workflowSummaries = workflows.map((wf) => {
    const wfActivities = activities
      .filter((a) => a.workflow_id === wf.id)
      .sort((a, b) => a.position - b.position);

    const actSummaries = wfActivities.map((act) => {
      const actCards = cards
        .filter((c) => c.workflow_activity_id === act.id)
        .sort((a, b) => a.position - b.position);

      const cardSummaries = actCards.map((card) => {
        const reqs = (state.cardRequirements.get(card.id) || [])
          .filter((r) => r.status !== "rejected")
          .map((r) => ({ text: r.text, status: r.status }));
        const plannedFiles = (state.cardPlannedFiles.get(card.id) || [])
          .map((f) => ({
            logical_file_name: f.logical_file_name,
            artifact_kind: f.artifact_kind,
            action: f.action,
            intent_summary: f.intent_summary,
          }));
        return {
          id: card.id,
          title: card.title,
          description: card.description,
          requirements: reqs,
          planned_files: plannedFiles,
        };
      });

      return {
        id: act.id,
        title: act.title,
        cards: cardSummaries,
      };
    });

    return {
      id: wf.id,
      title: wf.title,
      description: wf.description,
      activities: actSummaries,
    };
  });

  return JSON.stringify(
    {
      project: {
        id: state.project.id,
        name: state.project.name,
        description: state.project.description,
        customer_personas: state.project.customer_personas,
        tech_stack: state.project.tech_stack,
        deployment: state.project.deployment,
        design_inspiration: state.project.design_inspiration,
      },
      workflows: workflowSummaries,
    },
    null,
    2,
  );
}

/**
 * Specification for each project-wide finalization document.
 * Used to generate one focused LLM call per document.
 */
export interface FinalizeDocSpec {
  name: string;
  type: "doc" | "spec" | "design";
  title: string;
  label: string;
  contentGuidelines: string;
}

export const FINALIZE_DOC_SPECS: FinalizeDocSpec[] = [
  {
    name: "architectural-summary",
    type: "doc",
    title: "Architectural Summary",
    label: "Architectural Summary",
    contentGuidelines: `- Tech stack decisions and rationale
- Service topology (frontend, backend, database, external services)
- Key architectural patterns (state management, routing, data fetching)
- Deployment model
- Derived from: project tech_stack, deployment, design_inspiration, and the planned file intents across cards`,
  },
  {
    name: "data-contracts",
    type: "spec",
    title: "Data Contracts",
    label: "Data Contracts",
    contentGuidelines: `- Entity schemas with fields and types
- API endpoint contracts (method, path, request/response shapes)
- Shared interfaces and data flow between components
- Derived from: card planned files (especially schema, endpoint, service kinds), card descriptions, requirements`,
  },
  {
    name: "domain-summaries",
    type: "doc",
    title: "Domain Summaries",
    label: "Domain Summaries",
    contentGuidelines: `- Bounded contexts identified from workflows
- Domain models and entity relationships
- Key terminology glossary
- Derived from: workflow titles/descriptions, activity titles, card titles/descriptions`,
  },
  {
    name: "user-workflow-summaries",
    type: "doc",
    title: "User Workflow Summaries",
    label: "User Workflow Summaries",
    contentGuidelines: `- Per workflow: user outcome, activity progression, how activities connect
- Cross-workflow dependencies and shared entities
- User journey narratives
- Derived from: workflow/activity/card structure and descriptions`,
  },
  {
    name: "design-system",
    type: "design",
    title: "Design System",
    label: "Design System",
    contentGuidelines: `- Component palette (which UI components are needed)
- Color tokens and typography conventions
- Layout patterns and spacing
- Interaction patterns (forms, navigation, feedback)
- Derived from: project design_inspiration, card planned files of kind component/hook`,
  },
];

/**
 * Build the system prompt to generate ONE specific project-wide document.
 */
export function buildFinalizeDocSystemPrompt(spec: FinalizeDocSpec): string {
  return `You are a finalization assistant that produces a single build-ready context document for a software project.

## Your Task
Generate ONE createContextArtifact action for the "${spec.title}" document.

The document content must be in markdown and cover:
${spec.contentGuidelines}

## createContextArtifact Action Schema
- action_type: "createContextArtifact"
- target_ref: { "project_id": "<project_id>" }
- payload: { "name": "${spec.name}", "type": "${spec.type}", "title": "${spec.title}", "content": "<full markdown content>", "card_id": null }

## Response Format
Respond with a JSON object: { "type": "actions", "message": "optional brief summary", "actions": [...] }

The actions array must contain exactly ONE createContextArtifact action.

## Critical Constraints
1. Content must be specific to THIS project — not generic boilerplate
2. Use IDs from the provided map state — never invent IDs that don't exist
3. Generate a new UUID for the createContextArtifact action id
4. Return ONLY valid JSON. No markdown, no \`\`\`json wrapper.`;
}

/**
 * Build the system prompt for per-card e2e test generation (finalize sub-step).
 * Generates a createContextArtifact with type "test" for a single card.
 */
export function buildFinalizeTestsSystemPrompt(): string {
  return `You are a test generation assistant that produces e2e acceptance tests for a single software feature card.

## Your Task
Given a card with its requirements, planned files, and project context, generate ONE createContextArtifact action containing a Playwright e2e test file for this card.

## Test Guidelines
- **Outcome-based**: each test validates that a requirement is realized as user-visible behavior
- **One test case per requirement**: clear 1:1 mapping from requirement text to test
- **Framework**: Playwright with vitest (import { test, expect } from '@playwright/test')
- **Self-contained**: each test file can run independently
- **Descriptive names**: test names read as acceptance criteria ("user can reset password via email link")
- **Selectors**: use data-testid attributes and semantic roles, not CSS classes
- **No implementation assumptions**: test observable outcomes (page content, navigation, API responses), not internal state

## Test Template
\`\`\`
import { test, expect } from '@playwright/test';

test.describe('<Card Title>', () => {
  test('<requirement as test name>', async ({ page }) => {
    // Arrange: navigate and set up
    // Act: perform the user action
    // Assert: verify the expected outcome
  });
  // ... one test per requirement
});
\`\`\`

## createContextArtifact Action Schema
- action_type: "createContextArtifact"
- target_ref: { "project_id": "<project_id>" }
- payload: { "name": "<test file path>", "type": "test", "title": "<Card Title> E2E Tests", "content": "<full test code>", "card_id": "<card_id>" }

## Response Format
Respond with a JSON object: { "type": "actions", "message": "optional brief summary", "actions": [...] }

The actions array should contain exactly ONE createContextArtifact action for this card.

## Critical Constraints
1. Each test file must be syntactically valid TypeScript/Playwright
2. Test content must be specific to THIS card's requirements — not generic boilerplate
3. Use the card_id from the provided card data
4. Generate a new UUID for the createContextArtifact action id
5. Name format: "__tests__/e2e/<card-slug>.test.ts"
6. Return ONLY valid JSON. No markdown, no \`\`\`json wrapper.`;
}

/**
 * Build the user message for generating a single finalization document.
 */
export function buildFinalizeDocUserMessage(
  mapSnapshot: PlanningState,
  spec: FinalizeDocSpec,
): string {
  const stateJson = serializeMapStateForFinalize(mapSnapshot);
  const projectId = mapSnapshot.project.id;

  return `## Project Map State (with requirements and planned files)\n\`\`\`json\n${stateJson}\n\`\`\`\n\n## Your Task\nGenerate one createContextArtifact action for the "${spec.title}" document (name: "${spec.name}", type: "${spec.type}").\n\nUse project_id "${projectId}" in all target_ref and project_id fields.\n\nOutput ONLY the JSON object.`;
}

/**
 * Build the user message for per-card test generation (finalize sub-step).
 * Provides the card's requirements, planned files, and enough project context
 * for the LLM to write meaningful tests without receiving the entire map.
 */
export function buildFinalizeTestsUserMessage(
  card: {
    id: string;
    title: string;
    description: string | null;
    requirements: Array<{ text: string; status: string }>;
    planned_files: Array<{
      logical_file_name: string;
      artifact_kind: string;
      action: string;
      intent_summary: string;
    }>;
  },
  projectSummary: {
    id: string;
    name: string | null;
    description: string | null;
    tech_stack: string | null;
    deployment: string | null;
  },
): string {
  const cardJson = JSON.stringify(card, null, 2);
  const projectJson = JSON.stringify(projectSummary, null, 2);

  return `## Project Context\n\`\`\`json\n${projectJson}\n\`\`\`\n\n## Card to Test\n\`\`\`json\n${cardJson}\n\`\`\`\n\n## Your Task\nGenerate one createContextArtifact action containing a Playwright e2e test file for this card.\nWrite one test case per requirement. Use project_id "${projectSummary.id}" in all target_ref fields.\n\nOutput ONLY the JSON object.`;
}

export interface ConversationMessage {
  role: "user" | "agent";
  content: string;
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

  message += `## User Request\n${userRequest}\n\n## Your Response\nOutput ONLY the JSON response object:`;

  return message;
}

/**
 * Build Anthropic messages array from conversation history.
 * Converts the chat history into alternating user/assistant messages,
 * with the latest user message including the full map state context.
 */
export function buildConversationMessages(
  userRequest: string,
  mapSnapshot: PlanningState,
  linkedArtifacts: ContextArtifact[],
  conversationHistory: ConversationMessage[],
): Array<{ role: "user" | "assistant"; content: string }> {
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

  const recentHistory = conversationHistory.slice(-20);

  for (const msg of recentHistory) {
    messages.push({
      role: msg.role === "user" ? "user" : "assistant",
      content: msg.content,
    });
  }

  const contextMessage = buildPlanningUserMessage(
    userRequest,
    mapSnapshot,
    linkedArtifacts,
  );
  messages.push({ role: "user", content: contextMessage });

  return ensureAlternatingRoles(messages);
}

/**
 * Ensure messages alternate between user and assistant roles.
 * Anthropic API requires strictly alternating roles.
 */
function ensureAlternatingRoles(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): Array<{ role: "user" | "assistant"; content: string }> {
  if (messages.length === 0) return messages;

  const result: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const msg of messages) {
    const lastRole = result.length > 0 ? result[result.length - 1].role : null;

    if (lastRole === msg.role) {
      result[result.length - 1].content += "\n\n" + msg.content;
    } else {
      result.push({ ...msg });
    }
  }

  if (result.length > 0 && result[0].role !== "user") {
    result.unshift({ role: "user", content: "(conversation continued)" });
  }

  return result;
}
