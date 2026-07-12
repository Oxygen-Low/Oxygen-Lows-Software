## 2025-05-14 - Aikido Security Badge Integration

**Learning:** When adding security badges or external links to titles, use a flex container with `items-center` to ensure vertical alignment regardless of font size differences.
**Action:** Wrapped the logo text and the badge anchor in a div with `flex items-center gap-4`.

## 2026-07-10 - GitHub Import Modal Row Interaction

**Learning:** Fixed an issue where the "Import" button in the GitHub repository list was cutoff and the row itself was not clickable.
**Action:** Transformed the repository list items into fully clickable button elements with hover states and visual feedback (download icon and loading spinner). This improves accessibility and usability on constrained screens where right-aligned buttons might be hidden.
