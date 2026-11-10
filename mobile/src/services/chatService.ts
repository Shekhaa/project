import { api } from '../config/api';
import { dataUrlToWebFile } from '../utils/mediaUtils';

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
    avatar?: string | null;
    profile_picture?: string | null;
  };
  last_message?: {
    id: string;
    text: string;
    sender_name: string;
    created_at: string;
  };
  unread_count?: number;
  is_request_pending?: boolean;
  updated_at?: string;
  members?: any[];
}

export interface AttachmentItem {
  id: string;
  file_url: string;
  download_url: string;
  file_name: string;
  file_type: 'IMAGE' | 'DOCUMENT' | 'AUDIO' | 'VIDEO';
  file_extension: string;
  mime_type: string;
  file_size: number;
  file_size_formatted: string;
  image_width?: number;
  image_height?: number;
  caption?: string;
  order?: number;
  created_at: string;
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
  attachments?: AttachmentItem[];
  is_read: boolean;
  status?: 'sending' | 'sent' | 'failed';
  created_at: string;
}

export interface MessageRequestItem {
  id: string;
  sender: {
    id: number;
    full_name: string;
    username: string;
    email: string;
    college_name: string;
    branch_name: string;
    avatar?: string;
    is_verified: boolean;
    connection_status: string;
  };
  initial_message: string;
  conversation_id?: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'BLOCKED';
  created_at: string;
}

export interface InboxResponse {
  results: Conversation[];
  pending_requests_count?: number;
}

export const chatService = {
  // Get active inbox conversations (auto-excludes expired ephemeral groups and pending requests)
  async getInbox(): Promise<InboxResponse> {
    const res = await api.get('/chat/inbox/');
    if (res.data && res.data.results) {
      return {
        results: res.data.results,
        pending_requests_count: res.data.pending_requests_count || 0,
      };
    }
    return {
      results: Array.isArray(res.data) ? res.data : [],
      pending_requests_count: res.data?.pending_requests_count || 0,
    };
  },

  // Get pending message requests (Instagram style)
  async getMessageRequests(): Promise<{ count: number; results: MessageRequestItem[] }> {
    const res = await api.get('/chat/message-requests/');
    return res.data;
  },

  // Accept message request
  async acceptMessageRequest(requestId: string): Promise<{ status: string; message: string; conversation: Conversation }> {
    const res = await api.post(`/chat/message-requests/${requestId}/accept/`);
    return res.data;
  },

  // Decline message request
  async declineMessageRequest(requestId: string): Promise<{ status: string; message: string }> {
    const res = await api.post(`/chat/message-requests/${requestId}/decline/`);
    return res.data;
  },

  // Block sender and dismiss message request
  async blockMessageRequest(requestId: string): Promise<{ status: string; message: string }> {
    const res = await api.post(`/chat/message-requests/${requestId}/block/`);
    return res.data;
  },

  // Start 1-on-1 direct chat with a student (by username or email)
  async startDirectChat(identifier: string): Promise<Conversation> {
    const res = await api.post(`/chat/start/${encodeURIComponent(identifier)}/`);
    const conv = res.data?.conversation || res.data;
    if (conv && !conv.is_group && (res.data?.status === 'MESSAGE_REQUEST_PENDING' || res.data?.status === 'MESSAGE_REQUEST_SENT')) {
      return { ...conv, is_request_pending: true };
    }
    return conv;
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
    if (!conversationId || conversationId === 'undefined' || conversationId === 'null') {
      return [];
    }
    const res = await api.get(`/chat/${conversationId}/messages/`);
    return res.data.results || res.data;
  },

  // Send message
  async sendMessage(conversationId: string, text: string): Promise<Message> {
    const res = await api.post(`/chat/${conversationId}/send/`, { text });
    return res.data;
  },

  // Send message with file attachments (images, PDFs, documents)
  async sendMessageWithAttachments(
    conversationId: string,
    text: string,
    files: any[],
    onProgress?: (percent: number) => void
  ): Promise<Message> {
    const formData = new FormData();
    if (text) {
      formData.append('text', text);
    }
    files.forEach((item, index) => {
      let fileToAppend = item.file;
      if (!fileToAppend && item.uri && typeof window !== 'undefined' && item.uri.startsWith('data:')) {
        fileToAppend = dataUrlToWebFile(item.uri, item.name || `attachment_${index}.jpg`);
      }

      if (fileToAppend) {
        // Web File object
        formData.append('attachments', fileToAppend);
      } else if (item.uri) {
        // React Native mobile file object
        formData.append('attachments', {
          uri: item.uri,
          name: item.name || `attachment_${index}.jpg`,
          type: item.mimeType || item.type || 'image/jpeg',
        } as any);
      }
    });

    const res = await api.post(`/chat/${conversationId}/send/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total && onProgress) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent);
        }
      },
    });
    return res.data;
  },

  // Unsend a message (Delete for everyone)
  async unsendMessage(messageId: string): Promise<{ message: string; id: string }> {
    const res = await api.post(`/chat/messages/${messageId}/unsend/`);
    return res.data;
  },

  // Delete message for me only
  async deleteMessageForMe(messageId: string): Promise<{ message: string; id: string }> {
    const res = await api.post(`/chat/messages/${messageId}/delete-for-me/`);
    return res.data;
  },

  async deleteForMe(messageId: string): Promise<any> {
    return this.deleteMessageForMe(messageId);
  },

  async deleteForEveryone(messageId: string): Promise<any> {
    return this.unsendMessage(messageId);
  },

  async uploadAttachmentFile(fileItem: any): Promise<{ id: string }> {
    const formData = new FormData();
    let fileToUpload = fileItem.file;
    if (!fileToUpload && fileItem.uri && typeof window !== 'undefined' && fileItem.uri.startsWith('data:')) {
      fileToUpload = dataUrlToWebFile(fileItem.uri, fileItem.name || 'attachment.jpg');
    }

    if (fileToUpload) {
      formData.append('file', fileToUpload);
    } else if (fileItem.uri) {
      const fallbackType =
        fileItem.mimeType ||
        (fileItem.type === 'IMAGE'
          ? 'image/jpeg'
          : fileItem.type === 'AUDIO'
          ? 'audio/webm'
          : fileItem.type === 'VIDEO'
          ? 'video/mp4'
          : 'application/octet-stream');
      formData.append('file', {
        uri: fileItem.uri,
        name: fileItem.name || 'attachment.jpg',
        type: fallbackType,
      } as any);
    }
    if (fileItem.caption) {
      formData.append('caption', String(fileItem.caption));
    } else if (typeof fileItem.durationSeconds === 'number' && fileItem.durationSeconds > 0) {
      const mins = Math.floor(fileItem.durationSeconds / 60);
      const secs = Math.floor(fileItem.durationSeconds % 60);
      formData.append('caption', `${mins}:${secs < 10 ? '0' : ''}${secs}`);
    }
    try {
      const res = await api.post('/attachments/upload/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data;
    } catch (err) {
      console.warn('Failed to upload attachment via /attachments/upload/', err);
      // If fileItem already has a real UUID id, retain it; otherwise throw or pass empty
      if (fileItem.id && typeof fileItem.id === 'string' && fileItem.id.includes('-')) {
        return { id: fileItem.id };
      }
      throw err;
    }
  },

  // Delete entire conversation / chat with a person
  async deleteConversation(conversationId: string, permanent: boolean = false): Promise<{ message: string; id: string }> {
    const res = await api.delete(`/chat/${conversationId}/delete/`, { params: { permanent } });
    return res.data;
  },

  // Clear all messages in conversation
  async clearChatHistory(conversationId: string): Promise<{ message: string }> {
    const res = await api.post(`/chat/${conversationId}/clear/`);
    return res.data;
  },

  // Add members to a group chat (Instagram style)
  async addMembers(conversationId: string, userIds: number[]): Promise<{ added_count: number; members: any[] }> {
    const res = await api.post(`/chat/${conversationId}/add-members/`, { user_ids: userIds });
    return res.data;
  },

  // Get or generate group invite link
  async getInviteLink(conversationId: string): Promise<{ invite_code: string; invite_url: string; group_name: string }> {
    const res = await api.get(`/chat/${conversationId}/invite-link/`);
    return res.data;
  },

  // Reset group invite link
  async resetInviteLink(conversationId: string): Promise<{ invite_code: string; invite_url: string; group_name: string; message: string }> {
    const res = await api.post(`/chat/${conversationId}/invite-link/`, { action: 'reset' });
    return res.data;
  },

  // Preview group chat by invite code
  async previewInvite(inviteCode: string): Promise<any> {
    const res = await api.get(`/chat/invite/${inviteCode}/`);
    return res.data;
  },

  // Join group chat by invite code
  async joinByInvite(inviteCode: string): Promise<any> {
    const res = await api.post(`/chat/invite/${inviteCode}/`);
    return res.data;
  },
};

/**
 * Merges server-fetched messages with any local in-flight optimistic messages,
 * guaranteeing strict uniqueness by message `id` so polling + sends never duplicate items.
 */
export const mergeMessagesUnique = (prev: Message[], incoming: Message[]): Message[] => {
  const seen = new Set<string>();
  const result: Message[] = [];
  for (const msg of incoming) {
    const key = String(msg.id);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(msg);
  }
  // Keep in-flight sending messages not yet confirmed by the server
  for (const localMsg of prev) {
    const status = (localMsg as any).status;
    const key = String(localMsg.id);
    if ((status === 'sending' || status === 'failed') && key.startsWith('temp_') && !seen.has(key)) {
      seen.add(key);
      result.push(localMsg);
    }
  }
  return result;
};

/**
 * Replaces an optimistic temp message with the saved server message or appends safely if not yet present.
 */
export const upsertMessageUnique = (
  prev: Message[],
  savedMsg: Message,
  tempId?: string
): Message[] => {
  const savedId = String(savedMsg.id);
  const existsReal = prev.some((m) => String(m.id) === savedId);
  if (existsReal) {
    return prev
      .filter((m) => !tempId || String(m.id) !== tempId)
      .map((m) => (String(m.id) === savedId ? { ...savedMsg, status: 'sent' as any } : m));
  }
  if (tempId && prev.some((m) => String(m.id) === tempId)) {
    return prev.map((m) => (String(m.id) === tempId ? { ...savedMsg, status: 'sent' as any } : m));
  }
  return [...prev, { ...savedMsg, status: 'sent' as any }];
};

