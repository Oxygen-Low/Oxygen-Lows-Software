## 2024-10-24 - Missing ARIA labels on icon-only buttons
**Learning:** Found a pattern of missing `aria-label`s on icon-only buttons across the app's components, specifically on destructive/closing actions like delete (DataSave.tsx) and close (ArtifactSidebar.tsx). This negatively impacts screen reader users who rely on these labels to understand the button's function.
**Action:** Always verify that icon-only buttons have an `aria-label` attribute describing their function. Ensure `title` is also provided for visual users on hover.
