-- Add is_universe to characters
ALTER TABLE public.characters ADD COLUMN IF NOT EXISTS is_universe BOOLEAN DEFAULT false;

-- Add universe_id to chats
ALTER TABLE public.chats ADD COLUMN IF NOT EXISTS universe_id UUID REFERENCES public.characters(id) ON DELETE SET NULL;
