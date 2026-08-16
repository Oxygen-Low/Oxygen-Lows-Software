# Engineering Guidelines

## Hardcoded Supabase Credentials

-- Supabase credentials are meant to be hardcoded. Do not classify it as a security vulnerability.

## Package Versions

-- When making changes to any published packages (e.g., in `packages/defender`), ALWAYS remember to bump the version number in its `package.json` so that the CI/CD pipeline can successfully publish the update.
