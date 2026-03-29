/**
 * Seeds a rich map + an empty "ideation" project for website screenshots.
 * Run with dev server up: node scripts/seed-marketing-demo.mjs
 *
 * Prints JSON: demoProjectId, ideationProjectId, heroCardId, urls
 */
const BASE = process.env.MARKETING_SEED_BASE_URL ?? 'http://127.0.0.1:3000';

const uuid = () => crypto.randomUUID();

async function createProject(name, description) {
  const res = await fetch(`${BASE}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description }),
  });
  if (!res.ok) throw new Error(`createProject: ${res.status} ${await res.text()}`);
  return res.json();
}

async function postActions(projectId, actions) {
  const res = await fetch(`${BASE}/api/projects/${projectId}/actions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actions }),
  });
  if (!res.ok) throw new Error(`actions: ${res.status} ${await res.text()}`);
}

async function createRequirement(projectId, cardId, text) {
  const res = await fetch(`${BASE}/api/projects/${projectId}/cards/${cardId}/requirements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, source: 'user' }),
  });
  if (!res.ok) throw new Error(`requirement: ${res.status}`);
}

async function createPlannedFile(projectId, cardId, logicalName, approve) {
  const createRes = await fetch(`${BASE}/api/projects/${projectId}/cards/${cardId}/planned-files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      logical_file_name: logicalName,
      artifact_kind: 'component',
      action: 'create',
      intent_summary: `Ship ${logicalName}`,
    }),
  });
  if (!createRes.ok) throw new Error(`planned file: ${createRes.status}`);
  const file = await createRes.json();
  if (approve) {
    const patchRes = await fetch(
      `${BASE}/api/projects/${projectId}/cards/${cardId}/planned-files/${file.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      }
    );
    if (!patchRes.ok) throw new Error(`approve file: ${patchRes.status}`);
  }
  return file.id;
}

async function main() {
  const wf1 = uuid();
  const wf2 = uuid();
  const a1 = uuid();
  const a2 = uuid();
  const a3 = uuid();
  const a4 = uuid();
  const heroCardId = uuid();
  const card2 = uuid();
  const card3 = uuid();
  const card4 = uuid();
  const card5 = uuid();

  const ideation = await createProject(
    'New idea (empty map)',
    'Describe what you want to build — Dossier structures it into workflows, activities, and cards.'
  );

  const demo = await createProject(
    'Northwind — Customer portal',
    'B2B ordering, account management, and support integrations. Marketing demo data for screenshots.'
  );

  await postActions(demo.id, [
    {
      id: uuid(),
      project_id: demo.id,
      action_type: 'createWorkflow',
      target_ref: { project_id: demo.id },
      payload: { id: wf1, title: 'Discovery & ordering', position: 0 },
    },
    {
      id: uuid(),
      project_id: demo.id,
      action_type: 'createActivity',
      target_ref: { workflow_id: wf1 },
      payload: { id: a1, title: 'Browse catalog', color: 'blue', position: 0 },
    },
    {
      id: uuid(),
      project_id: demo.id,
      action_type: 'createCard',
      target_ref: { workflow_activity_id: a1 },
      payload: {
        id: heroCardId,
        title: 'SKU search & filters',
        description: 'Fast search with category, price band, and availability filters.',
        status: 'active',
        priority: 1,
        position: 0,
      },
    },
    {
      id: uuid(),
      project_id: demo.id,
      action_type: 'createCard',
      target_ref: { workflow_activity_id: a1 },
      payload: {
        id: card2,
        title: 'Product detail',
        description: 'Specs, stock, contract pricing, and related items.',
        status: 'todo',
        priority: 2,
        position: 1,
      },
    },
    {
      id: uuid(),
      project_id: demo.id,
      action_type: 'createActivity',
      target_ref: { workflow_id: wf1 },
      payload: { id: a2, title: 'Cart & checkout', color: 'purple', position: 1 },
    },
    {
      id: uuid(),
      project_id: demo.id,
      action_type: 'createCard',
      target_ref: { workflow_activity_id: a2 },
      payload: {
        id: card3,
        title: 'Quote-to-order',
        description: 'Convert approved quotes into orders with approval rules.',
        status: 'questions',
        priority: 1,
        position: 0,
      },
    },
    {
      id: uuid(),
      project_id: demo.id,
      action_type: 'createWorkflow',
      target_ref: { project_id: demo.id },
      payload: { id: wf2, title: 'Account & support', position: 1 },
    },
    {
      id: uuid(),
      project_id: demo.id,
      action_type: 'createActivity',
      target_ref: { workflow_id: wf2 },
      payload: { id: a3, title: 'Self-service', color: 'green', position: 0 },
    },
    {
      id: uuid(),
      project_id: demo.id,
      action_type: 'createCard',
      target_ref: { workflow_activity_id: a3 },
      payload: {
        id: card4,
        title: 'Order history & invoices',
        description: 'PDF invoices, payment status, and reorder shortcuts.',
        status: 'review',
        priority: 1,
        position: 0,
      },
    },
    {
      id: uuid(),
      project_id: demo.id,
      action_type: 'createActivity',
      target_ref: { workflow_id: wf2 },
      payload: { id: a4, title: 'Integrations', color: 'orange', position: 1 },
    },
    {
      id: uuid(),
      project_id: demo.id,
      action_type: 'createCard',
      target_ref: { workflow_activity_id: a4 },
      payload: {
        id: card5,
        title: 'ERP webhook sync',
        description: 'Reliable delivery of order events to the ERP with retries.',
        status: 'production',
        priority: 1,
        position: 0,
      },
    },
  ]);

  await createRequirement(demo.id, heroCardId, 'Search returns results in under 200ms p95 for 50k SKUs.');
  await createRequirement(demo.id, heroCardId, 'Filters persist in the URL for shareable catalog views.');
  await createPlannedFile(demo.id, heroCardId, 'components/catalog/SkuSearch.tsx', true);
  await createPlannedFile(demo.id, heroCardId, 'lib/catalog/query.ts', false);

  const out = {
    demoProjectId: demo.id,
    ideationProjectId: ideation.id,
    heroCardId,
    urls: {
      hero: `${BASE}/?project=${demo.id}`,
      ideation: `${BASE}/?project=${ideation.id}`,
      setup: `${BASE}/setup`,
      cardDetail: `${BASE}/?project=${demo.id}`,
    },
  };
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
