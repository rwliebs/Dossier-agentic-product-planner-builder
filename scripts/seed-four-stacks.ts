/**
 * One-off: create 4 projects with different tech_stack and repo_url, seed workflow each.
 * Run: npx tsx scripts/seed-four-stacks.ts
 * Output: JSON with projectIds and tech_stacks for browser test.
 */

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const REPO_URL = "https://github.com/rwliebs/test";

const STACKS = [
  { name: "Next.js stack", tech_stack: "Next.js, TypeScript, Tailwind CSS" },
  { name: "Vite React stack", tech_stack: "Vite, React, TypeScript" },
  { name: "Python FastAPI stack", tech_stack: "Python, FastAPI, Pydantic" },
  { name: "Node Express stack", tech_stack: "Node.js, Express, TypeScript" },
];

function uuid(): string {
  return crypto.randomUUID();
}

async function createProject(name: string): Promise<{ id: string; name: string }> {
  const res = await fetch(`${BASE_URL}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description: null }),
  });
  if (!res.ok) throw new Error(`createProject failed: ${res.status}`);
  return res.json();
}

async function updateProject(
  projectId: string,
  updates: { tech_stack: string; repo_url: string }
): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/projects/${projectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`updateProject failed: ${res.status}`);
}

async function seedWorkflow(projectId: string): Promise<void> {
  const workflowId = uuid();
  const activityId = uuid();
  const cardId = uuid();
  const res = await fetch(`${BASE_URL}/api/projects/${projectId}/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      actions: [
        {
          id: uuid(),
          project_id: projectId,
          action_type: "createWorkflow",
          target_ref: { project_id: projectId },
          payload: { id: workflowId, title: "Core", position: 0 },
        },
        {
          id: uuid(),
          project_id: projectId,
          action_type: "createActivity",
          target_ref: { workflow_id: workflowId },
          payload: { id: activityId, title: "Features", color: "blue", position: 0 },
        },
        {
          id: uuid(),
          project_id: projectId,
          action_type: "createCard",
          target_ref: { workflow_activity_id: activityId },
          payload: {
            id: cardId,
            title: "Main feature",
            description: "Primary feature",
            status: "todo",
            priority: 1,
            position: 0,
          },
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`seedWorkflow failed: ${res.status} ${JSON.stringify(body)}`);
  }
}

async function main(): Promise<void> {
  const results: { projectId: string; name: string; tech_stack: string }[] = [];
  for (const stack of STACKS) {
    const project = await createProject(stack.name);
    await updateProject(project.id, {
      tech_stack: stack.tech_stack,
      repo_url: REPO_URL,
    });
    await seedWorkflow(project.id);
    results.push({ projectId: project.id, name: stack.name, tech_stack: stack.tech_stack });
    console.error(`Created project ${project.id}: ${stack.name}`);
  }
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
