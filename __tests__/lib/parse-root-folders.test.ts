/**
 * Tests for parseRootFoldersFromArchitecturalSummary.
 */

import { describe, it, expect } from "vitest";
import { parseRootFoldersFromArchitecturalSummary } from "@/lib/orchestration/parse-root-folders";

describe("parseRootFoldersFromArchitecturalSummary", () => {
  it("extracts folder paths from Root folder structure section", () => {
    const content = `
# Architectural Summary

Tech stack: Next.js, React.

## Root folder structure
- app/
- components/
- lib/

## Other section
- ignore this
`;
    const result = parseRootFoldersFromArchitecturalSummary(content);
    expect(result).toEqual(["app", "components", "lib"]);
  });

  it("returns empty array when section is missing", () => {
    const content = "# Architectural Summary\n\nNo root folder section.";
    const result = parseRootFoldersFromArchitecturalSummary(content);
    expect(result).toEqual([]);
  });

  it("returns empty array for empty content", () => {
    expect(parseRootFoldersFromArchitecturalSummary("")).toEqual([]);
    expect(parseRootFoldersFromArchitecturalSummary(null as never)).toEqual([]);
  });

  it("normalizes paths (strips leading/trailing slashes)", () => {
    const content = `
## Root folder structure
- /app/
- components
- lib/
`;
    const result = parseRootFoldersFromArchitecturalSummary(content);
    expect(result).toEqual(["app", "components", "lib"]);
  });

  it("deduplicates folders", () => {
    const content = `
## Root folder structure
- app/
- app/
- components/
`;
    const result = parseRootFoldersFromArchitecturalSummary(content);
    expect(result).toEqual(["app", "components"]);
  });
});
