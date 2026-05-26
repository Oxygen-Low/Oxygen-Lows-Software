I have implemented the fix for GitLab OAuth invalid scope error.
Changes:
- Added explicit `read_user` scope for GitLab in `client/hooks/useAuth.ts`.
- Added explicit `email profile openid` scopes for Google in `client/hooks/useAuth.ts`.
- Updated tests in `client/hooks/useAuth.spec.ts` to match the changes.
