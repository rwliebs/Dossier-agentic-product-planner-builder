describe("projects API contract (TDD red)", () => {
  it("returns project list payload from GET /api/projects", async () => {
    const response = await fetch("http://localhost:3000/api/projects");
    expect(response.status).toBe(200);
  });
});
