## 2024-05-24 - [Avoid recreating static JSX arrays]

**Learning:** Static arrays that contain JSX elements (e.g. configuring categories or routing with icons) created inside a React component render function are re-allocated on every single render. This forces child components and `useMemo` hooks depending on them to constantly re-evaluate.
**Action:** Always define static configuration structures containing JSX elements outside the component body.
