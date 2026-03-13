# Delight Strategy — Dossier

**Approach:** Subtle sophistication. Delight amplifies clarity and confidence; it never blocks or distracts. Tone is professional and aligned with "architectural precision."

**Brand:** AI-Native Product Building Platform. Audience: teams and builders shipping product with AI. Personality: precise, capable, calm.

---

## Principles

- **Quick:** Delight moments &lt; 1 second; no delay to core actions.
- **Skippable:** Animations respect `prefers-reduced-motion`; copy stays clear.
- **Appropriate:** Celebrate success, soften errors, encourage empty states; never playful during critical failures.
- **Compound:** Rotating messages and small surprises stay fresh with repeated use.

---

## Audit: Surfaces and Treatments

| Surface | Type | Treatment |
|--------|------|-----------|
| **Ideation empty state** | Empty | Gentle fade-in + slide-up; "Your canvas is ready." |
| **Map loading** | Loading | Rotating messages ("Loading map…", "Structuring workflows…", "Preparing your canvas…"); map fades in when ready. |
| **Map error** | Error | Clear message + supportive line + Retry; optional brief encouragement. |
| **MapErrorBoundary** | Error | "Map failed to load" + empathetic subline + Reload map. |
| **ChatErrorBoundary** | Error | "Chat unavailable" + empathetic subline + Try again. |
| **ErrorBoundary (generic)** | Error | "Something went wrong" + optional soft subline. |
| **Not found** | Error | "This page could not be found." + one gentle line. |
| **Right panel — Docs empty** | Empty | "Select a context doc to view" + "Pick one from the list or add one via the Agent chat." |
| **Right panel — Doc content** | Empty | "(empty)" → "No content in this file." |
| **Right panel — Files loading** | Loading | "Loading files…" above skeleton when loading. |
| **Story map — Scaffolded workflows** | Empty | Encouraging line + subtle entrance for empty block. |
| **Setup success** | Success | Checkmark + "Keys saved. Redirecting…" with fade-in. |
| **Buttons** | Interaction | Hover lift, active press; `motion-reduce:transform-none`. |
| **Confirm delete** | Destructive | No delight; keep clear and minimal. |
| **Toasts** | Success/Error | Rely on Sonner defaults; keep copy actionable. |

---

## Implementation Notes

- **Animation:** Use `animate-in fade-in` / `slide-in-from-bottom-2` (tw-animate-css) and `duration-300`–`500`.
- **Copy:** One extra line per surface max; professional, warm, not cute.
- **Loading text:** Rotate every 2.5s where applicable; 3–4 variants.
- **Accessibility:** `motion-reduce:transform-none` on interactive delight; no animation-only information.

---

## Maintenance

- When adding new empty or loading states, add a one-line encouragement or rotating message.
- Keep error copy consistent: state what happened, then one supportive or next-step line.
- Review annually for tone and appropriateness.
