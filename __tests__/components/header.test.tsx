import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { Header } from "@/components/dossier/header";
import { ACTION_BUTTONS } from "@/lib/constants/action-buttons";

describe("Header", () => {
  it("renders and toggles architecture view", () => {
    const onViewModeChange = vi.fn();

    render(
      <Header
        viewMode="functionality"
        onViewModeChange={onViewModeChange}
        agentStatus="idle"
      />,
    );

    expect(screen.getByText("DOSSIER")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(ACTION_BUTTONS.VIEW_MODE.architecture, "i") }));
    expect(onViewModeChange).toHaveBeenCalledWith("architecture");
  });
});
