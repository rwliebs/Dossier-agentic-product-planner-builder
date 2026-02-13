import {
  systemPolicyProfileSchema,
  orchestrationRunSchema,
  cardAssignmentSchema,
  runCheckSchema,
  approvalRequestSchema,
  pullRequestCandidateSchema,
  eventLogSchema,
} from "@/lib/schemas/slice-c";

describe("Slice C schema contracts", () => {
  const ids = {
    project: "11111111-1111-4111-8111-111111111111",
    workflow: "22222222-2222-4222-8222-222222222222",
    card: "55555555-5555-4555-8555-555555555555",
    policy: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    run: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    assignment: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    check: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    approval: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    pr: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    event: "10101010-1010-4101-8101-101010101010",
  };

  describe("SystemPolicyProfile validation", () => {
    it("validates policy profile with all fields", () => {
      const profile = systemPolicyProfileSchema.parse({
        id: ids.policy,
        project_id: ids.project,
        required_checks: ["dependency", "security", "policy", "lint", "unit"],
        protected_paths: ["src/core/"],
        forbidden_paths: ["*.secret"],
        dependency_policy: { allowed_sources: ["npm"] },
        security_policy: { scan_on_build: true },
        architecture_policy: { protected_paths: [] },
        approval_policy: { require_review: true },
        updated_at: "2025-02-13T12:00:00Z",
      });
      expect(profile.required_checks).toContain("dependency");
      expect(profile.protected_paths).toEqual(["src/core/"]);
    });

    it("validates policy profile with minimal required fields", () => {
      const profile = systemPolicyProfileSchema.parse({
        id: ids.policy,
        project_id: ids.project,
        required_checks: ["dependency", "security", "policy"],
        dependency_policy: {},
        security_policy: {},
        architecture_policy: {},
        approval_policy: {},
        updated_at: "2025-02-13T12:00:00Z",
      });
      expect(profile.required_checks).toHaveLength(3);
    });

    it("rejects invalid run_check_type in required_checks", () => {
      expect(() =>
        systemPolicyProfileSchema.parse({
          id: ids.policy,
          project_id: ids.project,
          required_checks: ["invalid_check"],
          dependency_policy: {},
          security_policy: {},
          architecture_policy: {},
          approval_policy: {},
          updated_at: "2025-02-13T12:00:00Z",
        })
      ).toThrow();
    });
  });

  describe("OrchestrationRun validation", () => {
    it("validates workflow-scoped run", () => {
      const run = orchestrationRunSchema.parse({
        id: ids.run,
        project_id: ids.project,
        scope: "workflow",
        workflow_id: ids.workflow,
        card_id: null,
        trigger_type: "workflow",
        status: "queued",
        initiated_by: "user-123",
        repo_url: "https://github.com/acme/app",
        base_branch: "main",
        system_policy_profile_id: ids.policy,
        system_policy_snapshot: { required_checks: ["dependency"] },
        run_input_snapshot: { scope_target: ids.workflow },
      });
      expect(run.scope).toBe("workflow");
      expect(run.workflow_id).toBe(ids.workflow);
      expect(run.card_id).toBeNull();
    });

    it("validates card-scoped run", () => {
      const run = orchestrationRunSchema.parse({
        id: ids.run,
        project_id: ids.project,
        scope: "card",
        workflow_id: ids.workflow,
        card_id: ids.card,
        trigger_type: "card",
        status: "queued",
        initiated_by: "user-123",
        repo_url: "https://github.com/acme/app",
        base_branch: "main",
        system_policy_profile_id: ids.policy,
        system_policy_snapshot: {},
        run_input_snapshot: { card_id: ids.card },
      });
      expect(run.scope).toBe("card");
      expect(run.card_id).toBe(ids.card);
    });

    it("rejects workflow scope without workflow_id", () => {
      expect(() =>
        orchestrationRunSchema.parse({
          id: ids.run,
          project_id: ids.project,
          scope: "workflow",
          workflow_id: null,
          card_id: null,
          trigger_type: "workflow",
          status: "queued",
          initiated_by: "user-123",
          repo_url: "https://github.com/acme/app",
          base_branch: "main",
          system_policy_profile_id: ids.policy,
          system_policy_snapshot: {},
          run_input_snapshot: {},
        })
      ).toThrow();
    });

    it("rejects card scope without card_id", () => {
      expect(() =>
        orchestrationRunSchema.parse({
          id: ids.run,
          project_id: ids.project,
          scope: "card",
          workflow_id: null,
          card_id: null,
          trigger_type: "card",
          status: "queued",
          initiated_by: "user-123",
          repo_url: "https://github.com/acme/app",
          base_branch: "main",
          system_policy_profile_id: ids.policy,
          system_policy_snapshot: {},
          run_input_snapshot: {},
        })
      ).toThrow();
    });

    it("validates all run status values", () => {
      const statuses = ["queued", "running", "blocked", "failed", "completed", "cancelled"];
      statuses.forEach((status) => {
        const run = orchestrationRunSchema.parse({
          id: ids.run,
          project_id: ids.project,
          scope: "card",
          card_id: ids.card,
          trigger_type: "manual",
          status,
          initiated_by: "user-123",
          repo_url: "https://github.com/acme/app",
          base_branch: "main",
          system_policy_profile_id: ids.policy,
          system_policy_snapshot: {},
          run_input_snapshot: {},
        });
        expect(run.status).toBe(status);
      });
    });
  });

  describe("CardAssignment validation", () => {
    it("validates assignment with all fields", () => {
      const assignment = cardAssignmentSchema.parse({
        id: ids.assignment,
        run_id: ids.run,
        card_id: ids.card,
        agent_role: "coder",
        agent_profile: "claude-opus",
        feature_branch: "feat/card-123",
        worktree_path: "/tmp/run-123/card-a",
        allowed_paths: ["src/components/", "src/hooks/"],
        forbidden_paths: ["*.test.ts"],
        assignment_input_snapshot: { card_id: ids.card, planned_files: [] },
        status: "queued",
      });
      expect(assignment.allowed_paths).toHaveLength(2);
      expect(assignment.agent_role).toBe("coder");
    });

    it("rejects empty allowed_paths", () => {
      expect(() =>
        cardAssignmentSchema.parse({
          id: ids.assignment,
          run_id: ids.run,
          card_id: ids.card,
          agent_role: "coder",
          agent_profile: "claude-opus",
          feature_branch: "feat/card-123",
          allowed_paths: [],
          assignment_input_snapshot: {},
          status: "queued",
        })
      ).toThrow();
    });

    it("validates all agent roles", () => {
      const roles = ["planner", "coder", "reviewer", "integrator", "tester"];
      roles.forEach((role) => {
        const assignment = cardAssignmentSchema.parse({
          id: ids.assignment,
          run_id: ids.run,
          card_id: ids.card,
          agent_role: role,
          agent_profile: "test",
          feature_branch: "feat/test",
          allowed_paths: ["src/"],
          assignment_input_snapshot: {},
          status: "queued",
        });
        expect(assignment.agent_role).toBe(role);
      });
    });
  });

  describe("RunCheck validation", () => {
    it("validates check with all fields", () => {
      const check = runCheckSchema.parse({
        id: ids.check,
        run_id: ids.run,
        check_type: "lint",
        status: "passed",
        output: "No lint errors",
        executed_at: "2025-02-13T12:00:00Z",
      });
      expect(check.check_type).toBe("lint");
      expect(check.status).toBe("passed");
    });

    it("validates all check types", () => {
      const types = ["dependency", "security", "policy", "lint", "unit", "integration", "e2e"];
      types.forEach((checkType) => {
        const check = runCheckSchema.parse({
          id: ids.check,
          run_id: ids.run,
          check_type: checkType,
          status: "passed",
        });
        expect(check.check_type).toBe(checkType);
      });
    });

    it("validates all check statuses", () => {
      const statuses = ["passed", "failed", "skipped"];
      statuses.forEach((status) => {
        const check = runCheckSchema.parse({
          id: ids.check,
          run_id: ids.run,
          check_type: "lint",
          status,
        });
        expect(check.status).toBe(status);
      });
    });
  });

  describe("ApprovalRequest validation", () => {
    it("validates approval request with all fields", () => {
      const approval = approvalRequestSchema.parse({
        id: ids.approval,
        run_id: ids.run,
        approval_type: "create_pr",
        status: "pending",
        requested_by: "system",
        requested_at: "2025-02-13T12:00:00Z",
        resolved_by: null,
        resolved_at: null,
        notes: null,
      });
      expect(approval.approval_type).toBe("create_pr");
      expect(approval.status).toBe("pending");
    });

    it("validates both approval types", () => {
      ["create_pr", "merge_pr"].forEach((type) => {
        const approval = approvalRequestSchema.parse({
          id: ids.approval,
          run_id: ids.run,
          approval_type: type,
          status: "approved",
          requested_by: "user",
          requested_at: "2025-02-13T12:00:00Z",
          resolved_by: "user",
          resolved_at: "2025-02-13T12:05:00Z",
        });
        expect(approval.approval_type).toBe(type);
      });
    });
  });

  describe("PullRequestCandidate validation", () => {
    it("validates PR candidate with all fields", () => {
      const pr = pullRequestCandidateSchema.parse({
        id: ids.pr,
        run_id: ids.run,
        base_branch: "main",
        head_branch: "feat/card-123",
        title: "Add user auth component",
        description: "Implements OAuth flow per card requirements",
        status: "draft_open",
        pr_url: "https://github.com/acme/app/pull/42",
      });
      expect(pr.status).toBe("draft_open");
      expect(pr.pr_url).toBeDefined();
    });

    it("validates all PR statuses", () => {
      const statuses = ["not_created", "draft_open", "open", "merged", "closed"];
      statuses.forEach((status) => {
        const pr = pullRequestCandidateSchema.parse({
          id: ids.pr,
          run_id: ids.run,
          base_branch: "main",
          head_branch: "feat/test",
          title: "Test PR",
          description: "Test",
          status,
        });
        expect(pr.status).toBe(status);
      });
    });
  });

  describe("EventLog validation", () => {
    it("validates event log with all fields", () => {
      const event = eventLogSchema.parse({
        id: ids.event,
        project_id: ids.project,
        run_id: ids.run,
        event_type: "planning_action_applied",
        actor: "user",
        payload: { action_id: "abc", action_type: "createCard" },
        created_at: "2025-02-13T12:00:00Z",
      });
      expect(event.event_type).toBe("planning_action_applied");
      expect(event.actor).toBe("user");
    });

    it("validates event log with null run_id", () => {
      const event = eventLogSchema.parse({
        id: ids.event,
        project_id: ids.project,
        run_id: null,
        event_type: "project_created",
        actor: "user",
        payload: {},
        created_at: "2025-02-13T12:00:00Z",
      });
      expect(event.run_id).toBeNull();
    });
  });
});
