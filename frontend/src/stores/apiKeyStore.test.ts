import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useApiKeyStore } from './apiKeyStore';
import { api } from '@/services/api';
import type { ApiKeyResponse, ApiKeyCreateResponse } from '@/types';

vi.mock('@/services/api', () => ({
  api: {
    listApiKeys: vi.fn(),
    createApiKey: vi.fn(),
    updateApiKey: vi.fn(),
    revokeApiKey: vi.fn(),
    getHealth: vi.fn(),
  },
}));

const mockKey: ApiKeyResponse = {
  id: 'key-1',
  name: 'Test Key',
  key_prefix: 'esk_abc123..',
  is_active: true,
  description: 'A test key',
  created_at: '2026-01-01T00:00:00Z',
  last_used_at: null,
};

const mockCreateResponse: ApiKeyCreateResponse = {
  ...mockKey,
  raw_key: 'esk_abc123full_secret_value',
};

describe('apiKeyStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useApiKeyStore.setState({
      apiKeys: [],
      isLoading: false,
      error: null,
      authDisabled: null,
    });
  });

  it('fetchApiKeys populates apiKeys from paginated response', async () => {
    vi.mocked(api.listApiKeys).mockResolvedValue({
      items: [mockKey],
      total: 1,
      page: 1,
      page_size: 50,
      pages: 1,
    });

    await useApiKeyStore.getState().fetchApiKeys();

    expect(api.listApiKeys).toHaveBeenCalledWith({ page_size: 50 });
    expect(useApiKeyStore.getState().apiKeys).toEqual([mockKey]);
    expect(useApiKeyStore.getState().isLoading).toBe(false);
  });

  it('fetchApiKeys sets error on failure', async () => {
    vi.mocked(api.listApiKeys).mockRejectedValue(new Error('Network error'));

    await useApiKeyStore.getState().fetchApiKeys();

    expect(useApiKeyStore.getState().error).toBe('Network error');
    expect(useApiKeyStore.getState().isLoading).toBe(false);
  });

  it('createApiKey adds key to store and returns create response', async () => {
    vi.mocked(api.createApiKey).mockResolvedValue(mockCreateResponse);

    const result = await useApiKeyStore.getState().createApiKey({
      name: 'Test Key',
      description: 'A test key',
    });

    expect(result).toEqual(mockCreateResponse);
    expect(useApiKeyStore.getState().apiKeys).toHaveLength(1);
    expect(useApiKeyStore.getState().apiKeys[0].id).toBe('key-1');
  });

  it('createApiKey sets error on failure', async () => {
    vi.mocked(api.createApiKey).mockRejectedValue(new Error('Create failed'));

    await expect(useApiKeyStore.getState().createApiKey({ name: 'Fail' })).rejects.toThrow(
      'Create failed',
    );

    expect(useApiKeyStore.getState().error).toBe('Create failed');
  });

  it('updateApiKey updates key in store', async () => {
    useApiKeyStore.setState({ apiKeys: [mockKey] });
    const updatedKey = { ...mockKey, name: 'Updated Name' };
    vi.mocked(api.updateApiKey).mockResolvedValue(updatedKey);

    const result = await useApiKeyStore.getState().updateApiKey('key-1', { name: 'Updated Name' });

    expect(result.name).toBe('Updated Name');
    expect(useApiKeyStore.getState().apiKeys[0].name).toBe('Updated Name');
  });

  it('revokeApiKey marks key as inactive in store', async () => {
    useApiKeyStore.setState({ apiKeys: [mockKey] });
    vi.mocked(api.revokeApiKey).mockResolvedValue(undefined);

    await useApiKeyStore.getState().revokeApiKey('key-1');

    expect(useApiKeyStore.getState().apiKeys).toHaveLength(1);
    expect(useApiKeyStore.getState().apiKeys[0].is_active).toBe(false);
  });

  it('revokeApiKey sets error on failure', async () => {
    useApiKeyStore.setState({ apiKeys: [mockKey] });
    vi.mocked(api.revokeApiKey).mockRejectedValue(new Error('Cannot revoke last key'));

    await expect(useApiKeyStore.getState().revokeApiKey('key-1')).rejects.toThrow(
      'Cannot revoke last key',
    );

    expect(useApiKeyStore.getState().error).toBe('Cannot revoke last key');
  });

  it('fetchAuthStatus sets authDisabled from health endpoint', async () => {
    vi.mocked(api.getHealth).mockResolvedValue({
      status: 'healthy',
      version: '0.1.0',
      auth_disabled: true,
    });

    await useApiKeyStore.getState().fetchAuthStatus();

    expect(useApiKeyStore.getState().authDisabled).toBe(true);
  });

  it('clearError resets error to null', () => {
    useApiKeyStore.setState({ error: 'some error' });

    useApiKeyStore.getState().clearError();

    expect(useApiKeyStore.getState().error).toBeNull();
  });
});
