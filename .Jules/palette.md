## 2024-10-27 - Icon-only Destructive Buttons Accessibility

**Learning:** Icon-only buttons (like Trash icons for delete actions) often lack `aria-label` and `title` attributes in React components, making them completely inaccessible to screen reader users and confusing for standard users on hover, especially for destructive actions where context is critical.
**Action:** Always verify that buttons lacking visible text (using only icons, like Lucide icons) include an explicit `aria-label` to provide context for assistive technologies and a `title` to provide a tooltip for mouse users.
