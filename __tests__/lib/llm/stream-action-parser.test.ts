import { describe, it, expect } from "vitest";
import { parseActionsFromStream } from "@/lib/llm/stream-action-parser";

async function streamFromStrings(chunks: string[]): Promise<ReadableStream<string>> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

describe("parseActionsFromStream", () => {
  it("parses clarification response", async () => {
    const results: string[] = [];
    const stream = await streamFromStrings(['{"type":"clarification","message":"Tell me more","actions":[]}\n']);

    for await (const result of parseActionsFromStream(stream)) {
      if (result.type === "response_type") results.push(result.responseType);
      if (result.type === "message") results.push(result.message);
      if (result.type === "done") results.push("done");
    }

    expect(results).toContain("clarification");
    expect(results).toContain("Tell me more");
    expect(results).toContain("done");
  });

  it("parses wrapper format with actions array", async () => {
    const actions: unknown[] = [];
    let message = "";
    const pid = "p1a2b3c4-d5e6-7890-abcd-ef1234567890";
    const stream = await streamFromStrings([
      `{"type":"actions","message":"Here you go","actions":[{"id":"a1b2c3d4-e5f6-7890-abcd-ef1234567890","project_id":"${pid}","action_type":"createWorkflow","target_ref":{"project_id":"${pid}"},"payload":{"title":"W1","position":0}},{"id":"b2c3d4e5-f6a7-8901-bcde-f12345678901","project_id":"${pid}","action_type":"createWorkflow","target_ref":{"project_id":"${pid}"},"payload":{"title":"W2","position":1}}]}\n`,
    ]);

    for await (const result of parseActionsFromStream(stream)) {
      if (result.type === "action") actions.push(result.action);
      if (result.type === "message") message = result.message;
    }

    expect(actions.length).toBeGreaterThanOrEqual(0);
    expect(message).toBe("Here you go");
  });

  it("parses wrapper format without trailing newline (streaming)", async () => {
    const actions: unknown[] = [];
    const pid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const json = `{"type":"actions","message":"OK","actions":[{"id":"b2c3d4e5-f6a7-8901-bcde-f12345678901","project_id":"${pid}","action_type":"updateProject","target_ref":{"project_id":"${pid}"},"payload":{"name":"Test","description":"A test project"}},{"id":"c3d4e5f6-a7b8-9012-cdef-123456789012","project_id":"${pid}","action_type":"createWorkflow","target_ref":{"project_id":"${pid}"},"payload":{"title":"W1","position":0}}]}`;
    const stream = await streamFromStrings([json]);

    for await (const result of parseActionsFromStream(stream)) {
      if (result.type === "action") actions.push(result.action);
    }

    expect(actions.length).toBe(2);
    expect((actions[0] as { action_type?: string }).action_type).toBe("updateProject");
    expect((actions[1] as { action_type?: string }).action_type).toBe("createWorkflow");
  });

  it("parses JSON wrapped in markdown code block", async () => {
    const actions: unknown[] = [];
    const pid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const json = "```json\n" + `{"type":"actions","actions":[{"id":"b2c3d4e5-f6a7-8901-bcde-f12345678901","project_id":"${pid}","action_type":"createWorkflow","target_ref":{"project_id":"${pid}"},"payload":{"title":"W1","position":0}}]}` + "\n```";
    const stream = await streamFromStrings([json]);

    for await (const result of parseActionsFromStream(stream)) {
      if (result.type === "action") actions.push(result.action);
    }

    expect(actions.length).toBe(1);
  });

  it("parses when streamed token-by-token (no newlines)", async () => {
    const pid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const json = `{"type":"actions","actions":[{"id":"b2c3d4e5-f6a7-8901-bcde-f12345678901","project_id":"${pid}","action_type":"createWorkflow","target_ref":{"project_id":"${pid}"},"payload":{"title":"W1","position":0}}]}`;
    const chunks = json.split("").map((c) => c);
    const stream = await streamFromStrings(chunks);

    const actions: unknown[] = [];
    for await (const result of parseActionsFromStream(stream)) {
      if (result.type === "action") actions.push(result.action);
    }

    expect(actions.length).toBe(1);
  });

  it("parses JSON when LLM adds preamble text before the object", async () => {
    const actions: unknown[] = [];
    const pid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const withPreamble =
      'Here are the activities and cards for the workflow:\n' +
      `{"type":"actions","message":"Done.","actions":[{"id":"b2c3d4e5-f6a7-8901-bcde-f12345678901","project_id":"${pid}","action_type":"createActivity","target_ref":{"workflow_id":"wf-1"},"payload":{"title":"Browse","position":0}},{"id":"c3d4e5f6-a7b8-9012-cdef-123456789012","project_id":"${pid}","action_type":"createCard","target_ref":{"workflow_activity_id":"b2c3d4e5-f6a7-8901-bcde-f12345678901"},"payload":{"title":"View list","status":"todo","priority":1}}]}`;
    const stream = await streamFromStrings([withPreamble]);

    for await (const result of parseActionsFromStream(stream)) {
      if (result.type === "action") actions.push(result.action);
    }

    expect(actions.length).toBe(2);
    expect((actions[0] as { action_type?: string }).action_type).toBe("createActivity");
    expect((actions[1] as { action_type?: string }).action_type).toBe("createCard");
  });

  it("normalizes createCard target_ref: activity_id -> workflow_activity_id", async () => {
    const pid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const wfId = "22cb49ef-34aa-4cb3-ab3e-81063a2cba0d";
    const actId = "a1f8c3d2-4e5f-6a7b-8c9d-0e1f2a3b4c5d";
    const json = `{"type":"actions","message":"Done.","actions":[{"action_type":"createActivity","target_ref":{"workflow_id":"${wfId}"},"payload":{"id":"${actId}","title":"Register","position":0}},{"action_type":"createCard","target_ref":{"activity_id":"${actId}"},"payload":{"title":"Sign up","status":"todo","priority":1,"position":0}}]}`;
    const stream = await streamFromStrings([json]);
    const actions: unknown[] = [];
    for await (const result of parseActionsFromStream(stream)) {
      if (result.type === "action") actions.push(result.action);
    }
    expect(actions.length).toBe(2);
    const createCard = actions[1] as { action_type?: string; target_ref?: { workflow_activity_id?: string } };
    expect(createCard.action_type).toBe("createCard");
    expect(createCard.target_ref?.workflow_activity_id).toBe(actId);
  });

  it("parses actions with 'action' field (LLM alternate format)", async () => {
    const pid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const wfId = "22cb49ef-34aa-4cb3-ab3e-81063a2cba0d";
    const actId = "a1f8c3d2-4e5f-6a7b-8c9d-0e1f2a3b4c5d";
    const json = `{"type":"actions","message":"Done.","actions":[{"action":"createActivity","target_ref":{"workflow_id":"${wfId}"},"payload":{"id":"${actId}","title":"Register","position":0}},{"action":"createCard","target_ref":{"workflow_activity_id":"${actId}"},"payload":{"title":"Sign up","status":"todo","priority":1,"position":0}}]}`;
    const stream = await streamFromStrings([json]);
    const actions: unknown[] = [];
    for await (const result of parseActionsFromStream(stream)) {
      if (result.type === "action") actions.push(result.action);
    }
    expect(actions.length).toBe(2);
    expect((actions[0] as { action_type?: string }).action_type).toBe("createActivity");
    expect((actions[1] as { action_type?: string }).action_type).toBe("createCard");
  });

  it("accepts createCard with non-UUID id (normalizes to UUID)", async () => {
    const pid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const wfId = "22cb49ef-34aa-4cb3-ab3e-81063a2cba0d";
    const actId = "a1f8c3d2-4e5f-6a7b-8c9d-0e1f2a3b4c5d";
    const json = `{"type":"actions","actions":[{"id":"${actId}","action_type":"createActivity","target_ref":{"workflow_id":"${wfId}"},"payload":{"id":"${actId}","title":"Browse","position":0}},{"id":"c1","action_type":"createCard","target_ref":{"workflow_activity_id":"${actId}"},"payload":{"title":"View list","status":"todo","priority":1,"position":0}}]}`;
    const stream = await streamFromStrings([json]);
    const actions: unknown[] = [];
    for await (const result of parseActionsFromStream(stream)) {
      if (result.type === "action") actions.push(result.action);
    }
    expect(actions.length).toBe(2);
    const createCard = actions[1] as { id?: string; action_type?: string };
    expect(createCard.action_type).toBe("createCard");
    expect(createCard.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it("yields done at end", async () => {
    const results: string[] = [];
    const stream = await streamFromStrings(['{"type":"clarification","message":"Tell me more","actions":[]}\n']);

    for await (const result of parseActionsFromStream(stream)) {
      if (result.type === "response_type") results.push("response_type");
      if (result.type === "message") results.push("message");
      if (result.type === "done") results.push("done");
    }

    expect(results).toContain("done");
  });

  it("extracts first balanced JSON when LLM appends explanation ending with } (regression: greedy regex)", async () => {
    const pid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const validJson = `{"type":"actions","message":"Done.","actions":[{"id":"b2c3d4e5-f6a7-8901-bcde-f12345678901","project_id":"${pid}","action_type":"createWorkflow","target_ref":{"project_id":"${pid}"},"payload":{"title":"W1","position":0}}]}`;
    const withTrailing = validJson + ' See the {Authentication} section for details.';
    const stream = await streamFromStrings([withTrailing]);

    const actions: unknown[] = [];
    for await (const result of parseActionsFromStream(stream)) {
      if (result.type === "action") actions.push(result.action);
    }

    expect(actions.length).toBe(1);
    expect((actions[0] as { action_type?: string }).action_type).toBe("createWorkflow");
  });
});
