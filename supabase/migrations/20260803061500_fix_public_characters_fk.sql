-- Drop the existing foreign key constraint
ALTER TABLE public.public_characters
DROP CONSTRAINT IF EXISTS public_characters_uploader_id_fkey;

-- Add the new foreign key constraint pointing to profiles instead of auth.users
ALTER TABLE public.public_characters
ADD CONSTRAINT public_characters_uploader_id_fkey
FOREIGN KEY (uploader_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;
