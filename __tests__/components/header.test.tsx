import React from "react";
import { render, screen } from "@testing-library/react";
import { Header } from "@/components/dossier/header";

describe("Header", () => {
  it("renders title and settings", () => {
    render(
      <Header
        viewMode="functionality"
        onViewModeChange={vi.fn()}
        agentStatus="idle"
        selectedProjectId=""
        onSelectProjectId={vi.fn()}
      />,
    );

    expect(screen.getByText("DOSSIER")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /settings/i })).toBeInTheDocument();
  });
});
