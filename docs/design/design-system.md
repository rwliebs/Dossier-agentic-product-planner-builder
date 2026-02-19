---
document_id: doc.design-system
last_verified: 2026-02-18
tokens_estimate: 400
tags:
  - design
  - components
  - ui
ttl_expires_on: null
---
# Design System Reference

**Anchors**: [SYSTEM_ARCHITECTURE.md](../SYSTEM_ARCHITECTURE.md), [user-workflows-reference.md](../product/user-workflows-reference.md)

## Contract

### Invariants
- INVARIANT: Single source for colors, typography, spacing, components
- INVARIANT: Component patterns: Purpose, Props, Example, Accessibility

### Boundaries
- ALLOWED: Define design tokens, component specs, interaction patterns
- FORBIDDEN: Implementation-specific code; use reference patterns only

---

## Implementation

### Color Tokens
- Use Tailwind/shadcn semantic tokens: `primary`, `secondary`, `muted`, `accent`, `destructive`
- Prefer `text-foreground`, `bg-background`, `border-border` for consistency

### Typography
- Headings: `font-mono font-bold` for technical content; `font-sans` for prose
- Body: `text-sm` or `text-xs` for dense UI

### Spacing
- Use Tailwind spacing scale: `p-2`, `p-3`, `p-4`; `gap-2`, `gap-3`
- Consistent padding in cards and panels

### Components
- Check `components/ui/` for shadcn components before creating new ones
- Document Purpose, Props, Example, Accessibility for each pattern
