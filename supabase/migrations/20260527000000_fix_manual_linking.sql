-- Drop existing triggers first to ensure clean state
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'block_automatic_linking_trigger') THEN
        DROP TRIGGER block_automatic_linking_trigger ON auth.identities;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_identity_insert') THEN
        DROP TRIGGER on_auth_identity_insert ON auth.identities;
    END IF;
END
$$;

-- Update the function to support manual linking authorized by the user
CREATE OR REPLACE FUNCTION public.block_automatic_linking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    existing_identities_count INTEGER;
    user_metadata JSONB;
BEGIN
    -- Check how many identities the user already has
    SELECT count(*) INTO existing_identities_count
    FROM auth.identities
    WHERE user_id = NEW.user_id;

    -- Get user metadata
    SELECT raw_user_meta_data INTO user_metadata
    FROM auth.users
    WHERE id = NEW.user_id;

    -- If the user already has identities and the request is unauthenticated,
    -- it means Supabase is attempting to link a new identity via email match.
    -- We allow it if the user has manually authorized it via metadata flag.
    IF existing_identities_count > 0 AND auth.uid() IS NULL THEN
        IF (user_metadata->>'manual_link_allowed')::boolean IS TRUE THEN
            -- Clear the flag to ensure it's a one-time authorization
            UPDATE auth.users
            SET raw_user_meta_data = raw_user_meta_data - 'manual_link_allowed'
            WHERE id = NEW.user_id;

            RETURN NEW;
        END IF;

        RAISE EXCEPTION 'Account with the same email exists. Please sign in to the existing account.';
    END IF;

    -- If the request is authenticated, ensure the user is linking to their own account.
    IF auth.uid() IS NOT NULL AND auth.uid() <> NEW.user_id THEN
        RAISE EXCEPTION 'You can only link identities to your own account.';
    END IF;

    RETURN NEW;
END;
$$;

-- Re-create a single trigger to enforce security while allowing authorized linking
CREATE TRIGGER on_auth_identity_insert
    BEFORE INSERT ON auth.identities
    FOR EACH ROW
    EXECUTE FUNCTION public.block_automatic_linking();
