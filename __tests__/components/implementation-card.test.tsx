import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ImplementationCard } from "@/components/dossier/implementation-card";
import type { Card } from "@/components/dossier/types";

const card: Card = {
  id: "card-1",
  activityId: "activity-1",
  title: "Lead intake form",
  description: "Capture name and phone",
  status: "active",
  priority: 1,
  contextDocs: [],
  requirements: ["Validation"],
  knownFacts: [],
  assumptions: [],
  questions: [],
};

describe("ImplementationCard", () => {
  it("renders and triggers actions", () => {
    const onExpand = vi.fn();
    const onAction = vi.fn();

    render(
      <ImplementationCard
        card={card}
        isExpanded={false}
        onExpand={onExpand}
        onAction={onAction}
        onUpdateDescription={() => {}}
        onUpdateQuickAnswer={() => {}}
      />,
    );

    expect(screen.getByText("Lead intake form")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /view details & edit/i }));
    expect(onExpand).toHaveBeenCalledWith("card-1");
  });
});
