import { create } from 'zustand';
import { User, AuthResponse } from '@binder/shared';
import { apiFetch, apiPost, clearTokens, setTokens } from '../api/client';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
}

interface RegisterData {
  username: string;
  email: string;
  password: string;
  location_label?: string;
  latitude?: number;
  longitude?: number;
  agreed_to_terms?: boolean;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,

  login: async (email, password) => {
    const data = await apiPost<AuthResponse>('/auth/login', { email, password });
    setTokens(data.access_token, data.refresh_token);
    set({ user: data.user });
  },

  register: async (data) => {
    const res = await apiPost<AuthResponse>('/auth/register', data);
    setTokens(res.access_token, res.refresh_token);
    set({ user: res.user });
  },

  logout: async () => {
    try { await apiPost('/auth/logout', {}); } catch {}
    clearTokens();
    set({ user: null });
  },

  fetchMe: async () => {
    try {
      const user = await apiFetch<User>('/auth/me');
      set({ user, loading: false });
    } catch {
      set({ user: null, loading: false });
    }
  },
}));
