-- Data Save Categories
CREATE TABLE IF NOT EXISTS public.data_save_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, name)
);

ALTER TABLE public.data_save_categories ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_data_save_categories_updated_at 
BEFORE UPDATE ON public.data_save_categories 
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users can manage their own data save categories" 
ON public.data_save_categories 
FOR ALL TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

-- Update data_saves table
ALTER TABLE public.data_saves ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.data_save_categories(id) ON DELETE SET NULL;
