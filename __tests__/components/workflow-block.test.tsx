import React from "react";
import { render, screen } from "@testing-library/react";
import { WorkflowBlock } from "@/components/dossier/workflow-block";
import type { MapSnapshot } from "@/lib/types/ui";

const minimalSnapshot: MapSnapshot = {
  project: { id: "p1", name: "Acme App", repo_url: null, default_branch: "main" },
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
          steps: [
            {
              id: "s1",
              workflow_activity_id: "a1",
              title: "Auth",
              position: 0,
              cards: [
                {
                  id: "c1",
                  workflow_activity_id: "a1",
                  step_id: "s1",
                  title: "Login form",
                  description: null,
                  status: "active",
                  priority: 1,
                },
              ],
            },
          ],
          cards: [],
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

    expect(screen.getByRole("button", { name: /build all/i })).toBeInTheDocument();
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

  it("shows empty-state guidance when workflows exist but have no activities", () => {
    render(
      <WorkflowBlock
        snapshot={workflowsOnlySnapshot}
        viewMode="functionality"
        expandedCardId={null}
        onExpandCard={() => {}}
        onCardAction={() => {}}
      />
    );

    // Canvas should not be entirely invisible — show project name
    expect(screen.getByText("MapleTCG")).toBeInTheDocument();

    // Expected: guidance text prompting user to populate workflows
    // This fails currently because StoryMapCanvas renders an empty div with no fallback
    expect(
      screen.getByText(/populate|add activities|no activities/i)
    ).toBeInTheDocument();
  });

  it("lists workflow titles in empty-state so user knows what was scaffolded", () => {
    render(
      <WorkflowBlock
        snapshot={workflowsOnlySnapshot}
        viewMode="functionality"
        expandedCardId={null}
        onExpandCard={() => {}}
        onCardAction={() => {}}
      />
    );

    // Expected: scaffold phase created these workflow titles — they should be visible
    // even before populate, giving user confidence the scaffold worked
    expect(screen.getByText("User Management")).toBeInTheDocument();
    expect(screen.getByText("Card Listings")).toBeInTheDocument();
    expect(screen.getByText("Transactions")).toBeInTheDocument();
  });
});
