-- This migration exists to sync with the remote database state
-- It ensures that profiles are viewable by everyone

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'profiles'
        AND policyname = 'Anyone can view profiles'
    ) THEN
        CREATE POLICY "Anyone can view profiles" ON public.profiles FOR SELECT TO public USING (true);
    END IF;
END $$;

GRANT SELECT ON public.profiles TO anon;
