-- Create battlegrounds_characters table
CREATE TABLE IF NOT EXISTS public.battlegrounds_characters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_public BOOLEAN DEFAULT false,
    spritesheet_url TEXT NOT NULL,
    moveset_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.battlegrounds_characters ENABLE ROW LEVEL SECURITY;

-- Policies for battlegrounds_characters
CREATE POLICY "Battlegrounds characters are viewable by everyone if public."
    ON public.battlegrounds_characters FOR SELECT
    USING (is_public = true OR auth.uid() = user_id);

CREATE POLICY "Users can insert their own battlegrounds characters."
    ON public.battlegrounds_characters FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own battlegrounds characters."
    ON public.battlegrounds_characters FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own battlegrounds characters."
    ON public.battlegrounds_characters FOR DELETE
    USING (auth.uid() = user_id);

-- Create storage bucket for battlegrounds assets
INSERT INTO storage.buckets (id, name, public) 
VALUES ('battlegrounds-assets', 'battlegrounds-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for battlegrounds-assets
CREATE POLICY "Battlegrounds assets are publicly accessible."
    ON storage.objects FOR SELECT
    USING (bucket_id = 'battlegrounds-assets');

CREATE POLICY "Users can upload their own battlegrounds assets."
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'battlegrounds-assets' AND auth.uid() = owner);

CREATE POLICY "Users can update their own battlegrounds assets."
    ON storage.objects FOR UPDATE
    USING (bucket_id = 'battlegrounds-assets' AND auth.uid() = owner);

CREATE POLICY "Users can delete their own battlegrounds assets."
    ON storage.objects FOR DELETE
    USING (bucket_id = 'battlegrounds-assets' AND auth.uid() = owner);
