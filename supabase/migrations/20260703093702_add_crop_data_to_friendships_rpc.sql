-- Update get_my_friendships to include crop_data in the profile object
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
            'image_url', COALESCE(pp.image_url, NULL),
            'crop_data', pp.crop_data
        ) as profile
    FROM public.friendships f
    JOIN public.profiles p ON (CASE WHEN f.user_id = auth.uid() THEN f.friend_id ELSE f.user_id END) = p.user_id
    LEFT JOIN public.profile_pictures pp ON p.user_id = pp.user_id
    WHERE f.user_id = auth.uid() OR f.friend_id = auth.uid();
END;
$function$;
