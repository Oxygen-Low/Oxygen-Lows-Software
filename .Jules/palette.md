## 2024-05-24 - Async Destructive Actions
**Learning:** Icon-only destructive buttons (like trash cans) often lack screen reader support and visual feedback during async operations, which can lead to users double-clicking and triggering errors.
**Action:** Always add `aria-label` and `title` to icon-only buttons. For async actions like deleting files, add a loading state (e.g., `<Loader2 className="animate-spin" />`) and disable the button while the action is in progress to prevent duplicate submissions.
