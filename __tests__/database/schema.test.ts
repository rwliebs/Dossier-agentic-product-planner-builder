/**
 * Database integration tests for Slice A schema.
 * Requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to be set.
 * Run with: pnpm test __tests__/database/schema.test.ts
 *
 * Apply migrations first: supabase db push (or run SQL in Supabase dashboard)
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { describe, it, expect, beforeAll, afterEach } from "vitest";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

function makeUniqueId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

(hasSupabaseConfig ? describe : describe.skip)(
  "database schema (Slice A)",
  () => {
    let supabase: SupabaseClient;
    const createdProjectIds: string[] = [];

    beforeAll(() => {
      supabase = createClient(supabaseUrl!, supabaseAnonKey!);
    });

    afterEach(async () => {
      for (const id of createdProjectIds) {
        await supabase.from("project").delete().eq("id", id);
      }
      createdProjectIds.length = 0;
    });

    describe("schema structure", () => {
      it("project table exists and accepts inserts", async () => {
        const { data, error } = await supabase
          .from("project")
          .insert({
            name: makeUniqueId(),
            default_branch: "main",
          })
          .select("id, name")
          .single();

        expect(error).toBeNull();
        expect(data).toBeDefined();
        expect(data?.id).toBeDefined();
        expect(data?.name).toBeDefined();
        if (data) createdProjectIds.push(data.id);
      });

      it("workflow_label table exists", async () => {
        const { data, error } = await supabase
          .from("workflow_label")
          .select("key, title")
          .limit(1);
        expect(error).toBeNull();
        expect(Array.isArray(data)).toBe(true);
      });

      it("version_label table exists", async () => {
        const { data, error } = await supabase
          .from("version_label")
          .select("key, title")
          .limit(1);
        expect(error).toBeNull();
        expect(Array.isArray(data)).toBe(true);
      });

      it("workflow table exists with required columns", async () => {
        const { data: project } = await supabase
          .from("project")
          .insert({ name: makeUniqueId(), default_branch: "main" })
          .select("id")
          .single();

        expect(project?.id).toBeDefined();
        if (project) createdProjectIds.push(project.id);

        const { data: workflow, error } = await supabase
          .from("workflow")
          .insert({
            project_id: project!.id,
            title: "Test Workflow",
            position: 0,
          })
          .select("id, project_id, title, position")
          .single();

        expect(error).toBeNull();
        expect(workflow?.project_id).toBe(project!.id);
        expect(workflow?.position).toBe(0);
      });

      it("planning_action table exists with jsonb columns", async () => {
        const { data: project } = await supabase
          .from("project")
          .insert({ name: makeUniqueId(), default_branch: "main" })
          .select("id")
          .single();

        expect(project?.id).toBeDefined();
        if (project) createdProjectIds.push(project.id);

        const { data: action, error } = await supabase
          .from("planning_action")
          .insert({
            project_id: project!.id,
            action_type: "createWorkflow",
            target_ref: { project_id: project!.id },
            payload: { title: "New Workflow" },
            validation_status: "accepted",
          })
          .select("id, action_type, target_ref, payload")
          .single();

        expect(error).toBeNull();
        expect(action?.target_ref).toEqual({ project_id: project!.id });
        expect(action?.payload).toEqual({ title: "New Workflow" });
      });
    });

    describe("referential integrity", () => {
      it("inserts valid project -> workflow -> activity -> step -> card hierarchy", async () => {
        const { data: project } = await supabase
          .from("project")
          .insert({ name: makeUniqueId(), default_branch: "main" })
          .select("id")
          .single();
        expect(project?.id).toBeDefined();
        if (project) createdProjectIds.push(project.id);

        const { data: workflow } = await supabase
          .from("workflow")
          .insert({
            project_id: project!.id,
            title: "Epic 1",
            position: 0,
          })
          .select("id")
          .single();
        expect(workflow?.id).toBeDefined();

        const { data: activity } = await supabase
          .from("workflow_activity")
          .insert({
            workflow_id: workflow!.id,
            title: "Activity 1",
            position: 0,
          })
          .select("id")
          .single();
        expect(activity?.id).toBeDefined();

        const { data: step } = await supabase
          .from("step")
          .insert({
            workflow_activity_id: activity!.id,
            title: "Step 1",
            position: 0,
          })
          .select("id")
          .single();
        expect(step?.id).toBeDefined();

        const { data: card, error } = await supabase
          .from("card")
          .insert({
            workflow_activity_id: activity!.id,
            step_id: step!.id,
            title: "Card 1",
            status: "todo",
            priority: 1,
          })
          .select("id, title, status, priority")
          .single();

        expect(error).toBeNull();
        expect(card?.title).toBe("Card 1");
        expect(card?.status).toBe("todo");
        expect(card?.priority).toBe(1);
      });

      it("rejects card with invalid step_id (FK violation)", async () => {
        const { data: project } = await supabase
          .from("project")
          .insert({ name: makeUniqueId(), default_branch: "main" })
          .select("id")
          .single();
        if (project) createdProjectIds.push(project.id);

        const { data: wf } = await supabase
          .from("workflow")
          .insert({
            project_id: project!.id,
            title: "W",
            position: 0,
          })
          .select("id")
          .single();

        const { data: act } = await supabase
          .from("workflow_activity")
          .insert({
            workflow_id: wf!.id,
            title: "A",
            position: 0,
          })
          .select("id")
          .single();

        const fakeStepId = "00000000-0000-0000-0000-000000000000";
        const { error } = await supabase.from("card").insert({
          workflow_activity_id: act!.id,
          step_id: fakeStepId,
          title: "Bad Card",
          status: "todo",
          priority: 1,
        });

        expect(error).not.toBeNull();
        expect(error?.code).toBe("23503"); // FK violation
      });

      it("rejects workflow with invalid project_id", async () => {
        const fakeProjectId = "00000000-0000-0000-0000-000000000000";
        const { error } = await supabase.from("workflow").insert({
          project_id: fakeProjectId,
          title: "Orphan Workflow",
          position: 0,
        });

        expect(error).not.toBeNull();
        expect(error?.code).toBe("23503");
      });
    });

    describe("constraints validation", () => {
      it("rejects card with invalid status", async () => {
        const { data: project } = await supabase
          .from("project")
          .insert({ name: makeUniqueId(), default_branch: "main" })
          .select("id")
          .single();
        if (project) createdProjectIds.push(project.id);

        const { data: wf } = await supabase
          .from("workflow")
          .insert({
            project_id: project!.id,
            title: "W",
            position: 0,
          })
          .select("id")
          .single();

        const { data: act } = await supabase
          .from("workflow_activity")
          .insert({
            workflow_id: wf!.id,
            title: "A",
            position: 0,
          })
          .select("id")
          .single();

        const { error } = await supabase.from("card").insert({
          workflow_activity_id: act!.id,
          title: "Bad Status Card",
          status: "invalid_status",
          priority: 1,
        });

        expect(error).not.toBeNull();
        expect(error?.code).toBe("22P02"); // invalid enum or type
      });

      it("rejects card with priority < 1", async () => {
        const { data: project } = await supabase
          .from("project")
          .insert({ name: makeUniqueId(), default_branch: "main" })
          .select("id")
          .single();
        if (project) createdProjectIds.push(project.id);

        const { data: wf } = await supabase
          .from("workflow")
          .insert({
            project_id: project!.id,
            title: "W",
            position: 0,
          })
          .select("id")
          .single();

        const { data: act } = await supabase
          .from("workflow_activity")
          .insert({
            workflow_id: wf!.id,
            title: "A",
            position: 0,
          })
          .select("id")
          .single();

        const { error } = await supabase.from("card").insert({
          workflow_activity_id: act!.id,
          title: "Bad Priority Card",
          status: "todo",
          priority: 0,
        });

        expect(error).not.toBeNull();
        expect(error?.code).toBe("23514"); // check constraint
      });

      it("rejects workflow with negative position", async () => {
        const { data: project } = await supabase
          .from("project")
          .insert({ name: makeUniqueId(), default_branch: "main" })
          .select("id")
          .single();
        if (project) createdProjectIds.push(project.id);

        const { error } = await supabase.from("workflow").insert({
          project_id: project!.id,
          title: "W",
          position: -1,
        });

        expect(error).not.toBeNull();
        expect(error?.code).toBe("23514");
      });
    });

    describe("data round-trip", () => {
      it("round-trips full hierarchy with all nullable fields", async () => {
        const { data: project } = await supabase
          .from("project")
          .insert({
            name: makeUniqueId(),
            repo_url: "https://github.com/test/repo",
            default_branch: "main",
          })
          .select("id, name, repo_url")
          .single();
        expect(project?.id).toBeDefined();
        if (project) createdProjectIds.push(project.id);

        const { data: workflow } = await supabase
          .from("workflow")
          .insert({
            project_id: project!.id,
            title: "Epic",
            description: "An epic",
            build_state: "completed",
            last_built_at: "2024-01-01T00:00:00Z",
            last_build_ref: "refs/heads/feature-1",
            position: 0,
          })
          .select("*")
          .single();

        const { data: activity } = await supabase
          .from("workflow_activity")
          .insert({
            workflow_id: workflow!.id,
            title: "Activity",
            color: "blue",
            position: 0,
          })
          .select("*")
          .single();

        const { data: step } = await supabase
          .from("step")
          .insert({
            workflow_activity_id: activity!.id,
            title: "Step",
            position: 0,
          })
          .select("*")
          .single();

        const { data: card } = await supabase
          .from("card")
          .insert({
            workflow_activity_id: activity!.id,
            step_id: step!.id,
            title: "Card",
            description: "A card",
            status: "active",
            priority: 2,
            quick_answer: "Yes",
            build_state: "queued",
          })
          .select("*")
          .single();

        expect(card?.title).toBe("Card");
        expect(card?.description).toBe("A card");
        expect(card?.status).toBe("active");
        expect(card?.priority).toBe(2);
        expect(card?.quick_answer).toBe("Yes");
        expect(card?.build_state).toBe("queued");

        const { data: fetched } = await supabase
          .from("card")
          .select("*, step:step_id(*)")
          .eq("id", card!.id)
          .single();

        expect(fetched?.title).toBe(card?.title);
        expect(fetched?.step_id).toBe(step!.id);
      });
    });

    describe("planning action persistence", () => {
      it("inserts and queries planning actions by project_id and validation_status", async () => {
        const { data: project } = await supabase
          .from("project")
          .insert({ name: makeUniqueId(), default_branch: "main" })
          .select("id")
          .single();
        if (project) createdProjectIds.push(project.id);

        await supabase.from("planning_action").insert([
          {
            project_id: project!.id,
            action_type: "createWorkflow",
            target_ref: {},
            payload: {},
            validation_status: "accepted",
            applied_at: new Date().toISOString(),
          },
          {
            project_id: project!.id,
            action_type: "createCard",
            target_ref: {},
            payload: {},
            validation_status: "rejected",
            rejection_reason: "Invalid step_id",
          },
        ]);

        const { data: accepted } = await supabase
          .from("planning_action")
          .select("id, action_type, validation_status")
          .eq("project_id", project!.id)
          .eq("validation_status", "accepted");

        const { data: rejected } = await supabase
          .from("planning_action")
          .select("id, action_type, validation_status, rejection_reason")
          .eq("project_id", project!.id)
          .eq("validation_status", "rejected");

        expect(accepted?.length).toBeGreaterThanOrEqual(1);
        expect(rejected?.length).toBeGreaterThanOrEqual(1);
        expect(rejected?.[0]?.rejection_reason).toBe("Invalid step_id");
      });
    });
  }
);
