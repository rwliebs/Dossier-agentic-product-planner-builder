/**
 * Value Prioritization skill for the Product Manager agent profile.
 * Injected during populate for activity ordering and card priority.
 */

export const VALUE_PRIORITIZATION_SKILL = `
## Value Prioritization (apply when ordering activities and setting card priority)

- **User value first**: Order activities left-to-right by how early the user encounters them in their journey. The leftmost activity is the entry point; the rightmost is the outcome or exit.
- **MVP slice**: Cards with priority 1 (high) form the MVP — the minimum set that makes the workflow usable end-to-end. Priority 2 cards enhance the experience. Priority 3 cards are nice-to-have.
- **MoSCoW mapping**: Priority 1 = Must have (workflow breaks without it). Priority 2 = Should have (significantly better with it). Priority 3 = Could have (polish and delight).
- **Job completion**: Prioritize cards that help the user complete their core job over cards that optimize or delight. A user who cannot complete the job will not stay to be delighted.
- **Dependency awareness**: If card B depends on card A being built first, card A should have equal or higher priority. Flag dependencies in card descriptions when they exist.
- **Avoid**: Giving everything priority 1; prioritizing technical infrastructure over user-facing value; creating activities with only priority 3 cards (every activity needs at least one must-have).
`.trim();
