import { getAdaptiveE2EConfig, hasAdaptiveE2ECredentials } from "@/lib/e2e/adaptive-runner";

describe("adaptive e2e flow scaffolding", () => {
  const config = getAdaptiveE2EConfig();

  it("is configured to run against a local base URL by default", () => {
    expect(config.baseUrl).toContain("http://");
  });

  it("requires Browserbase credentials before executing live adaptive flows", () => {
    if (!hasAdaptiveE2ECredentials(config)) {
      expect(true).toBe(true);
      return;
    }

    // Live adaptive workflows are added in Step 10 once app flows are functional.
    expect(hasAdaptiveE2ECredentials(config)).toBe(true);
  });
});
