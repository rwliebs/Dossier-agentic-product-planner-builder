import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { Header } from "@/components/dossier/header";

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
    fireEvent.click(screen.getByRole("button", { name: /architecture/i }));
    expect(onViewModeChange).toHaveBeenCalledWith("architecture");
  });
});
