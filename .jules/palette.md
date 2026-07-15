## 2024-07-25 - Missing ARIA Labels on Icon Buttons
**Learning:** Found multiple instances where icon-only buttons (`<Button size="icon">`) like `Copy` and `Close` (`X`) lacked `aria-label` or `title` attributes, particularly in complex applications like the Chatbot and Artifact Sidebar. This prevents screen readers from announcing their purpose.
**Action:** Always verify that `<Button size="icon">` usages have an `aria-label` and preferably a `title` attribute for tooltip visibility to ensure both screen reader support and mouse user understanding.
