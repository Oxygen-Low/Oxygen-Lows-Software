-- Add RPCs for follows, followers, and blocks to correctly join profile_pictures

CREATE OR REPLACE FUNCTION public.get_my_follows()
RETURNS TABLE(id UUID, profile JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
    RETURN QUERY
    SELECT
        f.id,
        jsonb_build_object(
            'user_id', p.user_id,
            'username', p.username,
            'display_name', p.display_name,
            'image_url', COALESCE(pp.image_url, NULL),
            'crop_data', pp.crop_data
        ) as profile
    FROM public.follows f
    JOIN public.profiles p ON f.following_id = p.user_id
    LEFT JOIN public.profile_pictures pp ON p.user_id = pp.user_id
    WHERE f.follower_id = auth.uid();
END;
$$;

COMMENT ON FUNCTION public.get_my_follows() IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';


CREATE OR REPLACE FUNCTION public.get_my_followers()
RETURNS TABLE(id UUID, profile JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
    RETURN QUERY
    SELECT
        f.id,
        jsonb_build_object(
            'user_id', p.user_id,
            'username', p.username,
            'display_name', p.display_name,
            'image_url', COALESCE(pp.image_url, NULL),
            'crop_data', pp.crop_data
        ) as profile
    FROM public.follows f
    JOIN public.profiles p ON f.follower_id = p.user_id
    LEFT JOIN public.profile_pictures pp ON p.user_id = pp.user_id
    WHERE f.following_id = auth.uid();
END;
$$;

COMMENT ON FUNCTION public.get_my_followers() IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';


CREATE OR REPLACE FUNCTION public.get_my_blocks()
RETURNS TABLE(id UUID, profile JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
    RETURN QUERY
    SELECT
        b.id,
        jsonb_build_object(
            'user_id', p.user_id,
            'username', p.username,
            'display_name', p.display_name,
            'image_url', COALESCE(pp.image_url, NULL),
            'crop_data', pp.crop_data
        ) as profile
    FROM public.blocks b
    JOIN public.profiles p ON b.blocked_id = p.user_id
    LEFT JOIN public.profile_pictures pp ON p.user_id = pp.user_id
    WHERE b.blocker_id = auth.uid();
END;
$$;

COMMENT ON FUNCTION public.get_my_blocks() IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
