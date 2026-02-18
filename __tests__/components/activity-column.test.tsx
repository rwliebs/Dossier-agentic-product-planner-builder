import React from "react";
import { render, screen } from "@testing-library/react";
import { ActivityColumn } from "@/components/dossier/activity-column";
import type { MapActivity } from "@/lib/types/ui";

const activityWithSteps: MapActivity = {
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
          title: "Login",
          description: null,
          status: "active",
          priority: 1,
        },
      ],
    },
  ],
  cards: [],
};

describe("ActivityColumn", () => {
  it("renders activity title and step content", () => {
    render(
      <ActivityColumn
        activity={activityWithSteps}
        expandedCardId={null}
        onExpandCard={() => {}}
        onCardAction={() => {}}
        onUpdateCardDescription={() => {}}
      />
    );

    expect(screen.getByText("User Management")).toBeInTheDocument();
    expect(screen.getByText("Auth")).toBeInTheDocument();
    expect(screen.getByText("Login")).toBeInTheDocument();
  });
});
