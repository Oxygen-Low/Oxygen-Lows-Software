-- Migration to synchronize with remote changes: git_auth_username_validation
-- This adds a check constraint to the profiles table to ensure usernames follow a valid format.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.constraint_column_usage
        WHERE table_name = 'profiles'
          AND constraint_name = 'user_profiles_username_format'
          AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.profiles ADD CONSTRAINT user_profiles_username_format CHECK (username ~ '^[a-z0-9_-]+$'::text);
    END IF;
END
$$;
