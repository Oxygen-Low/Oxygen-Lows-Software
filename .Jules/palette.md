## 2026-07-26 - Dynamic ID Generation for Forms

**Learning:** When rendering lists of form elements (like API keys per provider), static `htmlFor` / `id` attributes will fail to link uniquely.
**Action:** Always generate unique string IDs by combining the generic label with the item's unique identifier (e.g., `id={"base-url-" + provider.id}`).

## 2026-07-26 - Form Input Accessibility Without Labels

**Learning:** When using `<select>` or `<Input>` without a visible `<Label>` next to them, screen readers may not be able to identify what the input is for. In addition, an input control without a proper semantic label is a generic failure in web accessibility (WCAG 2.1 4.1.2 Name, Role, Value).
**Action:** Use `aria-label` to provide an accessible name for inputs or selects if adding a visible label would break the layout or design. Or wrap it using a `<Label>` component.
