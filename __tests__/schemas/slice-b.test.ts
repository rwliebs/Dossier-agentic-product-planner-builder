import {
  contextArtifactValidated,
  cardRequirementSchema,
  cardKnownFactSchema,
  cardAssumptionSchema,
  cardQuestionSchema,
  cardPlannedFileSchema,
  knowledgeItemStatusSchema,
} from "@/lib/schemas/slice-b";

describe("Slice B schema contracts", () => {
  const ids = {
    project: "11111111-1111-4111-8111-111111111111",
    card: "55555555-5555-4555-8555-555555555555",
    artifact: "77777777-7777-4777-8777-777777777777",
  };

  describe("ContextArtifact validation", () => {
    it("validates artifact with content", () => {
      const artifact = contextArtifactValidated.parse({
        id: ids.artifact,
        project_id: ids.project,
        name: "API Design",
        type: "doc",
        content: "# API Design Document\n\nEndpoints...",
      });
      expect(artifact.name).toBe("API Design");
    });

    it("validates artifact with URI", () => {
      const artifact = contextArtifactValidated.parse({
        id: ids.artifact,
        project_id: ids.project,
        name: "Figma Design",
        type: "link",
        uri: "https://figma.com/design/abc123",
      });
      expect(artifact.uri).toBe("https://figma.com/design/abc123");
    });

    it("validates artifact with integration_ref", () => {
      const artifact = contextArtifactValidated.parse({
        id: ids.artifact,
        project_id: ids.project,
        name: "MCP Tool",
        type: "mcp",
        integration_ref: { server: "filesystem", tool: "read_file" },
      });
      expect(artifact.integration_ref).toEqual({ server: "filesystem", tool: "read_file" });
    });

    it("rejects artifact with none of content/uri/integration_ref", () => {
      expect(() =>
        contextArtifactValidated.parse({
          id: ids.artifact,
          project_id: ids.project,
          name: "Invalid",
          type: "doc",
        }),
      ).toThrow();
    });
  });

  describe("CardRequirement validation", () => {
    it("validates requirement with all fields", () => {
      const req = cardRequirementSchema.parse({
        id: "88888888-8888-4888-8888-888888888888",
        card_id: ids.card,
        text: "User must be able to authenticate",
        status: "approved",
        source: "user",
        confidence: 0.95,
        position: 0,
      });
      expect(req.status).toBe("approved");
      expect(req.confidence).toBe(0.95);
    });

    it("validates requirement with minimal fields", () => {
      const req = cardRequirementSchema.parse({
        id: "88888888-8888-4888-8888-888888888888",
        card_id: ids.card,
        text: "API endpoint must support pagination",
        status: "draft",
        source: "agent",
        position: 1,
      });
      expect(req.status).toBe("draft");
    });

    it("validates all knowledge item statuses", () => {
      const statuses = ["draft", "approved", "rejected"];
      statuses.forEach((status) => {
        const req = cardRequirementSchema.parse({
          id: "88888888-8888-4888-8888-888888888888",
          card_id: ids.card,
          text: "Test requirement",
          status,
          source: "user",
          position: 0,
        });
        expect(req.status).toBe(status);
      });
    });
  });

  describe("CardKnownFact validation", () => {
    it("validates fact with evidence source", () => {
      const fact = cardKnownFactSchema.parse({
        id: "88888888-8888-4888-8888-888888888888",
        card_id: ids.card,
        text: "System uses PostgreSQL 15",
        evidence_source: "database.yml",
        status: "approved",
        source: "imported",
        confidence: 0.99,
        position: 0,
      });
      expect(fact.evidence_source).toBe("database.yml");
    });

    it("validates fact without evidence source", () => {
      const fact = cardKnownFactSchema.parse({
        id: "88888888-8888-4888-8888-888888888888",
        card_id: ids.card,
        text: "Feature requires real-time updates",
        status: "draft",
        source: "user",
        position: 1,
      });
      expect(fact.evidence_source).toBeUndefined();
    });
  });

  describe("CardAssumption validation", () => {
    it("validates assumption", () => {
      const assumption = cardAssumptionSchema.parse({
        id: "88888888-8888-4888-8888-888888888888",
        card_id: ids.card,
        text: "Users have stable internet connection",
        status: "approved",
        source: "user",
        position: 0,
      });
      expect(assumption.text).toContain("stable");
    });
  });

  describe("CardQuestion validation", () => {
    it("validates question", () => {
      const question = cardQuestionSchema.parse({
        id: "88888888-8888-4888-8888-888888888888",
        card_id: ids.card,
        text: "What's the performance SLA?",
        status: "draft",
        source: "user",
        position: 0,
      });
      expect(question.text).toContain("performance");
    });
  });

  describe("CardPlannedFile validation", () => {
    it("validates planned file with all fields", () => {
      const file = cardPlannedFileSchema.parse({
        id: "99999999-9999-4999-8999-999999999999",
        card_id: ids.card,
        logical_file_name: "src/components/UserAuth.tsx",
        module_hint: "authentication",
        artifact_kind: "component",
        action: "create",
        intent_summary: "React component for user authentication with OAuth",
        contract_notes: "Must export AuthProvider and useAuth hook",
        status: "proposed",
        position: 0,
      });
      expect(file.logical_file_name).toBe("src/components/UserAuth.tsx");
      expect(file.status).toBe("proposed");
    });

    it("validates planned file kind enum", () => {
      const kinds = ["component", "endpoint", "service", "schema", "hook", "util", "middleware", "job", "config"];
      kinds.forEach((kind) => {
        const file = cardPlannedFileSchema.parse({
          id: "99999999-9999-4999-8999-999999999999",
          card_id: ids.card,
          logical_file_name: `file.${kind}`,
          artifact_kind: kind,
          action: "create",
          intent_summary: "Test",
          status: "proposed",
          position: 0,
        });
        expect(file.artifact_kind).toBe(kind);
      });
    });

    it("validates planned file status enum", () => {
      const statuses = ["proposed", "user_edited", "approved"];
      statuses.forEach((status) => {
        const file = cardPlannedFileSchema.parse({
          id: "99999999-9999-4999-8999-999999999999",
          card_id: ids.card,
          logical_file_name: "test.ts",
          artifact_kind: "component",
          action: "create",
          intent_summary: "Test",
          status,
          position: 0,
        });
        expect(file.status).toBe(status);
      });
    });
  });
});
