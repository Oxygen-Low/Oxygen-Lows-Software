-- Create public-assets storage bucket if not exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('public-assets', 'public-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage policies for public-assets
CREATE POLICY "Public Assets are viewable by everyone"
ON storage.objects FOR SELECT
USING (bucket_id = 'public-assets');

CREATE POLICY "Authenticated users can upload public assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'public-assets');

CREATE POLICY "Users can update their own public assets in storage"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'public-assets' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own public assets in storage"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'public-assets' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- Add is_verified_public column to characters if not exists
ALTER TABLE public.characters
ADD COLUMN IF NOT EXISTS is_verified_public BOOLEAN DEFAULT false;

-- Create public.public_assets table for general files/media/data assets
CREATE TABLE IF NOT EXISTS public.public_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uploader_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    display_name TEXT,
    category TEXT NOT NULL DEFAULT 'other',
    description TEXT,
    file_path TEXT NOT NULL,
    file_size BIGINT NOT NULL DEFAULT 0,
    mime_type TEXT,
    downloads INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.public_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public assets are viewable by everyone" 
    ON public.public_assets FOR SELECT 
    USING (true);

CREATE POLICY "Users can insert their own public assets" 
    ON public.public_assets FOR INSERT 
    WITH CHECK (auth.uid() = uploader_id);

CREATE POLICY "Users can update their own public assets" 
    ON public.public_assets FOR UPDATE 
    USING (auth.uid() = uploader_id);

CREATE POLICY "Users can delete their own public assets" 
    ON public.public_assets FOR DELETE 
    USING (auth.uid() = uploader_id);

-- Increment public asset downloads
CREATE OR REPLACE FUNCTION increment_public_asset_downloads(asset_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE public.public_assets
    SET downloads = downloads + 1
    WHERE id = asset_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create public_asset_likes table
CREATE TABLE IF NOT EXISTS public.public_asset_likes (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    public_asset_id UUID NOT NULL REFERENCES public.public_assets(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, public_asset_id)
);

ALTER TABLE public.public_asset_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Asset likes are viewable by everyone" 
    ON public.public_asset_likes FOR SELECT 
    USING (true);

CREATE POLICY "Users can insert their own asset likes" 
    ON public.public_asset_likes FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own asset likes" 
    ON public.public_asset_likes FOR DELETE 
    USING (auth.uid() = user_id);

-- Create asset_verifications table (Verification & Review Queue)
CREATE TABLE IF NOT EXISTS public.asset_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    asset_type TEXT NOT NULL, -- 'file', 'character', 'universe'
    target_type TEXT NOT NULL DEFAULT 'public_asset', -- 'public_asset', 'public_usage'
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    title TEXT NOT NULL,
    description TEXT,
    original_id UUID, -- references character id if character/universe
    original_file_path TEXT, -- path in Storage bucket if file
    file_size BIGINT DEFAULT 0,
    mime_type TEXT,
    public_asset_id UUID REFERENCES public.public_assets(id) ON DELETE SET NULL,
    public_character_id UUID REFERENCES public.public_characters(id) ON DELETE SET NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    admin_notes TEXT,
    rejection_reason TEXT,
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.asset_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own verifications" 
    ON public.asset_verifications FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own verifications" 
    ON public.asset_verifications FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own pending verifications" 
    ON public.asset_verifications FOR UPDATE 
    USING (auth.uid() = user_id AND status = 'pending');

CREATE POLICY "Users can delete their own verifications" 
    ON public.asset_verifications FOR DELETE 
    USING (auth.uid() = user_id);
