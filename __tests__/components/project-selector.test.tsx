import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ProjectSelector } from "@/components/dossier/project-selector";

describe("ProjectSelector", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("shows Select project when none selected and no projects loaded", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response);

    render(<ProjectSelector selectedProjectId="" onSelectProjectId={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Select project")).toBeInTheDocument();
    });
  });

  it("shows project name when selected and projects loaded", async () => {
    const projects = [{ id: "p1", name: "My Project", repo_url: null, default_branch: "main" }];
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(projects),
    } as Response);

    render(<ProjectSelector selectedProjectId="p1" onSelectProjectId={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("My Project")).toBeInTheDocument();
    });
  });

  it("opens dropdown with project list when clicked and calls onSelectProjectId on selection", async () => {
    const projects = [
      { id: "p1", name: "Project A", repo_url: null, default_branch: "main" },
      { id: "p2", name: "Project B", repo_url: null, default_branch: "main" },
    ];
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(projects),
    } as Response);

    const onSelect = vi.fn();
    render(<ProjectSelector selectedProjectId="p1" onSelectProjectId={onSelect} />);

    await waitFor(() => {
      expect(screen.getByText("Project A")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Project B")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Project B"));
    expect(onSelect).toHaveBeenCalledWith("p2");
  });
});
