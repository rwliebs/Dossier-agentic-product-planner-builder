export interface AdaptiveE2EConfig {
  baseUrl: string;
  apiKey?: string;
  projectId?: string;
}

export function getAdaptiveE2EConfig(): AdaptiveE2EConfig {
  return {
    baseUrl: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    apiKey: process.env.BROWSERBASE_API_KEY,
    projectId: process.env.BROWSERBASE_PROJECT_ID,
  };
}

export function hasAdaptiveE2ECredentials(config: AdaptiveE2EConfig): boolean {
  return Boolean(config.apiKey && config.projectId);
}
