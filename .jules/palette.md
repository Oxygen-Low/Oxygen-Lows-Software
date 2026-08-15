## 2024-05-18 - Added confirmation dialog to destructive file deletion
**Learning:** Users can accidentally delete their cloud files when clicking the trash icon, as there's no confirmation step. The icon-only button also lacked an ARIA label.
**Action:** Wrap destructive actions like file deletion in an `AlertDialog` and ensure icon-only buttons have descriptive `aria-label` attributes to prevent unintentional data loss and improve accessibility.
