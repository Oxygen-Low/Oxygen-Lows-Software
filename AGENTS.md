# LLM Agent Guidelines

## Security (verified Nov 2026)

-- IDOR / broken access control: every user-scoped file/table read or write must verify the caller owns the resource on the server. Never trust client-supplied `user_id`, server/channel/DM ids, or storage path prefixes alone; route checks like `canReadPath` must match the actual file served. Do not add "fallbacks" that drop the owner segment of a storage path. For chat, verify DM participation and server membership (owner/member, or public server for reads) before reading or posting.
-- Friendships: never let a sender self-accept. At the API boundary (`server/routes/data.ts`), new `friendships`/`friends` rows must start `pending`; only the recipient (`friend_id`) may transition to `accepted`. Never let a caller forge another user's `blocker_id`. Note: `insertTable`/`upsertTable`/`updateTable` are also used as trusted internal fixtures (e.g. `tests/e2e/game-library.spec.ts`), so the consent check lives in the router, not the store — do not re-add it to the store.
-- Cross-user queries: never loan out all-users data to satisfy filters that mention another `user_id`. User tables must stay scoped to the requester (`getTableRows(table, userId)`); filters apply after scoping.
-- Filter operators: never build `new RegExp` directly from user-supplied `like`/`ilike` values. Escape regex metacharacters, then translate SQL-LIKE `%`/`_` only, and cap pattern length.
-- SSRF: never call `fetch()` on a URL derived from untrusted input or a third-party worker response (e.g. Horde `gen.img`). Route through `fetchPublicUrl` (public-only, per-redirect validation, DNS pinning, size cap) or `validateAiUrl`. Never duplicate a naive hostname blocklist — it misses IPv6, encoded IPs, and DNS rebinding; reuse `server/lib/safeAiUrl.ts` / `server/lib/publicFetch.ts`. Outbound fetches need timeouts and size caps.
-- Auth/transient tokens: brute-forceable 6-char codes (quick sign-in) must be rate-limited. Never echo internal/upstream error detail to clients (`e.message`); log server-side, return generic errors. Prefer `Authorization` headers over `?token=` URLs.
-- Run the regression suite after security changes: `pnpm exec vitest run server/lib/dataStore.securityFix.test.ts server/lib/storage.securityFix.test.ts server/lib/dataStore.test.ts server/routes/friends.integration.test.ts server/routes/proxy.spec.ts server/routes/v1.spec.ts server/lib/storage.test.ts` and `pnpm typecheck`.

## Package Versions

-- When making changes to any published packages (e.g., in `packages/defender`), ALWAYS remember to bump the version number in its `package.json`.

## Translations

-- When making changes or adding text that users would see, add translations to every language.

## App Name

-- The app/website is NOT named "Oxygen Low"; it is named "Oxygen Low's Software".

## Hono Routing

-- NEVER add a root route (e.g., `app.get("/")`) in `server/index.ts`. This intercepts the request and prevents the Vite SPA from loading in production. The root route is already correctly handled by a fallback in `server/serve.ts`.

## Pnpm

-- Use pnpm for dependency installation, testing, building, etc. Don't use npm, bun, etc unless required.
