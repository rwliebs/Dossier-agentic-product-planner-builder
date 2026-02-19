import React from "react";
import { render, screen } from "@testing-library/react";
import { WorkflowBlock } from "@/components/dossier/workflow-block";
import { ACTION_BUTTONS } from "@/lib/constants/action-buttons";
import type { MapSnapshot } from "@/lib/types/ui";

const minimalSnapshot: MapSnapshot = {
  project: { id: "p1", name: "Acme App", description: null, repo_url: null, default_branch: "main" },
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
  project: { id: "p2", name: "MapleTCG", repo_url: null, default_branch: "main", description: null },
  workflows: [
    { id: "wf-a", project_id: "p2", title: "User Management", description: null, build_state: null, position: 0, activities: [] },
    { id: "wf-b", project_id: "p2", title: "Card Listings", description: null, build_state: null, position: 1, activities: [] },
    { id: "wf-c", project_id: "p2", title: "Transactions", description: null, build_state: null, position: 2, activities: [] },
  ],
};

describe("WorkflowBlock", () => {
  it("renders implementation map with project name and status counts", () => {
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
    expect(screen.getByText("Acme App")).toBeInTheDocument();
    const headerSection = screen.getByText("Implementation Map").closest(".border-b");
    expect(headerSection?.textContent).toContain("1");
    expect(headerSection?.textContent).toContain("active");
  });

  it("shows Build All button when workflow has pending cards", () => {
    render(
      <WorkflowBlock
        snapshot={minimalSnapshot}
        viewMode="functionality"
        expandedCardId={null}
        onExpandCard={() => {}}
        onCardAction={() => {}}
        onBuildAll={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: new RegExp(ACTION_BUTTONS.BUILD_ALL, "i") })).toBeInTheDocument();
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

  it("when workflows exist but have no activities, user sees project, scaffolded workflow names, and guidance", () => {
    render(
      <WorkflowBlock
        snapshot={workflowsOnlySnapshot}
        viewMode="functionality"
        expandedCardId={null}
        onExpandCard={() => {}}
        onCardAction={() => {}}
      />
    );

    // Outcome: user has context (project name)
    expect(screen.getByText("MapleTCG")).toBeInTheDocument();

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
});
