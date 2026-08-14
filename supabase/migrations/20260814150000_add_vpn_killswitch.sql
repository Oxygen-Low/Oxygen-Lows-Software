ALTER TABLE public.vpn_configs
ADD COLUMN killswitch BOOLEAN NOT NULL DEFAULT true;
