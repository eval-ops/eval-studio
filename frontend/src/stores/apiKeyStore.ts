import { create } from 'zustand';

import type { ApiKeyResponse, ApiKeyCreateResponse, ApiKeyCreate, ApiKeyUpdate } from '@/types';
import { api } from '@/services/api';

interface ApiKeyStore {
  apiKeys: ApiKeyResponse[];
  isLoading: boolean;
  error: string | null;
  authDisabled: boolean | null;

  clearError: () => void;
  fetchApiKeys: () => Promise<void>;
  createApiKey: (data: ApiKeyCreate) => Promise<ApiKeyCreateResponse>;
  updateApiKey: (id: string, data: ApiKeyUpdate) => Promise<ApiKeyResponse>;
  revokeApiKey: (id: string) => Promise<void>;
  fetchAuthStatus: () => Promise<void>;
}

export const useApiKeyStore = create<ApiKeyStore>((set) => ({
  apiKeys: [],
  isLoading: false,
  error: null,
  authDisabled: null,

  clearError: () => set({ error: null }),

  fetchApiKeys: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.listApiKeys({ page_size: 50 });
      set({ apiKeys: response.items, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch API keys';
      set({ error: message, isLoading: false });
    }
  },

  createApiKey: async (data: ApiKeyCreate) => {
    set({ error: null });
    try {
      const created = await api.createApiKey(data);
      set((state) => ({ apiKeys: [...state.apiKeys, created] }));
      return created;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create API key';
      set({ error: message });
      throw err;
    }
  },

  updateApiKey: async (id: string, data: ApiKeyUpdate) => {
    set({ error: null });
    try {
      const updated = await api.updateApiKey(id, data);
      set((state) => ({
        apiKeys: state.apiKeys.map((k) => (k.id === id ? updated : k)),
      }));
      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update API key';
      set({ error: message });
      throw err;
    }
  },

  revokeApiKey: async (id: string) => {
    set({ error: null });
    try {
      await api.revokeApiKey(id);
      set((state) => ({
        apiKeys: state.apiKeys.map((k) => (k.id === id ? { ...k, is_active: false } : k)),
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to revoke API key';
      set({ error: message });
      throw err;
    }
  },

  fetchAuthStatus: async () => {
    try {
      const health = await api.getHealth();
      set({ authDisabled: health.auth_disabled });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch auth status';
      set({ error: message });
    }
  },
}));
