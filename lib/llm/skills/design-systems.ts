/**
 * Design Systems skill for the Architect agent profile.
 * Injected during finalize for the design-system document only.
 */

export const DESIGN_SYSTEMS_SKILL = `
## Design Systems (apply when producing the design system document)

- **Component taxonomy**: Categorize UI components into atoms (Button, Input, Badge), molecules (FormField, Card, SearchBar), and organisms (Header, Sidebar, DataTable). List only components the project actually needs based on its workflows and cards.
- **Color tokens**: Define a semantic color palette — primary, secondary, accent, success, warning, error, neutral. Specify light/dark values if the project uses dark mode. Use CSS custom properties or Tailwind conventions matching the tech stack.
- **Typography scale**: Define heading levels (h1–h4), body text, small/caption, and code. Specify font family, size, weight, and line-height for each. Match the project's design inspiration.
- **Spacing system**: Define a spacing scale (e.g. 4px base: xs=4, sm=8, md=16, lg=24, xl=32, 2xl=48). Apply consistently to padding, margin, and gap.
- **Layout patterns**: Specify page layouts (sidebar+main, full-width, centered), grid systems, and responsive breakpoints. Define container max-widths.
- **Interaction patterns**: Define how forms validate and show errors, how navigation works (tabs, breadcrumbs, sidebar), how loading states appear, and how feedback is communicated (toasts, inline messages).
- **Iconography**: Recommend an icon set (e.g. Lucide, Heroicons) and specify icon sizing conventions.
- **Derive from context**: Base every decision on the project's design_inspiration field, tech_stack, and the actual UI needs implied by the workflow cards. Never produce a generic design system.
`.trim();
