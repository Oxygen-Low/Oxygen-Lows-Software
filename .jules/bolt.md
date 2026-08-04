## 2024-05-24 - [Avoid recreating static JSX arrays]

**Learning:** Static arrays that contain JSX elements (e.g. configuring categories or routing with icons) created inside a React component render function are re-allocated on every single render. This forces child components and `useMemo` hooks depending on them to constantly re-evaluate.
**Action:** Always define static configuration structures containing JSX elements outside the component body.

## 2024-05-17 - [ReactMarkdown Memoization Pattern]

**Learning:** In streaming chat interfaces (like `Chatbot.tsx`), placing inline object or function definitions (like the `components` prop for `ReactMarkdown`) inside a `React.memo` wrapped child component causes that heavy component to re-render constantly. This happens because the parent `ChatMessage` is memoized and might try to avoid re-renders, but when it does re-render due to prop changes (like new tokens in `m.content`), it recreates the `components` object, which then forces `ReactMarkdown` (a very heavy component with SyntaxHighlighter) to completely re-render from scratch instead of just updating text.
**Action:** Always extract static configuration objects, such as `ReactMarkdown`'s `components` mappings or custom renderers, outside of the React render body. If they depend on props/state, use `useMemo`. This prevents O(n) re-renders during frequent streaming state updates.

## 2024-05-30 - [Avoid redundant array traversals for state splitting]

**Learning:** When fetching raw data (e.g. `fData` array) that needs to be separated into multiple state arrays (like accepted friends, pending incoming, and pending outgoing), using multiple `Array.filter()` calls causes redundant O(N) traversals on every render or data load.
**Action:** Always refactor multiple `Array.filter()` calls into a single `Array.reduce()` or `Array.forEach()` loop to process the data in one O(N) pass, pushing each item into the appropriate temporary array before setting state.

## 2024-06-25 - [O(N²) Redundant filtering in React array mapping]

**Learning:** Inside rendering blocks or `useMemo` hooks (such as calculating nested siblings in `Chatbot.tsx`), using `.find()` or `.filter()` on the full dataset while mapping over the same dataset creates an O(N²) time complexity bottleneck. This drastically degrades performance during frequent streaming updates on long lists.
**Action:** Always pre-calculate parent-child or relational mappings into O(1) hash maps (e.g. `Record<string, Item[]>`) using a single O(N) pass inside a `useMemo` block, and use these map lookups in the render loop instead of iterating the entire array repeatedly.
