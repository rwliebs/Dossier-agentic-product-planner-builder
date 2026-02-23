/**
 * User Story Mapping skill.
 * Injected into the planning agent so it follows backbone → activities → cards ordering.
 * @see https://www.skillsmith.app/
 */

export const USER_STORY_MAPPING_SKILL = `
## User Story Mapping (structure)

- **Backbone**: Left-to-right order of user activities (what they do), not system features. Build the backbone first.
- **Activities**: Columns under each backbone step — the "jobs" or tasks the user does in that part of the journey. User-centric, not technical.
- **Cards**: Specific capabilities that support an activity. One card = one slice of value; small enough to build and test.
- **Ordering**: Horizontal = user journey order. Vertical under an activity = priority (top = MVP, below = later).
- **When generating**: Create workflows as backbone steps, activities as columns, cards as implementable slices. Avoid technical workflow names; use user-outcome names (e.g. "Find and compare" not "Search API").
- **Avoid**: Too many cards per activity; huge cards; workflows that are system modules instead of user journeys.
`.trim();
