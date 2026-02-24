/**
 * Unit tests for action mutation logic (applyAction).
 * Tests validation and rejection paths without requiring a real DB.
 */

import { vi } from "vitest";
import { applyAction } from "@/lib/db/mutations";
import { createMockDbAdapter } from "@/__tests__/lib/mock-db-adapter";

describe("applyAction", () => {
  it("rejects code-generation intent in payload", async () => {
    const db = createMockDbAdapter();
    const result = await applyAction(db, "p1", {
      action_type: "createCard",
      target_ref: { workflow_activity_id: "a1" },
      payload: {
        title: "Card",
        status: "todo",
        priority: 1,
        intent_summary: "Generate code for the component",
      },
    });
    expect(result.applied).toBe(false);
    expect(result.rejectionReason).toContain("forbidden");
  });

  it("rejects unsupported action type", async () => {
    const db = createMockDbAdapter();
    const result = await applyAction(db, "p1", {
      action_type: "unknownAction",
      target_ref: {},
      payload: {},
    });
    expect(result.applied).toBe(false);
    expect(result.rejectionReason).toContain("Unsupported");
  });

  describe("deleteCard", () => {
    it("applies deleteCard when card exists in project", async () => {
      const deleteCard = vi.fn().mockResolvedValue(undefined);
      const db = createMockDbAdapter({
        verifyCardInProject: vi.fn().mockResolvedValue(true),
        deleteCard,
      });

      const result = await applyAction(db, "p1", {
        action_type: "deleteCard",
        target_ref: { card_id: "card-123" },
        payload: {},
      });

      expect(result.applied).toBe(true);
      expect(deleteCard).toHaveBeenCalledWith("card-123");
    });

    it("rejects deleteCard when card not in project", async () => {
      const db = createMockDbAdapter({
        verifyCardInProject: vi.fn().mockResolvedValue(false),
      });

      const result = await applyAction(db, "p1", {
        action_type: "deleteCard",
        target_ref: { card_id: "card-123" },
        payload: {},
      });

      expect(result.applied).toBe(false);
      expect(result.rejectionReason).toContain("not found");
    });
  });

  describe("deleteActivity", () => {
    it("applies deleteActivity when activity belongs to workflow in project", async () => {
      const deleteWorkflowActivity = vi.fn().mockResolvedValue(undefined);
      const db = createMockDbAdapter({
        getWorkflowsByProject: vi.fn().mockResolvedValue([
          { id: "wf-1", project_id: "p1" },
        ]),
        getActivitiesByWorkflow: vi.fn().mockResolvedValue([
          { id: "act-1", workflow_id: "wf-1" },
        ]),
        deleteWorkflowActivity,
      });

      const result = await applyAction(db, "p1", {
        action_type: "deleteActivity",
        target_ref: { workflow_activity_id: "act-1" },
        payload: {},
      });

      expect(result.applied).toBe(true);
      expect(deleteWorkflowActivity).toHaveBeenCalledWith("act-1", "wf-1");
    });

    it("rejects deleteActivity when workflow not found in project", async () => {
      const db = createMockDbAdapter({
        getWorkflowsByProject: vi.fn().mockResolvedValue([]),
      });

      const result = await applyAction(db, "p1", {
        action_type: "deleteActivity",
        target_ref: { workflow_activity_id: "act-1" },
        payload: {},
      });

      expect(result.applied).toBe(false);
      expect(result.rejectionReason).toContain("not found");
    });
  });

  describe("deleteWorkflow", () => {
    it("applies deleteWorkflow when workflow belongs to project", async () => {
      const deleteWorkflow = vi.fn().mockResolvedValue(undefined);
      const db = createMockDbAdapter({
        getWorkflowsByProject: vi.fn().mockResolvedValue([
          { id: "wf-1", project_id: "p1" },
        ]),
        deleteWorkflow,
      });

      const result = await applyAction(db, "p1", {
        action_type: "deleteWorkflow",
        target_ref: { workflow_id: "wf-1" },
        payload: {},
      });

      expect(result.applied).toBe(true);
      expect(deleteWorkflow).toHaveBeenCalledWith("wf-1", "p1");
    });

    it("rejects deleteWorkflow when workflow not in project", async () => {
      const db = createMockDbAdapter({
        getWorkflowsByProject: vi.fn().mockResolvedValue([
          { id: "wf-other", project_id: "p1" },
        ]),
      });

      const result = await applyAction(db, "p1", {
        action_type: "deleteWorkflow",
        target_ref: { workflow_id: "wf-1" },
        payload: {},
      });

      expect(result.applied).toBe(false);
      expect(result.rejectionReason).toContain("not found");
    });
  });
});
