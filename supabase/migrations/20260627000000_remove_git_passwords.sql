-- Remove git password related objects

-- Drop functions first to avoid dependency issues
DROP FUNCTION IF EXISTS public.upsert_repository_password(UUID, TEXT);
DROP FUNCTION IF EXISTS public.verify_repository_password(TEXT);
DROP FUNCTION IF EXISTS public.verify_repository_password(TEXT, TEXT);

-- Drop the table
DROP TABLE IF EXISTS public.repository_passwords;
