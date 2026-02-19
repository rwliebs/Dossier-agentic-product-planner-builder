import React from "react";
import { render, screen } from "@testing-library/react";
import { ActivityColumn } from "@/components/dossier/activity-column";
import type { MapActivity } from "@/lib/types/ui";

const activityWithCards: MapActivity = {
  id: "a1",
  workflow_id: "wf1",
  title: "User Management",
  color: "blue",
  position: 0,
  cards: [
    {
      id: "c1",
      workflow_activity_id: "a1",
      title: "Login",
      description: null,
      status: "active",
      priority: 1,
    },
  ],
};

describe("ActivityColumn", () => {
  it("renders activity title and card content", () => {
    render(
      <ActivityColumn
        activity={activityWithCards}
        expandedCardId={null}
        onExpandCard={() => {}}
        onCardAction={() => {}}
        onUpdateCardDescription={() => {}}
      />
    );

    expect(screen.getByText("User Management")).toBeInTheDocument();
    expect(screen.getByText("Login")).toBeInTheDocument();
  });
});
