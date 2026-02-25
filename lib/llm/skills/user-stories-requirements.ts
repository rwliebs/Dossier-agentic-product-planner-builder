/**
 * User Stories & Requirements skill for the Product Manager agent profile.
 * Injected during populate for card and requirement generation.
 */

export const USER_STORIES_REQUIREMENTS_SKILL = `
## User Stories & Requirements (apply when creating cards and requirements)

- **Card as user story**: Each card title should read as a capability the user gains — e.g. "Filter by category", "View order history", "Reset password". Avoid technical titles like "API endpoint" or "Database migration".
- **Acceptance criteria as requirements**: Each requirement (upsertCardKnowledgeItem) is one testable acceptance criterion. Write in the form: "User can [action] and sees [result]" or "When [condition], then [outcome]". Be specific enough that a developer knows when it is done.
- **Thin vertical slices**: Each card should be a thin slice through the stack — touching UI, logic, and data — that delivers one piece of user value. If a card requires more than 2-3 days of work, split it.
- **One card, one job**: Each card serves exactly one user job. Ask: "What progress does the user make by having this card built?" If the answer is two things, split into two cards.
- **Definition of done**: A card is done when all its requirements pass, the feature is accessible to the user, and edge cases (empty states, errors, loading) are handled.
- **Avoid**: Cards that are purely technical ("Set up database"), cards with no user-facing outcome, requirements that are vague ("works well"), duplicate cards across activities.
`.trim();
