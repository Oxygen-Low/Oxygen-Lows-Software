I have implemented a password leakage checker using the HaveIBeenPwned.org Pwned Passwords API.

Key changes:
- Created `client/lib/hibp.ts` for the k-Anonymity API integration.
- Updated `server/index.ts` Content Security Policy to whitelist `https://api.pwnedpasswords.com`.
- Integrated the check into `client/pages/Auth.tsx` for both signups and a new password recovery flow.
- Updated `client/pages/Account.tsx` and `client/hooks/useAuth.ts` to support the centralized recovery flow in `Auth.tsx`.

Please review the implementation for security, privacy, and UX best practices.
