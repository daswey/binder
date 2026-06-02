import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch, clearTokens, setTokens } from '../api/client';

interface User {
  id: string;
  email: string;
  username: string;
  is_pro: boolean;
  avatar_url?: string;
  location_label?: string;
  reputation_score?: number;
  trade_count?: number;
}

interface AuthStore {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  fetchMe: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  loading: true,
  setUser: (user) => set({ user }),
  fetchMe: async () => {
    const token = await AsyncStorage.getItem('access_token');
    if (!token) { set({ loading: false }); return; }
    try {
      const user = await apiFetch<User>('/auth/me');
      set({ user, loading: false });
    } catch {
      set({ user: null, loading: false });
    }
  },
  logout: async () => {
    await clearTokens();
    set({ user: null });
  },
}));
