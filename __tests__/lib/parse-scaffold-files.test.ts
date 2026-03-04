/**
 * Tests for parseScaffoldFiles.
 */

import { describe, it, expect } from "vitest";
import { parseScaffoldFiles } from "@/lib/orchestration/parse-scaffold-files";

describe("parseScaffoldFiles", () => {
  it("extracts path and content from FILE section with fenced block", () => {
    const content = `
# Project Scaffold

### FILE: package.json
\`\`\`json
{
  "name": "app",
  "scripts": { "dev": "next dev" }
}
\`\`\`

### FILE: src/app/page.tsx
\`\`\`tsx
export default function Page() { return <div>Hi</div>; }
\`\`\`
`;
    const result = parseScaffoldFiles(content);
    expect(result).toHaveLength(2);
    expect(result[0].path).toBe("package.json");
    expect(result[0].content).toContain('"name": "app"');
    expect(result[1].path).toBe("src/app/page.tsx");
    expect(result[1].content).toContain("return <div>Hi</div>");
  });

  it("returns empty array for empty or null content", () => {
    expect(parseScaffoldFiles("")).toEqual([]);
    expect(parseScaffoldFiles(null as never)).toEqual([]);
  });

  it("returns empty array when no FILE sections", () => {
    const content = "# Doc\n\nNo FILE sections here.";
    expect(parseScaffoldFiles(content)).toEqual([]);
  });

  it("normalizes path (strips leading slash)", () => {
    const content = `
### FILE: /package.json
\`\`\`
{}
\`\`\`
`;
    const result = parseScaffoldFiles(content);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("package.json");
  });

  it("handles empty code block", () => {
    const content = `
### FILE: .gitignore
\`\`\`
\`\`\`
`;
    const result = parseScaffoldFiles(content);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe(".gitignore");
    expect(result[0].content).toBe("");
  });

  it("matches FILE header case-insensitively", () => {
    const content = `
### file: package.json
\`\`\`
{}
\`\`\`
`;
    const result = parseScaffoldFiles(content);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("package.json");
  });
});
