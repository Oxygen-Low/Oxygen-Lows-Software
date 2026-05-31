-- OAuth management for Oxygen Low's Software

CREATE TABLE IF NOT EXISTS public.user_oauth_clients (
    client_id uuid PRIMARY KEY REFERENCES auth.oauth_clients(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now()
);

ALTER TABLE public.user_oauth_clients ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'user_oauth_clients'
        AND policyname = 'Users can view their own oauth client links'
    ) THEN
        CREATE POLICY "Users can view their own oauth client links"
            ON public.user_oauth_clients FOR SELECT
            TO authenticated
            USING (auth.uid() = user_id);
    END IF;
END $$;

-- RPC to create client
CREATE OR REPLACE FUNCTION public.create_oauth_client(
    p_name text,
    p_redirect_uris text,
    p_client_type auth.oauth_client_type
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_client_id uuid;
    v_secret text;
    v_secret_hash text;
    v_user_id uuid;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    v_client_id := gen_random_uuid();

    IF p_client_type = 'confidential' THEN
        v_secret := encode(gen_random_bytes(32), 'hex');
        v_secret_hash := crypt(v_secret, gen_salt('bf'));
    ELSE
        v_secret := NULL;
        v_secret_hash := NULL;
    END IF;

    INSERT INTO auth.oauth_clients (
        id,
        client_name,
        redirect_uris,
        client_type,
        client_secret_hash,
        registration_type,
        grant_types,
        token_endpoint_auth_method,
        created_at,
        updated_at
    ) VALUES (
        v_client_id,
        p_name,
        p_redirect_uris,
        p_client_type,
        v_secret_hash,
        'manual',
        'authorization_code refresh_token',
        CASE WHEN p_client_type = 'confidential' THEN 'client_secret_post' ELSE 'none' END,
        now(),
        now()
    );

    INSERT INTO public.user_oauth_clients (client_id, user_id)
    VALUES (v_client_id, v_user_id);

    RETURN json_build_object(
        'client_id', v_client_id,
        'client_secret', v_secret
    );
END;
$$;

-- RPC to delete client
CREATE OR REPLACE FUNCTION public.delete_oauth_client(p_client_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid;
BEGIN
    v_user_id := auth.uid();

    IF NOT EXISTS (
        SELECT 1 FROM public.user_oauth_clients
        WHERE client_id = p_client_id AND user_id = v_user_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized or client not found';
    END IF;

    DELETE FROM auth.oauth_clients WHERE id = p_client_id;
END;
$$;

-- RPC to update client
CREATE OR REPLACE FUNCTION public.update_oauth_client(
    p_client_id uuid,
    p_name text,
    p_redirect_uris text,
    p_client_type auth.oauth_client_type
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid;
BEGIN
    v_user_id := auth.uid();

    IF NOT EXISTS (
        SELECT 1 FROM public.user_oauth_clients
        WHERE client_id = p_client_id AND user_id = v_user_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized or client not found';
    END IF;

    IF EXISTS (
        SELECT 1 FROM auth.oauth_clients
        WHERE id = p_client_id AND client_type != p_client_type
    ) THEN
        RAISE EXCEPTION 'Changing client_type is not supported in this update function. Please delete and recreate the client if you need to change its type.';
    END IF;

    UPDATE auth.oauth_clients
    SET
        client_name = p_name,
        redirect_uris = p_redirect_uris,
        token_endpoint_auth_method = CASE WHEN p_client_type = 'confidential' THEN 'client_secret_post' ELSE 'none' END,
        updated_at = now()
    WHERE id = p_client_id;
END;
$$;

-- RPC to rotate secret
CREATE OR REPLACE FUNCTION public.rotate_oauth_client_secret(p_client_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid;
    v_secret text;
    v_secret_hash text;
BEGIN
    v_user_id := auth.uid();

    IF NOT EXISTS (
        SELECT 1 FROM public.user_oauth_clients
        WHERE client_id = p_client_id AND user_id = v_user_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized or client not found';
    END IF;

    IF (SELECT client_type FROM auth.oauth_clients WHERE id = p_client_id) != 'confidential' THEN
        RAISE EXCEPTION 'Only confidential clients have secrets';
    END IF;

    v_secret := encode(gen_random_bytes(32), 'hex');
    v_secret_hash := crypt(v_secret, gen_salt('bf'));

    UPDATE auth.oauth_clients
    SET
        client_secret_hash = v_secret_hash,
        updated_at = now()
    WHERE id = p_client_id;

    RETURN v_secret;
END;
$$;

-- RPC to list clients
CREATE OR REPLACE FUNCTION public.get_my_oauth_clients()
RETURNS TABLE (
    id uuid,
    client_name text,
    redirect_uris text,
    client_type auth.oauth_client_type,
    created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        c.id,
        c.client_name,
        c.redirect_uris,
        c.client_type,
        c.created_at
    FROM auth.oauth_clients c
    JOIN public.user_oauth_clients uoc ON c.id = uoc.client_id
    WHERE uoc.user_id = auth.uid();
$$;

-- RPC to list grants
CREATE OR REPLACE FUNCTION public.get_my_oauth_grants()
RETURNS TABLE (
    id uuid,
    client_id uuid,
    client_name text,
    scopes text,
    granted_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        og.id,
        og.client_id,
        c.client_name,
        og.scopes,
        og.granted_at
    FROM auth.oauth_consents og
    JOIN auth.oauth_clients c ON og.client_id = c.id
    WHERE og.user_id = auth.uid()
    AND og.revoked_at IS NULL;
$$;

-- RPC to revoke grant
CREATE OR REPLACE FUNCTION public.revoke_oauth_grant(p_grant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE auth.oauth_consents
    SET revoked_at = now()
    WHERE id = p_grant_id AND user_id = auth.uid();
END;
$$;
