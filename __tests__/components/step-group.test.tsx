import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { StepGroup } from "@/components/dossier/step-group";
import type { MapStep } from "@/lib/types/ui";

const stepWithCards: MapStep = {
  id: "s1",
  workflow_activity_id: "a1",
  title: "Authentication",
  position: 0,
  cards: [
    {
      id: "c1",
      workflow_activity_id: "a1",
      step_id: "s1",
      title: "Login form",
      description: "Email + password",
      status: "active",
      priority: 1,
    },
    {
      id: "c2",
      workflow_activity_id: "a1",
      step_id: "s1",
      title: "Password reset",
      description: null,
      status: "todo",
      priority: 2,
    },
  ],
};

describe("StepGroup", () => {
  it("renders step title and card titles", () => {
    render(
      <StepGroup
        step={stepWithCards}
        expandedCardId={null}
        onExpandCard={() => {}}
        onCardAction={() => {}}
        onUpdateCardDescription={() => {}}
      />
    );

    expect(screen.getByText("Authentication")).toBeInTheDocument();
    expect(screen.getByText("Login form")).toBeInTheDocument();
    expect(screen.getByText("Password reset")).toBeInTheDocument();
  });

  it("calls onExpandCard when user clicks view details on a card", () => {
    const onExpand = vi.fn();
    render(
      <StepGroup
        step={stepWithCards}
        expandedCardId={null}
        onExpandCard={onExpand}
        onCardAction={() => {}}
        onUpdateCardDescription={() => {}}
      />
    );

    fireEvent.click(screen.getAllByRole("button", { name: /view details & edit/i })[0]);
    expect(onExpand).toHaveBeenCalledWith("c1");
  });
});
