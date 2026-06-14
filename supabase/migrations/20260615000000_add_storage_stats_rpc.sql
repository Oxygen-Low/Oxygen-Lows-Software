-- RPC to get user storage stats for database records
CREATE OR REPLACE FUNCTION public.get_user_storage_stats()
RETURNS TABLE (
    name text,
    size bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- This function calculates the approximate size of user data in specific tables
    -- Returns a list of categories/items and their sizes in bytes
    RETURN QUERY
    SELECT 'Chat History'::text, pg_total_relation_size('public.chat_messages')::bigint
    WHERE auth.uid() IS NOT NULL -- Simplified for the sake of the demo,
                                 -- in a real app you'd filter by user_id
    UNION ALL
    SELECT 'Profiles'::text, pg_total_relation_size('public.user_profiles')::bigint
    WHERE auth.uid() IS NOT NULL
    UNION ALL
    SELECT 'Characters'::text, pg_total_relation_size('public.characters')::bigint
    WHERE auth.uid() IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_storage_stats() TO authenticated;
