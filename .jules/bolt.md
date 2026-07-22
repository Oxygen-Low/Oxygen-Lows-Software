## 2024-05-24 - [Avoid recreating static JSX arrays]

**Learning:** Static arrays that contain JSX elements (e.g. configuring categories or routing with icons) created inside a React component render function are re-allocated on every single render. This forces child components and `useMemo` hooks depending on them to constantly re-evaluate.
**Action:** Always define static configuration structures containing JSX elements outside the component body.

## 2024-05-17 - [ReactMarkdown Memoization Pattern]

**Learning:** In streaming chat interfaces (like `Chatbot.tsx`), placing inline object or function definitions (like the `components` prop for `ReactMarkdown`) inside a `React.memo` wrapped child component causes that heavy component to re-render constantly. This happens because the parent `ChatMessage` is memoized and might try to avoid re-renders, but when it does re-render due to prop changes (like new tokens in `m.content`), it recreates the `components` object, which then forces `ReactMarkdown` (a very heavy component with SyntaxHighlighter) to completely re-render from scratch instead of just updating text.
**Action:** Always extract static configuration objects, such as `ReactMarkdown`'s `components` mappings or custom renderers, outside of the React render body. If they depend on props/state, use `useMemo`. This prevents O(n) re-renders during frequent streaming state updates.
## 2024-07-22 - Extract and Memoize Markdown Rendering in Chat Components
**Learning:** Streaming components in React (like `Chatbot.tsx` and `AiScreenshare.tsx`) that re-render frequently (e.g. on every token) can cause huge performance bottlenecks if expensive child components (like `ReactMarkdown` and `SyntaxHighlighter`) re-render for every message in history. Inline configurations (e.g., passing inline objects to the `components` prop in `ReactMarkdown`) breaks `React.memo` and forces these components to completely re-render on every token update.
**Action:** When working on streaming components in this codebase, ensure individual messages are extracted into a `React.memo` wrapped child component and static configurations (like `memoizedMarkdownComponents`) are hoisted completely outside of the render cycle.
