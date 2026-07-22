import { create } from "zustand";
import { authApi } from "../api/client";

interface CurrentUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
}

interface AuthStore {
  token: string | null;
  user: CurrentUser | null;
  login: (token: string) => void;
  logout: () => void;
  fetchUser: () => Promise<void>;
}

export const useAuth = create<AuthStore>((set, get) => ({
  token: localStorage.getItem("token"),
  user: null,
  login: (token) => {
    localStorage.setItem("token", token);
    set({ token, user: null });
    get().fetchUser();
  },
  logout: () => {
    localStorage.removeItem("token");
    set({ token: null, user: null });
  },
  fetchUser: async () => {
    if (!get().token) return;
    try {
      const res = await authApi.me();
      set({ user: res.data });
    } catch {
      // leave user null -- sidebar falls back to a generic placeholder
    }
  },
}));
