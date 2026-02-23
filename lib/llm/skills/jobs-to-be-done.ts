/**
 * Jobs-to-be-Done (JTBD) planning skill.
 * Injected into the planning agent so it frames user needs as jobs and outcomes.
 * @see https://www.skillsmith.app/
 */

export const JOBS_TO_BE_DONE_SKILL = `
## Jobs-to-be-Done (use when structuring ideas)

- **Job**: The progress a user is trying to make in a given situation (e.g. "When I'm planning a trip, I want to compare options so I can choose the best fit").
- **Outcome**: The result the user expects; focus on functional, emotional, and social outcomes.
- **Forces**: Push (motivation) and pull (attraction) toward a new solution; anxiety and habit holding them back.
- **When generating workflows and cards**: Prefer framing around the job ("Help me…", "When I… I want to… so I can…") rather than features. Ask "What job is the user hiring this for?" and "What does success look like for them?"
- **Avoid**: Feature-first language. Prefer user-outcome language in titles and descriptions.
`.trim();
