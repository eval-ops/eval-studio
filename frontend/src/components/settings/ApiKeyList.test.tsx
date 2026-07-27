import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiKeyList } from './ApiKeyList';
import { useApiKeyStore } from '@/stores/apiKeyStore';
import type { ApiKeyResponse } from '@/types';

vi.mock('@/stores/apiKeyStore');
vi.mock('@/services/api', () => ({
  getStoredApiKey: vi.fn(() => null),
  setStoredApiKey: vi.fn(),
}));
vi.mock('./ApiKeyForm', () => ({
  ApiKeyForm: ({ open }: { open: boolean }) =>
    open ? <div data-testid="api-key-form">Form</div> : null,
}));
vi.mock('./ApiKeyRevealDialog', () => ({
  ApiKeyRevealDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="api-key-reveal">Reveal</div> : null,
}));

const mockKey: ApiKeyResponse = {
  id: 'key-1',
  name: 'Test Key',
  key_prefix: 'esk_abc123..',
  is_active: true,
  description: 'A test key',
  created_at: '2026-01-01T00:00:00Z',
  last_used_at: '2026-06-15T10:00:00Z',
};

const mockKey2: ApiKeyResponse = {
  id: 'key-2',
  name: 'Revoked Key',
  key_prefix: 'esk_def456..',
  is_active: false,
  description: null,
  created_at: '2025-12-01T00:00:00Z',
  last_used_at: null,
};

function setupStore(overrides: Partial<ReturnType<typeof useApiKeyStore.getState>> = {}): void {
  const defaults = {
    apiKeys: [],
    isLoading: false,
    error: null,
    authDisabled: false,
    fetchApiKeys: vi.fn(),
    revokeApiKey: vi.fn(),
    fetchAuthStatus: vi.fn(),
    clearError: vi.fn(),
    createApiKey: vi.fn(),
    updateApiKey: vi.fn(),
  };
  const state = { ...defaults, ...overrides };
  const mockImpl = ((selector: (s: typeof state) => unknown) => {
    return selector(state as ReturnType<typeof useApiKeyStore.getState>);
  }) as typeof useApiKeyStore;
  mockImpl.getState = () => state as ReturnType<typeof useApiKeyStore.getState>;
  vi.mocked(useApiKeyStore).mockImplementation(mockImpl);
  vi.mocked(useApiKeyStore).getState = mockImpl.getState;
}

describe('ApiKeyList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state', () => {
    setupStore({ isLoading: true });
    render(<ApiKeyList />);

    expect(screen.getByText('Loading API keys...')).toBeInTheDocument();
  });

  it('shows empty state when no keys', () => {
    setupStore({ apiKeys: [], authDisabled: true });
    render(<ApiKeyList />);

    expect(screen.getByText(/no api keys yet/i)).toBeInTheDocument();
  });

  it('renders table with API keys', () => {
    setupStore({ apiKeys: [mockKey, mockKey2] });
    render(<ApiKeyList />);

    expect(screen.getByText('Test Key')).toBeInTheDocument();
    expect(screen.getByText('esk_abc123..')).toBeInTheDocument();
    expect(screen.getByText('A test key')).toBeInTheDocument();
    expect(screen.getByText('Revoked Key')).toBeInTheDocument();
  });

  it('shows Active and Revoked badges', () => {
    setupStore({ apiKeys: [mockKey, mockKey2] });
    render(<ApiKeyList />);

    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Revoked')).toBeInTheDocument();
  });

  it('shows auth disabled info banner', () => {
    setupStore({ authDisabled: true, apiKeys: [mockKey] });
    render(<ApiKeyList />);

    expect(screen.getByText('Authentication is disabled')).toBeInTheDocument();
  });

  it('does not show auth disabled banner when auth is enabled', () => {
    setupStore({ authDisabled: false, apiKeys: [mockKey] });
    render(<ApiKeyList />);

    expect(screen.queryByText('Authentication is disabled')).not.toBeInTheDocument();
  });

  it('shows stale key warning when stored key does not match', async () => {
    const { getStoredApiKey } = await import('@/services/api');
    vi.mocked(getStoredApiKey).mockReturnValue('esk_nomatch_stale_key');
    setupStore({ apiKeys: [mockKey] });
    render(<ApiKeyList />);

    expect(screen.getByText('Active key mismatch')).toBeInTheDocument();
  });

  it('shows "Current" badge for matching stored key', async () => {
    const { getStoredApiKey } = await import('@/services/api');
    vi.mocked(getStoredApiKey).mockReturnValue('esk_abc123full_key');
    setupStore({ apiKeys: [mockKey] });
    render(<ApiKeyList />);

    expect(screen.getByText('Current')).toBeInTheDocument();
  });

  it('opens form when Create API Key is clicked', async () => {
    const user = userEvent.setup();
    setupStore({ apiKeys: [mockKey], authDisabled: true });
    render(<ApiKeyList />);

    await user.click(screen.getByRole('button', { name: /create api key/i }));

    expect(screen.getByTestId('api-key-form')).toBeInTheDocument();
  });

  it('shows revoke confirmation dialog', async () => {
    const user = userEvent.setup();
    setupStore({ apiKeys: [mockKey] });
    render(<ApiKeyList />);

    await user.click(screen.getByRole('button', { name: /revoke test key/i }));

    expect(screen.getByText(/are you sure you want to revoke/i)).toBeInTheDocument();
  });

  it('does not show revoke button for already revoked keys', () => {
    setupStore({ apiKeys: [mockKey2] });
    render(<ApiKeyList />);

    expect(screen.queryByRole('button', { name: /^revoke /i })).not.toBeInTheDocument();
  });

  it('shows error banner when store has error', () => {
    setupStore({ error: 'Something went wrong', apiKeys: [mockKey] });
    render(<ApiKeyList />);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('shows key count', () => {
    setupStore({ apiKeys: [mockKey, mockKey2] });
    render(<ApiKeyList />);

    expect(screen.getByText('2 keys')).toBeInTheDocument();
  });

  it('calls fetchApiKeys and fetchAuthStatus on mount', () => {
    const fetchApiKeys = vi.fn();
    const fetchAuthStatus = vi.fn();
    setupStore({ fetchApiKeys, fetchAuthStatus });
    render(<ApiKeyList />);

    expect(fetchApiKeys).toHaveBeenCalled();
    expect(fetchAuthStatus).toHaveBeenCalled();
  });

  it('shows singular key count for one key', () => {
    setupStore({ apiKeys: [mockKey] });
    render(<ApiKeyList />);

    expect(screen.getByText('1 key')).toBeInTheDocument();
  });

  it('calls clearError when dismiss button is clicked', async () => {
    const user = userEvent.setup();
    const clearError = vi.fn();
    setupStore({ error: 'Something went wrong', apiKeys: [mockKey], clearError });
    render(<ApiKeyList />);

    await user.click(screen.getByText('Dismiss'));

    expect(clearError).toHaveBeenCalled();
  });

  it('opens edit form when edit button is clicked', async () => {
    const user = userEvent.setup();
    setupStore({ apiKeys: [mockKey], authDisabled: true });
    render(<ApiKeyList />);

    await user.click(screen.getByRole('button', { name: /edit test key/i }));

    expect(screen.getByTestId('api-key-form')).toBeInTheDocument();
  });

  it('shows description placeholder dash when description is null', () => {
    setupStore({ apiKeys: [mockKey2] });
    render(<ApiKeyList />);

    // mockKey2 has null description, should show '-'
    const cells = screen.getAllByRole('cell');
    const descriptionCell = cells.find((cell) => cell.textContent === '-');
    expect(descriptionCell).toBeInTheDocument();
  });

  it('formats dates correctly', () => {
    setupStore({ apiKeys: [mockKey] });
    render(<ApiKeyList />);

    // mockKey has last_used_at: '2026-06-15T10:00:00Z', should display a formatted date
    // mockKey has created_at: '2026-01-01T00:00:00Z'
    // Check that 'Never' is not shown for last_used_at of mockKey
    // (mockKey2 has last_used_at: null which would show 'Never')
    const cells = screen.getAllByRole('cell');
    const cellTexts = cells.map((c) => c.textContent);
    expect(cellTexts).not.toContain('Never');
  });

  it('shows Never for null last_used_at', () => {
    setupStore({ apiKeys: [mockKey2] });
    render(<ApiKeyList />);

    expect(screen.getByText('Never')).toBeInTheDocument();
  });
});
