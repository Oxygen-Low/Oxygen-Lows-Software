## 2026-07-26 - Dynamic ID Generation for Forms

**Learning:** When rendering lists of form elements (like API keys per provider), static `htmlFor` / `id` attributes will fail to link uniquely.
**Action:** Always generate unique string IDs by combining the generic label with the item's unique identifier (e.g., `id={"base-url-" + provider.id}`).
