import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Dynamically determine backend URL for local Wi-Fi testers and Web/Expo
const getBaseUrl = (): string => {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hostname) {
    try {
      const stored = window.localStorage?.getItem('custom_backend_url');
      if (stored) return stored;
    } catch {}
    return `http://${window.location.hostname}:8000/api`;
  }
  return 'http://192.168.1.33:8000/api';
};

export const API_BASE_URL = getBaseUrl();

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Interceptor to attach JWT token
api.interceptors.request.use(async (config) => {
  try {
    const token = await AsyncStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (error) {
    console.error('Error attaching auth token', error);
  }
  return config;
});

// Interceptor to catch 401s
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response && error.response.status === 401) {
      // Token expired or invalid
      await AsyncStorage.multiRemove(['access_token', 'refresh_token', 'user_info']);
    }
    return Promise.reject(error);
  }
);
