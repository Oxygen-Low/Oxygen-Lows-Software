## 2024-06-25 - Prevent expensive re-renders in streaming chat

**Learning:** During streaming chat responses, appending characters to the latest message triggers a re-render of the entire list of messages if they are not memoized. In `Chatbot.tsx`, each message contained a heavy `ReactMarkdown` and `SyntaxHighlighter` component, causing severe lag when streaming text to large chat histories.
**Action:** When mapping over long lists that receive frequent updates (like a streaming chat), extract the list items into a `React.memo` component to skip rendering unchanged items.

## 2024-07-08 - Prevent unnecessary O(N) recalculations when filtering lists

**Learning:** When filtering lists based on a search string, keeping the transformation (e.g., `.toLowerCase()`) inside the `.filter()` callback forces O(N) unnecessary string re-allocations on every render.
**Action:** Memoize filtered results with `useMemo` and extract static transformations outside the filter callback (e.g., `const searchLower = search.toLowerCase();`) to improve rendering performance without sacrificing readability.
