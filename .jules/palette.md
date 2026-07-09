
## $(date +%Y-%m-%d) - Focus Visible Styles on Icon Buttons
**Learning:** Icon-only buttons with hover effects (e.g. `hover:bg-primary/20`) often lack sufficient visual feedback when navigated via keyboard.
**Action:** Always pair `aria-label` additions on icon buttons with explicit keyboard focus indicators, such as Tailwind's `focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none`.
