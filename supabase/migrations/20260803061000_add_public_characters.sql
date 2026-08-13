CREATE TABLE IF NOT EXISTS public.public_characters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uploader_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    original_character_id UUID REFERENCES public.characters(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    display_name TEXT,
    image_url TEXT,
    image_path TEXT,
    short_description TEXT,
    appearance TEXT,
    personality TEXT,
    hidden_description TEXT,
    backstory TEXT,
    is_universe BOOLEAN DEFAULT false,
    downloads INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.public_characters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public characters are viewable by everyone" 
    ON public.public_characters FOR SELECT 
    USING (true);

CREATE POLICY "Users can insert their own public characters" 
    ON public.public_characters FOR INSERT 
    WITH CHECK (auth.uid() = uploader_id);

CREATE POLICY "Users can update their own public characters" 
    ON public.public_characters FOR UPDATE 
    USING (auth.uid() = uploader_id);

CREATE POLICY "Users can delete their own public characters" 
    ON public.public_characters FOR DELETE 
    USING (auth.uid() = uploader_id);

CREATE OR REPLACE FUNCTION increment_public_character_downloads(character_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE public.public_characters
    SET downloads = downloads + 1
    WHERE id = character_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE TABLE IF NOT EXISTS public.public_character_likes (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    public_character_id UUID NOT NULL REFERENCES public.public_characters(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, public_character_id)
);

ALTER TABLE public.public_character_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Likes are viewable by everyone" 
    ON public.public_character_likes FOR SELECT 
    USING (true);

CREATE POLICY "Users can insert their own likes" 
    ON public.public_character_likes FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own likes" 
    ON public.public_character_likes FOR DELETE 
    USING (auth.uid() = user_id);
