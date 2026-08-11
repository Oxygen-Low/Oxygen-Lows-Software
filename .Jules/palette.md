## 2024-08-11 - Add ARIA Labels and States to Icon-Only Buttons
**Learning:** Icon-only buttons (like chevron toggles or + icons for menus) often miss critical context for screen readers in complex applications like this chatbot. Specifically, missing `aria-expanded` attributes on toggles make it hard to understand state changes.
**Action:** Always ensure icon-only interactive elements in dynamic interfaces have clear `aria-label` or `title` attributes, and use `aria-expanded` for stateful toggles that expand/collapse content.
