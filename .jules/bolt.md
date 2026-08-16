## 2024-08-16 - Prevented Unnecessary Re-renders in Minesweeper

**Learning:** Extracting state (like a timer) that updates frequently into its own component prevents the parent component and all its other children from re-rendering. In Minesweeper, a timer updating every second was causing the entire board (up to 10,000 cells) to re-render.
**Action:** When working on components with frequent state updates (like timers, animations, scroll positions), always isolate that state into a separate component so that the entire tree does not re-render unnecessarily. React's `key` prop can also be used to unmount/remount the child component to reset its state cleanly.
