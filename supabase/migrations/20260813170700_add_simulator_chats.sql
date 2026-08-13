CREATE TABLE IF NOT EXISTS simulator_chats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'New Simulator Chat',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS simulator_chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_id UUID NOT NULL REFERENCES simulator_chats(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES simulator_chat_messages(id) ON DELETE SET NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    reasoning TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE simulator_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulator_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own simulator chats"
    ON simulator_chats
    FOR ALL
    USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own simulator chat messages"
    ON simulator_chat_messages
    FOR ALL
    USING (EXISTS (
        SELECT 1 FROM simulator_chats
        WHERE id = simulator_chat_messages.chat_id
        AND user_id = auth.uid()
    ));

CREATE INDEX idx_simulator_chats_user_id ON simulator_chats(user_id);
CREATE INDEX idx_simulator_chat_messages_chat_id ON simulator_chat_messages(chat_id);
