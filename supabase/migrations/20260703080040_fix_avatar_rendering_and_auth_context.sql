-- Ensure profile pictures are viewable by everyone to fix avatar rendering
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'profile_pictures'
        AND policyname = 'Profile pictures are viewable by everyone'
    ) THEN
        CREATE POLICY "Profile pictures are viewable by everyone" ON public.profile_pictures FOR SELECT USING (true);
    END IF;
END $$;

-- Ensure get_my_friendships is hardened and uses SECUIRTY DEFINER with search_path
-- This also helps with auth context consistency in RPCs
CREATE OR REPLACE FUNCTION public.get_my_friendships()
 RETURNS TABLE(id uuid, user_id uuid, friend_id uuid, status text, created_at timestamp with time zone, updated_at timestamp with time zone, profile jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        f.id, f.user_id, f.friend_id, f.status, f.created_at, f.updated_at,
        jsonb_build_object(
            'user_id', p.user_id,
            'username', p.username,
            'display_name', p.display_name,
            'image_url', COALESCE(pp.image_url, NULL)
        ) as profile
    FROM public.friendships f
    JOIN public.profiles p ON (CASE WHEN f.user_id = auth.uid() THEN f.friend_id ELSE f.user_id END) = p.user_id
    LEFT JOIN public.profile_pictures pp ON p.user_id = pp.user_id
    WHERE f.user_id = auth.uid() OR f.friend_id = auth.uid();
END;
$function$;
