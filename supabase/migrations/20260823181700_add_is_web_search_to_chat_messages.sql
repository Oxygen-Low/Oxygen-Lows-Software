ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS is_web_search BOOLEAN DEFAULT false;
