#!/usr/bin/env node
/**
 * Test script for Populate button flow.
 * Calls the populate API directly and reports results.
 * Run with: node scripts/test-populate-button.mjs
 * Requires: dev server on localhost:3000, ANTHROPIC_API_KEY
 */

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
const PROJECT_ID = 'd47670b9-5e07-452b-9650-f08bfa056ef8'; // MapleTCG
const WORKFLOW_ID = '22cb49ef-34aa-4cb3-ab3e-81063a2cba0d'; // User Management

async function main() {
  console.log('Testing Populate flow...');
  console.log('  Project:', PROJECT_ID);
  console.log('  Workflow: User Management', WORKFLOW_ID);
  console.log('');

  const message = 'Add activities and cards for User Management. Project: A Canadian marketplace connecting Magic: The Gathering card buyers and sellers with streamlined listing, search, and transaction capabilities.';

  const res = await fetch(`${BASE}/api/projects/${PROJECT_ID}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      mode: 'populate',
      workflow_id: WORKFLOW_ID,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('API error:', res.status, err);
    process.exit(1);
  }

  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let actionCount = 0;
  let streamError = null;
  const events = [];

  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\n\n+/);
      buffer = blocks.pop() ?? '';
      for (const block of blocks) {
        let eventType = '';
        let dataStr = '';
        for (const line of block.split('\n')) {
          if (line.startsWith('event: ')) eventType = line.slice(7).trim();
          if (line.startsWith('data: ')) dataStr = line.slice(6);
        }
        if (eventType && dataStr) {
          try {
            const data = JSON.parse(dataStr);
            events.push({ event: eventType, data });
            if (eventType === 'error') streamError = data.reason ?? 'Unknown error';
            if (eventType === 'action') actionCount++;
            if (eventType === 'message') console.log('  LLM message:', data.message);
            if (eventType === 'phase_complete') console.log('  phase_complete:', JSON.stringify(data));
          } catch { /* ignore parse */ }
        }
      }
    }
  }

  console.log('Stream complete.');
  console.log('  Action events:', actionCount);
  if (streamError) console.log('  Error:', streamError);
  console.log('  Event types:', [...new Set(events.map((e) => e.event))].join(', '));

  if (streamError) {
    console.error('\nPopulate failed:', streamError);
    process.exit(1);
  }
  if (actionCount === 0) {
    console.warn('\nNo actions were generated. LLM may have returned clarification or invalid JSON.');
    console.warn('Run with PLANNING_DEBUG=1 to see raw LLM output.');
    process.exit(1);
  }

  console.log('\nSuccess: Populate generated', actionCount, 'action(s).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
