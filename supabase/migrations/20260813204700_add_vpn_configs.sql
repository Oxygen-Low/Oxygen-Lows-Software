-- VPN Configs
CREATE TABLE IF NOT EXISTS public.vpn_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    config_content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.vpn_configs ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_vpn_configs_updated_at 
BEFORE UPDATE ON public.vpn_configs 
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Policies
CREATE POLICY "Users can manage their own vpn configs" 
ON public.vpn_configs 
FOR ALL TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);
