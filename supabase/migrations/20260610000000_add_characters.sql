-- Create characters table
CREATE TABLE IF NOT EXISTS public.characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  image_url TEXT,
  image_path TEXT,
  short_description TEXT,
  appearance TEXT,
  personality TEXT,
  hidden_description TEXT,
  hidden_short_description TEXT,
  backstory TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;

-- Policies
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'characters' AND policyname = 'Users can manage their own characters'
    ) THEN
        CREATE POLICY "Users can manage their own characters"
          ON public.characters
          FOR ALL
          USING (auth.uid() = user_id);
    END IF;
END
$$;

-- Add character selection to chats
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'chats' AND COLUMN_NAME = 'llm_character_id') THEN
        ALTER TABLE public.chats ADD COLUMN llm_character_id UUID REFERENCES public.characters(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'chats' AND COLUMN_NAME = 'user_character_id') THEN
        ALTER TABLE public.chats ADD COLUMN user_character_id UUID REFERENCES public.characters(id) ON DELETE SET NULL;
    END IF;
END
$$;

-- Update check_user_total_storage_limit to include characters (2KB each)
CREATE OR REPLACE FUNCTION public.check_user_total_storage_limit(p_bucketid text, p_name text, p_owner uuid, p_metadata jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  v_total_size BIGINT;
  v_new_size BIGINT;
  v_char_count BIGINT;
  v_current_uid UUID;
BEGIN
  -- Get current user ID from JWT claims if available
  BEGIN
    v_current_uid := (pg_catalog.current_setting('request.jwt.claims', true)::jsonb->>'sub')::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_current_uid := NULL;
  END;

  -- If called by an authenticated user via PostgREST/RPC, ensure they can only check their own storage
  IF v_current_uid IS NOT NULL AND p_owner != v_current_uid THEN
    RETURN false;
  END IF;

  -- Get the size of the new object
  v_new_size := (p_metadata->>'size')::BIGINT;

  -- Calculate existing size for the user in the bucket
  SELECT COALESCE(pg_catalog.SUM((metadata->>'size')::BIGINT), 0)
  INTO v_total_size
  FROM storage.objects
  WHERE bucket_id = p_bucketid
    AND owner_id = p_owner::text;

  -- Count characters and add 2KB each (2048 bytes)
  SELECT pg_catalog.count(*)
  INTO v_char_count
  FROM public.characters
  WHERE user_id = p_owner;

  -- Check if total size (files + characters) exceeds 30MB (30 * 1024 * 1024)
  IF (v_total_size + v_new_size + (v_char_count * 2048)) > 31457280 THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$function$;


-- Revoke PUBLIC and grant to authenticated
REVOKE EXECUTE ON FUNCTION public.check_user_total_storage_limit(text, text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_user_total_storage_limit(text, text, uuid, jsonb) TO authenticated;


-- Add index for user_id
CREATE INDEX IF NOT EXISTS idx_characters_user_id ON public.characters(user_id);

-- Enforce chat character ownership
CREATE OR REPLACE FUNCTION public.fn_check_chat_character_owner()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.llm_character_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.characters WHERE id = NEW.llm_character_id AND user_id = NEW.user_id) THEN
      RAISE EXCEPTION 'llm_character_id does not belong to the chat owner';
    END IF;
  END IF;

  IF NEW.user_character_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.characters WHERE id = NEW.user_character_id AND user_id = NEW.user_id) THEN
      RAISE EXCEPTION 'user_character_id does not belong to the chat owner';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_chat_character_owner') THEN
        CREATE TRIGGER trg_chat_character_owner
        BEFORE INSERT OR UPDATE ON public.chats
        FOR EACH ROW EXECUTE FUNCTION public.fn_check_chat_character_owner();
    END IF;
END
$$;
