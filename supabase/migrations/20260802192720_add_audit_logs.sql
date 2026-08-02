CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    event_type text NOT NULL,
    user_id uuid,
    details jsonb,
    ip_address text
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon insert" 
ON public.audit_logs 
FOR INSERT 
TO anon, authenticated
WITH CHECK (true);
