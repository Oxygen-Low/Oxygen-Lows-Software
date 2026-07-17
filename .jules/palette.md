## 2023-10-27 - [Add aria-pressed to custom toggles]
**Learning:** Custom toggle buttons and selection items (like themes, fonts, or feature switches) constructed with `button` elements often lack implicit state for screen readers. Using CSS classes alone for visual active state is insufficient for accessibility.
**Action:** Always map the boolean active state of a custom toggle or selection button to the `aria-pressed` attribute (e.g., `aria-pressed={isActive}`). For multi-selection or lists, `aria-selected` within a `role="listbox"` or `role="tablist"` might be more appropriate, but `aria-pressed` is crucial for standalone toggles.
## 2025-02-28 - Add missing ARIA labels to Music Player
**Learning:** Icon-only buttons without `aria-label` or `title` attributes are completely inaccessible to screen readers and difficult for sighted users to identify. When adding ARIA attributes to toggle buttons (like "Shuffle"), it is important to include `aria-pressed` to communicate the active state to assistive technologies.
**Action:** Always add `aria-label` and `title` to icon-only buttons. For stateful toggle buttons, implement `aria-pressed={state}` dynamically.
