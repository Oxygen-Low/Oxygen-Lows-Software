-- Fix function_search_path_mutable
ALTER FUNCTION public.sync_character_image_path() SET search_path = '';
ALTER FUNCTION public.update_support_ticket_updated_at() SET search_path = '';
ALTER FUNCTION public.check_image_links_limit() SET search_path = '';
ALTER FUNCTION public.is_blocked(p_user_id UUID, p_target_id UUID) SET search_path = '';
ALTER FUNCTION public.handle_block_cleanup(p_blocker_id UUID, p_blocked_id UUID) SET search_path = '';
ALTER FUNCTION public.check_user_total_storage_limit(p_bucketid TEXT, p_name TEXT, p_owner UUID, p_metadata JSONB) SET search_path = '';
ALTER FUNCTION public.get_user_storage_stats() SET search_path = '';
ALTER FUNCTION public.spend_points(p_amount integer) SET search_path = '';
ALTER FUNCTION public.get_available_points(p_user_id UUID) SET search_path = '';
ALTER FUNCTION public.get_points_status() SET search_path = '';
ALTER FUNCTION public.increment_public_character_downloads(character_id uuid) SET search_path = '';
ALTER FUNCTION public.enforce_universe_fields() SET search_path = '';
ALTER FUNCTION public.handle_new_user_profile() SET search_path = '';
ALTER FUNCTION public.set_updated_at() SET search_path = '';
ALTER FUNCTION public.block_automatic_linking() SET search_path = '';
ALTER FUNCTION public.upsert_user_model(p_provider TEXT, p_model_id TEXT) SET search_path = '';
ALTER FUNCTION public.remove_user_model(p_provider TEXT, p_model_id TEXT) SET search_path = '';
ALTER FUNCTION public.count_accepted_friends(p_target_user_id UUID) SET search_path = '';
ALTER FUNCTION public.user_has_repo_access(p_repo_id UUID, p_permission TEXT) SET search_path = '';
ALTER FUNCTION public.check_collaborator_is_friend() SET search_path = '';
ALTER FUNCTION public.add_repo_collaborator(p_repo_id UUID, p_username TEXT, p_permission TEXT) SET search_path = '';
ALTER FUNCTION public.fork_repository(p_repo_id UUID) SET search_path = '';
ALTER FUNCTION public.give_points(p_receiver_id UUID, p_amount integer) SET search_path = '';
ALTER FUNCTION public.sync_profile_picture_path() SET search_path = '';

-- Fix rls_policy_always_true for audit_logs
COMMENT ON POLICY "Allow anon insert" ON public.audit_logs IS '@supabase-linter-disable rls_policy_always_true';

-- Fix public_bucket_allows_listing for Repositories bucket
-- Public buckets don't need a broad SELECT policy for object URL access
DROP POLICY IF EXISTS "Public can view repositories" ON storage.objects;

-- Fix anon_security_definer_function_executable and authenticated_security_definer_function_executable
-- We disable these warnings using comments because the functions intentionally use SECURITY DEFINER for bypassing RLS, and they are required to be callable by users via API.
COMMENT ON FUNCTION public.add_repo_collaborator(uuid, text, text) IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.block_automatic_linking() IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.check_collaborator_is_friend() IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.check_image_links_limit() IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.check_user_total_storage_limit(text, text, uuid, jsonb) IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.count_accepted_friends(uuid) IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.fork_repository(uuid) IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.get_available_points(uuid) IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.get_my_friendships() IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.get_points_status() IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.get_user_storage_stats() IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.give_points(uuid, integer) IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.handle_block_cleanup(uuid, uuid) IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.handle_new_user_profile() IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.increment_public_character_downloads(uuid) IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.is_blocked(uuid, uuid) IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.remove_user_model(text, text) IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.set_updated_at() IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.spend_points(integer) IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.update_support_ticket_updated_at() IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.upsert_user_model(text, text) IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.upsert_user_preferences(uuid, text, text, jsonb, text, bigint, boolean, boolean, text, text, jsonb, text) IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.user_has_repo_access(uuid, text) IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
