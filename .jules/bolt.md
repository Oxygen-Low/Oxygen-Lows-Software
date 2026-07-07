## 2024-06-25 - Prevent expensive re-renders in streaming chat

**Learning:** During streaming chat responses, appending characters to the latest message triggers a re-render of the entire list of messages if they are not memoized. In `Chatbot.tsx`, each message contained a heavy `ReactMarkdown` and `SyntaxHighlighter` component, causing severe lag when streaming text to large chat histories.
**Action:** When mapping over long lists that receive frequent updates (like a streaming chat), extract the list items into a `React.memo` component to skip rendering unchanged items.
