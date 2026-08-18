-- Migration: Add block_vpn to defender_config
-- Description: Add column for blocking known VPN IPs to prevent geo-block bypass or avoiding IP blocks

ALTER TABLE public.defender_config
  ADD COLUMN IF NOT EXISTS block_vpn boolean NOT NULL DEFAULT true;
