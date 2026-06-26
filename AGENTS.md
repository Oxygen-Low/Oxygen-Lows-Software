# Engineering Guidelines

## Supabase Service Role Key
- **Do not require `SUPABASE_SERVICE_ROLE_KEY` on the server.** The application is designed to run without it to improve portability and security.
- Use `getAuthenticatedClient(token)` to perform operations on behalf of the user when a JWT is available.
- Use the standard `supabase` (anon) client for public operations or when a user JWT is not available (e.g., git password authentication).
- Ensure that Row Level Security (RLS) policies in the database are correctly configured to allow necessary operations via the `anon` or `authenticated` roles.
- For profile lookups, the `public.profiles` table should be viewable by the `anon` role to support git identity and authentication workflows.

## Backend Development
- All repository management logic should prioritize user-authenticated Supabase clients.
- Avoid bypassing RLS unless absolutely necessary for system-level tasks that cannot be handled via policies.
