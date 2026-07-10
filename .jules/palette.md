## 2024-03-24 - Accessibility focus-visible state improvements
**Learning:** Adding custom `focus-visible` outline styles (e.g., `focus-visible:ring-2 focus-visible:ring-cyan-500/50`) to elements that already have an `opacity-0` class (like the Delete Chat button) requires explicit resetting with `focus-visible:opacity-100` so the button actually becomes visible when focused via keyboard.
**Action:** When adding focus states to hidden or hover-only UI elements, always ensure their visibility/opacity state is properly restored on focus using `focus-visible:opacity-100` or equivalent.

## $(date +%Y-%m-%d) - Focus Visible Styles on Icon Buttons
**Learning:** Icon-only buttons with hover effects (e.g. `hover:bg-primary/20`) often lack sufficient visual feedback when navigated via keyboard.
**Action:** Always pair `aria-label` additions on icon buttons with explicit keyboard focus indicators, such as Tailwind's `focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none`.
