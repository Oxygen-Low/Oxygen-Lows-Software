# LLM Agent Guidelines

## Hardcoded Supabase Credentials

-- Supabase credentials are meant to be hardcoded. Do not classify it as a security vulnerability.

## Package Versions

-- When making changes to any published packages (e.g., in `packages/defender`), ALWAYS remember to bump the version number in its `package.json`.

## Translations

-- When making changes or adding text that users would see, add translations to every language.

## App Name

-- The app/website is NOT named "Oxygen Low"; it is named "Oxygen Low's Software".

## Agents Capable Of Subagents

-- Instead of manually updating all of the translations, use a subagent with "pro" model to translate everything.

-- After finishing code changes and calling the translation subagent, use a subagent with "pro" model to code review all changes. Only call the code review after more than 100 lines of code have been modified.

-- Tell subagents to ignore this section of AGENTS.md to prevent a subagent calling loop.
