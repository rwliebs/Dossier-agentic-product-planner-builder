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
});
