import { api } from '../config/api';

export interface Conversation {
  id: string;
  name?: string;
  is_group: boolean;
  is_ephemeral: boolean;
  duration?: '10_MIN' | '1_HOUR' | '12_HOURS' | '24_HOURS';
  purpose_tag?: string;
  expires_at?: string;
  is_expired?: boolean;
  recipient?: {
    id: number;
    full_name: string;
    email: string;
    username?: string;
  };
  last_message?: {
    id: string;
    text: string;
    sender_name: string;
    created_at: string;
  };
  unread_count?: number;
  updated_at?: string;
}

export interface Message {
  id: string;
  conversation: string;
  sender: number;
  sender_name: string;
  sender_email: string;
  sender_avatar?: string;
  text: string;
  attachment?: string;
  is_read: boolean;
  created_at: string;
}

export const chatService = {
  // Get active inbox conversations (auto-excludes expired ephemeral groups)
  async getInbox(): Promise<Conversation[]> {
    const res = await api.get('/chat/inbox/');
    return res.data.results || res.data;
  },

  // Start 1-on-1 direct chat with a student (by username or email)
  async startDirectChat(identifier: string): Promise<Conversation> {
    const res = await api.post(`/chat/start/${encodeURIComponent(identifier)}/`);
    return res.data;
  },

  // Create Ephemeral Self-Destructing Group (Hangout / Trip / Study session)
  async createEphemeralGroup(data: {
    name: string;
    purpose_tag: string;
    duration: '10_MIN' | '1_HOUR' | '12_HOURS' | '24_HOURS';
  }): Promise<Conversation> {
    const res = await api.post('/chat/ephemeral-group/create/', data);
    return res.data;
  },

  // Get messages in a conversation
  async getMessages(conversationId: string): Promise<Message[]> {
    const res = await api.get(`/chat/${conversationId}/messages/`);
    return res.data.results || res.data;
  },

  // Send message
  async sendMessage(conversationId: string, text: string): Promise<Message> {
    const res = await api.post(`/chat/${conversationId}/send/`, { text });
    return res.data;
  },
};
