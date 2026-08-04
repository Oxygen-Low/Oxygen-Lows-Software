-- Drop policies added in previous migration
DROP POLICY IF EXISTS "Admins can view all support tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Admins can update all support tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Admins can view all support messages" ON public.support_messages;
DROP POLICY IF EXISTS "Admins can create support messages on any ticket" ON public.support_messages;

-- Drop is_admin column from profiles
ALTER TABLE public.profiles DROP COLUMN IF EXISTS is_admin;
