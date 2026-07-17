## 2025-02-28 - Add missing ARIA labels to Music Player
**Learning:** Icon-only buttons without `aria-label` or `title` attributes are completely inaccessible to screen readers and difficult for sighted users to identify. When adding ARIA attributes to toggle buttons (like "Shuffle"), it is important to include `aria-pressed` to communicate the active state to assistive technologies.
**Action:** Always add `aria-label` and `title` to icon-only buttons. For stateful toggle buttons, implement `aria-pressed={state}` dynamically.
