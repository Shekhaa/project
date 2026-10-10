import { api } from '../config/api';

export interface LostFoundItem {
  id: string;
  item_type: 'LOST' | 'FOUND';
  description: string;
  location: string;
  image?: string;
  status: 'OPEN' | 'RESOLVED';
  reporter_name: string;
  reporter_id: number;
  is_mine: boolean;
  created_at: string;
}

export const lostFoundService = {
  // Get all active lost & found items
  async getItems(type?: 'LOST' | 'FOUND'): Promise<LostFoundItem[]> {
    const params = type ? { item_type: type } : {};
    const res = await api.get('/lost-found/', { params });
    return res.data.results || res.data;
  },

  // Frictionless 1-step post (Simple description + Written location)
  async reportItem(data: {
    item_type: 'LOST' | 'FOUND';
    description: string;
    location: string;
  }) {
    const res = await api.post('/lost-found/report/', data);
    return res.data;
  },

  // 1-Click In-App Direct Message with Context
  async contactReporter(itemId: string) {
    const res = await api.post(`/lost-found/${itemId}/contact/`);
    return res.data;
  },
};
