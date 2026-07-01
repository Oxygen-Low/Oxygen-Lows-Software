-- Ensure repositories are correctly linked to profiles for public view
-- This allows fetching the owner's username even for anonymous users

-- We use a DO block to safely manage the foreign key constraint
DO $$
BEGIN
    -- Drop the old constraint if it exists to ensure we can recreate it correctly
    IF EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_name = 'repositories'
        AND constraint_name = 'repositories_owner_profiles_fkey'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.repositories DROP CONSTRAINT repositories_owner_profiles_fkey;
    END IF;

    -- Add the new constraint
    ALTER TABLE public.repositories
    ADD CONSTRAINT repositories_owner_profiles_fkey
    FOREIGN KEY (owner_id) REFERENCES public.profiles(user_id)
    ON DELETE CASCADE;
END $$;
