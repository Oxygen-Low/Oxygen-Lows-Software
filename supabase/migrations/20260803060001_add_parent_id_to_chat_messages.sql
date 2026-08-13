ALTER TABLE public.chat_messages
ADD COLUMN parent_id UUID REFERENCES public.chat_messages(id) ON DELETE CASCADE;
