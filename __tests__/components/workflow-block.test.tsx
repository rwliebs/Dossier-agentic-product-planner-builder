import React from "react";
import { render, screen } from "@testing-library/react";
import { WorkflowBlock } from "@/components/dossier/workflow-block";
import { ACTION_BUTTONS } from "@/lib/constants/action-buttons";
import type { MapSnapshot } from "@/lib/types/ui";

const minimalSnapshot: MapSnapshot = {
  project: { id: "p1", name: "Acme App", description: null, customer_personas: null, tech_stack: null, deployment: null, design_inspiration: null, repo_url: null, default_branch: "main" },
  workflows: [
    {
      id: "wf1",
      project_id: "p1",
      title: "MVP",
      description: null,
      build_state: null,
      position: 0,
      activities: [
        {
          id: "a1",
          workflow_id: "wf1",
          title: "User Management",
          color: "blue",
          position: 0,
          cards: [
            {
              id: "c1",
              workflow_activity_id: "a1",
              title: "Login form",
              description: null,
              status: "active",
              priority: 1,
            },
          ],
        },
      ],
    },
  ],
};

const workflowsOnlySnapshot: MapSnapshot = {
  project: { id: "p2", name: "MapleTCG", description: null, customer_personas: null, tech_stack: null, deployment: null, design_inspiration: null, repo_url: null, default_branch: "main" },
  workflows: [
    { id: "wf-a", project_id: "p2", title: "User Management", description: null, build_state: null, position: 0, activities: [] },
    { id: "wf-b", project_id: "p2", title: "Card Listings", description: null, build_state: null, position: 1, activities: [] },
    { id: "wf-c", project_id: "p2", title: "Transactions", description: null, build_state: null, position: 2, activities: [] },
  ],
};

/** One workflow populated (has activities), others still empty. Regression: empty workflows must not disappear. */
const mixedSnapshot: MapSnapshot = {
  project: { id: "p3", name: "Mixed Project", description: null, customer_personas: null, tech_stack: null, deployment: null, design_inspiration: null, repo_url: null, default_branch: "main" },
  workflows: [
    {
      id: "wf-populated",
      project_id: "p3",
      title: "Populated Workflow",
      description: null,
      build_state: null,
      position: 0,
      activities: [
        {
          id: "a1",
          workflow_id: "wf-populated",
          title: "Browse",
          color: "blue",
          position: 0,
          cards: [{ id: "c1", workflow_activity_id: "a1", title: "View list", description: null, status: "todo", priority: 1 }],
        },
      ],
    },
    { id: "wf-empty", project_id: "p3", title: "Empty Workflow", description: null, build_state: null, position: 1, activities: [] },
    { id: "wf-empty-2", project_id: "p3", title: "Another Empty", description: null, build_state: null, position: 2, activities: [] },
  ],
};

describe("WorkflowBlock", () => {
  it("renders implementation map with project context fields and status counts", () => {
    render(
      <WorkflowBlock
        snapshot={minimalSnapshot}
        viewMode="functionality"
        expandedCardId={null}
        onExpandCard={() => {}}
        onCardAction={() => {}}
      />
    );

    expect(screen.getByText("Implementation Map")).toBeInTheDocument();
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getByText("Customer Personas")).toBeInTheDocument();
    expect(screen.getByText("Tech Stack")).toBeInTheDocument();
    expect(screen.getByText("Deployment")).toBeInTheDocument();
    expect(screen.getByText("Design Inspiration")).toBeInTheDocument();
    const headerSection = screen.getByText("Implementation Map").closest(".border-b");
    expect(headerSection?.textContent).toContain("1");
    expect(headerSection?.textContent).toContain("active");
  });

  it("renders activity column with card title", () => {
    render(
      <WorkflowBlock
        snapshot={minimalSnapshot}
        viewMode="functionality"
        expandedCardId={null}
        onExpandCard={() => {}}
        onCardAction={() => {}}
      />
    );

    expect(screen.getByText("User Management")).toBeInTheDocument();
    expect(screen.getByText("Login form")).toBeInTheDocument();
  });

  it("when workflows exist but have no activities, user sees project context fields, scaffolded workflow names, and guidance", () => {
    render(
      <WorkflowBlock
        snapshot={workflowsOnlySnapshot}
        viewMode="functionality"
        expandedCardId={null}
        onExpandCard={() => {}}
        onCardAction={() => {}}
      />
    );

    // Outcome: user has project context section (description, personas, tech stack, deployment)
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getByText("Customer Personas")).toBeInTheDocument();

    // Outcome: user sees what was scaffolded (workflow titles visible somewhere)
    const workflowTitles = workflowsOnlySnapshot.workflows.map((wf) => wf.title);
    for (const title of workflowTitles) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }

    // Outcome: user gets guidance to add content (flexible copy so UI can evolve)
    const bodyText = document.body.textContent ?? "";
    const hasGuidance =
      /workflow|populate|activities|agent|preview|add/i.test(bodyText);
    expect(hasGuidance).toBe(true);
  });

  it("shows Approve Project button when workflows exist and project not approved", () => {
    const onFinalizeProject = vi.fn();
    render(
      <WorkflowBlock
        snapshot={workflowsOnlySnapshot}
        viewMode="functionality"
        expandedCardId={null}
        onExpandCard={() => {}}
        onCardAction={() => {}}
        onFinalizeProject={onFinalizeProject}
      />
    );

    const btn = screen.getByRole("button", { name: new RegExp(ACTION_BUTTONS.FINALIZE_PROJECT, "i") });
    expect(btn).toBeInTheDocument();
    btn.click();
    expect(onFinalizeProject).toHaveBeenCalled();
  });

  it("hides Approve Project button when project is already approved", () => {
    const finalizedSnapshot: MapSnapshot = {
      ...workflowsOnlySnapshot,
      project: { ...workflowsOnlySnapshot.project, finalized_at: "2026-01-01T00:00:00Z" },
    };
    render(
      <WorkflowBlock
        snapshot={finalizedSnapshot}
        viewMode="functionality"
        expandedCardId={null}
        onExpandCard={() => {}}
        onCardAction={() => {}}
        onFinalizeProject={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: new RegExp(ACTION_BUTTONS.FINALIZE_PROJECT, "i") })).not.toBeInTheDocument();
  });

  it("shows Populate button on each workflow when onPopulateWorkflow is provided", () => {
    const onPopulateWorkflow = vi.fn();
    render(
      <WorkflowBlock
        snapshot={workflowsOnlySnapshot}
        viewMode="functionality"
        expandedCardId={null}
        onExpandCard={() => {}}
        onCardAction={() => {}}
        onPopulateWorkflow={onPopulateWorkflow}
      />
    );

    const populateButtons = screen.getAllByRole("button", { name: new RegExp(ACTION_BUTTONS.POPULATE, "i") });
    expect(populateButtons.length).toBe(workflowsOnlySnapshot.workflows.length);

    populateButtons[0].click();
    expect(onPopulateWorkflow).toHaveBeenCalledWith(
      "wf-a",
      "User Management",
      null
    );
  });

  it("shows all workflows when one is populated and others are empty (regression: empty workflows must not disappear)", () => {
    render(
      <WorkflowBlock
        snapshot={mixedSnapshot}
        viewMode="functionality"
        expandedCardId={null}
        onExpandCard={() => {}}
        onCardAction={() => {}}
        onPopulateWorkflow={vi.fn()}
      />
    );

    // Populated workflow: activities and cards visible
    expect(screen.getByText("Populated Workflow")).toBeInTheDocument();
    expect(screen.getByText("Browse")).toBeInTheDocument();
    expect(screen.getByText("View list")).toBeInTheDocument();

    // Empty workflows must still be visible (not disappear after populating one)
    expect(screen.getByText("Empty Workflow")).toBeInTheDocument();
    expect(screen.getByText("Another Empty")).toBeInTheDocument();

    // Populate buttons for empty workflows
    const populateButtons = screen.getAllByRole("button", { name: new RegExp(ACTION_BUTTONS.POPULATE, "i") });
    expect(populateButtons.length).toBe(2);
  });
});
