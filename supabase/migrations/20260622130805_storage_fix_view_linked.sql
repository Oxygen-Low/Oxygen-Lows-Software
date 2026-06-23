-- Allow authenticated users to view profile pictures and character images
-- This ensures they are not "public" (exposed to anyone) but visible to app users
CREATE POLICY "Authenticated users can view linked images" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'Storage' AND (
    (auth.uid())::text = owner_id OR
    EXISTS (SELECT 1 FROM public.profile_pictures WHERE image_path = name AND user_id = auth.uid()) OR
    EXISTS (SELECT 1 FROM public.characters WHERE image_path = name AND user_id = auth.uid()) OR
    EXISTS (SELECT 1 FROM public.user_preferences WHERE profile_picture_path = name AND user_id = auth.uid())
  )
);
