-- Revert migration: 20260813170700_add_simulator_chats.sql

-- Drop simulator_chat_messages table (this will also drop its policies and indexes)
DROP TABLE IF EXISTS simulator_chat_messages CASCADE;

-- Drop simulator_chats table (this will also drop its policies and indexes)
DROP TABLE IF EXISTS simulator_chats CASCADE;
