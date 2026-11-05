import { defineStore } from 'pinia';
import { api, clearToken, getToken, setToken } from '../api';

export interface SessionUser {
  id: number;
  username: string;
  name: string;
  role: 'admin' | 'operator' | 'viewer';
}

const USER_KEY = 'deviceops.user';

function readUser(): SessionUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: getToken(),
    user: readUser() as SessionUser | null,
    error: '',
    loading: false,
  }),
  getters: {
    isLoggedIn: (state) => Boolean(state.token),
    canOperate: (state) => state.user?.role === 'admin' || state.user?.role === 'operator',
    isAdmin: (state) => state.user?.role === 'admin',
  },
  actions: {
    async login(username: string, password: string) {
      this.loading = true;
      this.error = '';
      try {
        const res = await api.post<{ token: string; user: SessionUser }>('/auth/login', { username, password });
        this.token = res.token;
        this.user = res.user;
        setToken(res.token);
        localStorage.setItem(USER_KEY, JSON.stringify(res.user));
      } catch (err) {
        this.error = (err as Error).message;
      } finally {
        this.loading = false;
      }
    },
    logout() {
      this.token = '';
      this.user = null;
      clearToken();
      localStorage.removeItem(USER_KEY);
    },
  },
});
