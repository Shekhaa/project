import { api } from '../config/api';

export interface LostFoundItem {
  id: string;
  item_type: 'LOST' | 'FOUND';
  description: string;
  location: string;
  image?: string | null;
  status: 'OPEN' | 'RESOLVED';
  reporter_name: string;
  reporter_id: number;
  is_mine: boolean;
  created_at: string;
}

export const lostFoundService = {
  // Get all active lost & found items
  async getItems(type?: 'LOST' | 'FOUND'): Promise<LostFoundItem[]> {
    const params = type ? { type } : {};
    const res = await api.get('/lost-found/', { params });
    return res.data.results || res.data;
  },

  // Frictionless post (description + location + optional photo)
  async reportItem(data: FormData | {
    item_type: 'LOST' | 'FOUND';
    description: string;
    location: string;
  }) {
    const isFormData = typeof FormData !== 'undefined' && data instanceof FormData;
    const res = await api.post('/lost-found/create/', data, isFormData ? {
      headers: { 'Content-Type': 'multipart/form-data' }
    } : undefined);
    return res.data;
  },

  // 1-Click In-App Direct Message with Context
  async contactReporter(itemId: string) {
    const res = await api.post(`/lost-found/${itemId}/contact/`);
    return res.data;
  },
};
