import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ImplementationCard } from "@/components/dossier/implementation-card";
import { ACTION_BUTTONS } from "@/lib/constants/action-buttons";
import type { MapCard } from "@/lib/types/ui";

const baseCard: MapCard = {
  id: "card-1",
  workflow_activity_id: "activity-1",
  title: "Lead intake form",
  description: "Capture name and phone",
  status: "active",
  priority: 1,
};

describe("ImplementationCard", () => {
  it("renders and triggers expand", () => {
    const onExpand = vi.fn();
    const onAction = vi.fn();

    render(
      <ImplementationCard
        card={baseCard}
        isExpanded={false}
        onExpand={onExpand}
        onAction={onAction}
        onUpdateDescription={() => {}}
      />,
    );

    expect(screen.getByText("Lead intake form")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(ACTION_BUTTONS.VIEW_DETAILS_EDIT, "i") }));
    expect(onExpand).toHaveBeenCalledWith("card-1");
  });

  it("Monitor button calls onAction('monitor') for active cards", () => {
    const onAction = vi.fn();

    render(
      <ImplementationCard
        card={{ ...baseCard, status: "active" }}
        isExpanded={false}
        onExpand={() => {}}
        onAction={onAction}
        onUpdateDescription={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: new RegExp(ACTION_BUTTONS.CARD_ACTION.active, "i") }));
    expect(onAction).toHaveBeenCalledWith("card-1", "monitor");
  });

  it("Test button calls onAction('test') for review cards", () => {
    const onAction = vi.fn();

    render(
      <ImplementationCard
        card={{ ...baseCard, status: "review" }}
        isExpanded={false}
        onExpand={() => {}}
        onAction={onAction}
        onUpdateDescription={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: new RegExp(ACTION_BUTTONS.CARD_ACTION.review, "i") }));
    expect(onAction).toHaveBeenCalledWith("card-1", "test");
  });

  it("Build button calls onBuildCard (not onAction) for finalized todo cards", () => {
    const onAction = vi.fn();
    const onBuildCard = vi.fn();
    const finalizedCard: MapCard = {
      ...baseCard,
      status: "todo",
      finalized_at: "2026-02-18T00:00:00Z",
    };

    render(
      <ImplementationCard
        card={finalizedCard}
        isExpanded={false}
        onExpand={() => {}}
        onAction={onAction}
        onBuildCard={onBuildCard}
        onUpdateDescription={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: new RegExp(ACTION_BUTTONS.CARD_ACTION.production, "i") }));
    expect(onBuildCard).toHaveBeenCalledWith("card-1");
    expect(onAction).not.toHaveBeenCalled();
  });

  it("Build button falls through to onAction when card is not finalized", () => {
    const onAction = vi.fn();
    const onBuildCard = vi.fn();
    const unfinalizedCard: MapCard = {
      ...baseCard,
      status: "todo",
      finalized_at: null,
    };

    render(
      <ImplementationCard
        card={unfinalizedCard}
        isExpanded={false}
        onExpand={() => {}}
        onAction={onAction}
        onBuildCard={onBuildCard}
        onUpdateDescription={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: new RegExp(ACTION_BUTTONS.CARD_ACTION.todo, "i") }));
    expect(onAction).toHaveBeenCalledWith("card-1", "build");
    expect(onBuildCard).not.toHaveBeenCalled();
  });

  it("Finalize button shown when unfinalized todo and onFinalizeCard provided", () => {
    const onFinalizeCard = vi.fn();
    const unfinalizedCard: MapCard = {
      ...baseCard,
      status: "todo",
      finalized_at: null,
    };

    render(
      <ImplementationCard
        card={unfinalizedCard}
        isExpanded={false}
        onExpand={() => {}}
        onAction={() => {}}
        onFinalizeCard={onFinalizeCard}
        onUpdateDescription={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: new RegExp(ACTION_BUTTONS.FINALIZE_CARD, "i") }));
    expect(onFinalizeCard).toHaveBeenCalledWith("card-1");
  });

  it("Merge feature button calls onAction('merge') for completed build", () => {
    const onAction = vi.fn();
    const completedCard: MapCard = {
      ...baseCard,
      status: "todo",
      finalized_at: "2026-02-18T00:00:00Z",
      build_state: "completed",
    };

    render(
      <ImplementationCard
        card={completedCard}
        isExpanded={false}
        onExpand={() => {}}
        onAction={onAction}
        onBuildCard={() => {}}
        onUpdateDescription={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: new RegExp(ACTION_BUTTONS.UNIFIED.MERGE_FEATURE, "i") }));
    expect(onAction).toHaveBeenCalledWith("card-1", "merge");
  });

  it("Reply button calls onAction('reply') for questions status", () => {
    const onAction = vi.fn();

    render(
      <ImplementationCard
        card={{ ...baseCard, status: "questions" }}
        isExpanded={false}
        onExpand={() => {}}
        onAction={onAction}
        onUpdateDescription={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: new RegExp(ACTION_BUTTONS.CARD_ACTION.questions, "i") }));
    expect(onAction).toHaveBeenCalledWith("card-1", "reply");
  });

  it("Resume build button calls onResumeBlockedCard when card is blocked", () => {
    const onResumeBlockedCard = vi.fn();
    const blockedCard: MapCard = {
      ...baseCard,
      status: "todo",
      finalized_at: "2026-02-18T00:00:00Z",
      build_state: "blocked",
    };

    render(
      <ImplementationCard
        card={blockedCard}
        isExpanded={false}
        onExpand={() => {}}
        onAction={() => {}}
        onBuildCard={() => {}}
        onResumeBlockedCard={onResumeBlockedCard}
        onUpdateDescription={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Resume build/i }));
    expect(onResumeBlockedCard).toHaveBeenCalledWith("card-1");
  });

  it("shows failure reason when build failed with last_build_error", () => {
    const failedCard: MapCard = {
      ...baseCard,
      status: "todo",
      finalized_at: "2026-02-18T00:00:00Z",
      build_state: "failed",
      last_build_error: "Auto-commit failed: No eligible files to commit",
    };

    render(
      <ImplementationCard
        card={failedCard}
        isExpanded={false}
        onExpand={() => {}}
        onAction={() => {}}
        onBuildCard={() => {}}
        onUpdateDescription={() => {}}
      />,
    );

    expect(screen.getByText("Build failed")).toBeInTheDocument();
    expect(screen.getByText("Failure reason")).toBeInTheDocument();
    expect(screen.getByText("Auto-commit failed: No eligible files to commit")).toBeInTheDocument();
  });

  it("expanded Code Files section has no Build button", () => {
    const finalizedCard: MapCard = {
      ...baseCard,
      status: "todo",
      finalized_at: "2026-02-18T00:00:00Z",
    };

    render(
      <ImplementationCard
        card={finalizedCard}
        isExpanded={true}
        onExpand={() => {}}
        onAction={() => {}}
        onBuildCard={() => {}}
        onUpdateDescription={() => {}}
      />,
    );

    expect(screen.getByText("Code Files to Create/Edit")).toBeInTheDocument();
    const codeFilesSection = screen.getByText("Code Files to Create/Edit").closest("div")!;
    const buttonsInSection = codeFilesSection.querySelectorAll("button");
    const buildButtons = Array.from(buttonsInSection).filter(
      (btn) => btn.textContent?.trim().toLowerCase() === "build"
    );
    expect(buildButtons).toHaveLength(0);
  });
});
