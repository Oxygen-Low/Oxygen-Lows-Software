## 2024-06-25 - Prevent expensive re-renders in streaming chat

**Learning:** During streaming chat responses, appending characters to the latest message triggers a re-render of the entire list of messages if they are not memoized. In `Chatbot.tsx`, each message contained a heavy `ReactMarkdown` and `SyntaxHighlighter` component, causing severe lag when streaming text to large chat histories.
**Action:** When mapping over long lists that receive frequent updates (like a streaming chat), extract the list items into a `React.memo` component to skip rendering unchanged items.

## 2024-07-08 - Prevent unnecessary O(N) recalculations when filtering lists

**Learning:** When filtering lists based on a search string, keeping the transformation (e.g., `.toLowerCase()`) inside the `.filter()` callback forces O(N) unnecessary string re-allocations on every render.
**Action:** Memoize filtered results with `useMemo` and extract static transformations outside the filter callback (e.g., `const searchLower = search.toLowerCase();`) to improve rendering performance without sacrificing readability.

## 2026-05-25 - Persistent Font System

**Learning:** Font systems in React apps should be managed via a global context (like ThemeContext) to ensure consistency across pages. Storing these preferences in Supabase allowed for session persistence.
**Action:** Implemented a font state in ThemeContext, synchronized with Supabase, and applied via document.documentElement classes.

## 2026-07-12 - AI Horde Model Connectivity

**Learning:** AI Horde models require server-side endpoint /api/ai/styles instead of Supabase RPC get_chat_styles, and user_integrations lookup should use maybeSingle() to handle anonymous mode.
**Action:** Migrated Chatbot and AiScreenshare to use the server API and handle missing integration records.

## 2026-07-12 - [Express 5 Wildcard Route Crash]

**Learning:** In Express 5, the wildcard route path "_" is no longer supported and throws a PathError at runtime because path-to-regexp v8 require named parameters or regular expressions for wildcards.
**Action:** Use the regular expression /._/ for catch-all routes (e.g., for SPA routing) instead of the string "*".

## 2026-07-12 - [Optimizing List Filtering Performance]

**Learning:** Pre-computing mapping properties inside `useMemo` avoids redundant string operations like `.toLowerCase()`, `.split()`, `.pop()`, and `.includes()` that are otherwise evaluated on every keystroke when they are placed directly inside `.filter()` operations.
**Action:** Lift static map-like data derivation into a dependency-bound `useMemo` array that the search `.filter()` function then utilizes, changing complex O(N) operations on each keystroke to just one `O(N)` computation plus simple string inclusion checks on each keystroke.
