import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ImplementationCard } from "@/components/dossier/implementation-card";
import type { MapCard } from "@/lib/types/ui";

const card: MapCard = {
  id: "card-1",
  workflow_activity_id: "activity-1",
  step_id: null,
  title: "Lead intake form",
  description: "Capture name and phone",
  status: "active",
  priority: 1,
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
      />,
    );

    expect(screen.getByText("Lead intake form")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /view details & edit/i }));
    expect(onExpand).toHaveBeenCalledWith("card-1");
  });
});
