-- Secure OAuth management functions

REVOKE ALL ON FUNCTION public.create_oauth_client(text, text, auth.oauth_client_type) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_oauth_client(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_oauth_client(uuid, text, text, auth.oauth_client_type) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rotate_oauth_client_secret(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_oauth_clients() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_oauth_grants() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_oauth_grant(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_oauth_client(text, text, auth.oauth_client_type) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_oauth_client(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_oauth_client(uuid, text, text, auth.oauth_client_type) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_oauth_client_secret(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_oauth_clients() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_oauth_grants() TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_oauth_grant(uuid) TO authenticated;
