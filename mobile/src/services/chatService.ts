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
  members?: any[];
}

export interface AttachmentItem {
  id: string;
  file_url: string;
  download_url: string;
  file_name: string;
  file_type: 'IMAGE' | 'DOCUMENT';
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
    const toFile = (dataurl: string, filename: string): any => {
      if (typeof window === 'undefined' || !dataurl.startsWith('data:')) return null;
      try {
        const arr = dataurl.split(',');
        const mimeMatch = arr[0].match(/:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        return new File([u8arr], filename, { type: mime });
      } catch (e) {
        return null;
      }
    };

    files.forEach((item, index) => {
      let fileToAppend = item.file;
      if (!fileToAppend && item.uri && typeof window !== 'undefined' && item.uri.startsWith('data:')) {
        fileToAppend = toFile(item.uri, item.name || `attachment_${index}.jpg`);
      }

      if (fileToAppend) {
        // Web File object
        formData.append('attachments', fileToAppend);
      } else if (item.uri) {
        // React Native mobile file object
        formData.append('attachments', {
          uri: item.uri,
          name: item.name || `attachment_${index}.jpg`,
          type: item.type || 'image/jpeg',
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
    if (fileItem.file) {
      formData.append('file', fileItem.file);
    } else if (fileItem.uri) {
      formData.append('file', {
        uri: fileItem.uri,
        name: fileItem.name || 'attachment.jpg',
        type: fileItem.type === 'IMAGE' ? 'image/jpeg' : 'application/octet-stream',
      } as any);
    }
    try {
      const res = await api.post('/chat/upload-attachment/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data;
    } catch {
      return { id: fileItem.id || String(Date.now()) };
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
