-- Ensure repositories are correctly linked to profiles for public view
-- This allows fetching the owner's username even for anonymous users

ALTER TABLE public.repositories
DROP CONSTRAINT IF EXISTS repositories_owner_profiles_fkey;

ALTER TABLE public.repositories
ADD CONSTRAINT repositories_owner_profiles_fkey
FOREIGN KEY (owner_id) REFERENCES public.profiles(user_id)
ON DELETE CASCADE;
