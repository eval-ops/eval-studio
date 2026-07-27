import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiKeyForm } from './ApiKeyForm';
import { useApiKeyStore } from '@/stores/apiKeyStore';
import type { ApiKeyResponse, ApiKeyCreateResponse } from '@/types';

vi.mock('@/stores/apiKeyStore');

const mockKey: ApiKeyResponse = {
  id: 'key-1',
  name: 'Test Key',
  key_prefix: 'esk_abc123..',
  is_active: true,
  description: 'A test key',
  created_at: '2026-01-01T00:00:00Z',
  last_used_at: null,
};

describe('ApiKeyForm', () => {
  const mockCreateApiKey = vi.fn();
  const mockUpdateApiKey = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useApiKeyStore).mockImplementation((selector) => {
      const state = {
        createApiKey: mockCreateApiKey,
        updateApiKey: mockUpdateApiKey,
      };
      return selector(state as ReturnType<typeof useApiKeyStore.getState>);
    });
  });

  it('renders create mode title when no apiKey provided', () => {
    render(<ApiKeyForm open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByText('Create API Key')).toBeInTheDocument();
  });

  it('renders edit mode title when apiKey provided', () => {
    render(<ApiKeyForm open={true} onOpenChange={vi.fn()} apiKey={mockKey} />);

    expect(screen.getByText('Edit API Key')).toBeInTheDocument();
  });

  it('pre-fills name and description in edit mode', () => {
    render(<ApiKeyForm open={true} onOpenChange={vi.fn()} apiKey={mockKey} />);

    expect(screen.getByDisplayValue('Test Key')).toBeInTheDocument();
    expect(screen.getByDisplayValue('A test key')).toBeInTheDocument();
  });

  it('shows validation error when name is empty on save', async () => {
    const user = userEvent.setup();
    render(<ApiKeyForm open={true} onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /create/i }));

    expect(screen.getByText('Name is required')).toBeInTheDocument();
    expect(mockCreateApiKey).not.toHaveBeenCalled();
  });

  it('calls createApiKey and onCreated in create mode', async () => {
    const user = userEvent.setup();
    const mockOnCreated = vi.fn();
    const mockOnOpenChange = vi.fn();
    const createResponse: ApiKeyCreateResponse = {
      ...mockKey,
      raw_key: 'esk_raw_key_value',
    };
    mockCreateApiKey.mockResolvedValue(createResponse);

    render(<ApiKeyForm open={true} onOpenChange={mockOnOpenChange} onCreated={mockOnCreated} />);

    await user.type(screen.getByLabelText(/name/i), 'New Key');
    await user.click(screen.getByRole('button', { name: /create/i }));

    expect(mockCreateApiKey).toHaveBeenCalledWith({
      name: 'New Key',
      description: null,
    });
    expect(mockOnCreated).toHaveBeenCalledWith(createResponse);
  });

  it('calls updateApiKey in edit mode', async () => {
    const user = userEvent.setup();
    const mockOnSaved = vi.fn();
    const updatedKey = { ...mockKey, name: 'Updated' };
    mockUpdateApiKey.mockResolvedValue(updatedKey);

    render(
      <ApiKeyForm open={true} onOpenChange={vi.fn()} apiKey={mockKey} onSaved={mockOnSaved} />,
    );

    const nameInput = screen.getByDisplayValue('Test Key');
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated');
    await user.click(screen.getByRole('button', { name: /update/i }));

    expect(mockUpdateApiKey).toHaveBeenCalledWith('key-1', {
      name: 'Updated',
      description: 'A test key',
    });
    expect(mockOnSaved).toHaveBeenCalled();
  });

  it('shows error message when create API call fails', async () => {
    const user = userEvent.setup();
    mockCreateApiKey.mockRejectedValue(new Error('Server error'));

    render(<ApiKeyForm open={true} onOpenChange={vi.fn()} />);

    await user.type(screen.getByLabelText(/name/i), 'New Key');
    await user.click(screen.getByRole('button', { name: /create/i }));

    expect(screen.getByText('Failed to save API key. Please try again.')).toBeInTheDocument();
  });

  it('shows error message when update API call fails', async () => {
    const user = userEvent.setup();
    mockUpdateApiKey.mockRejectedValue(new Error('Server error'));

    render(<ApiKeyForm open={true} onOpenChange={vi.fn()} apiKey={mockKey} />);

    await user.click(screen.getByRole('button', { name: /update/i }));

    expect(screen.getByText('Failed to save API key. Please try again.')).toBeInTheDocument();
  });

  it('sends description as null when left empty in create mode', async () => {
    const user = userEvent.setup();
    const createResponse: ApiKeyCreateResponse = {
      ...mockKey,
      raw_key: 'esk_raw_key_value',
    };
    mockCreateApiKey.mockResolvedValue(createResponse);

    render(<ApiKeyForm open={true} onOpenChange={vi.fn()} />);

    await user.type(screen.getByLabelText(/name/i), 'Key Without Desc');
    await user.click(screen.getByRole('button', { name: /create/i }));

    expect(mockCreateApiKey).toHaveBeenCalledWith({
      name: 'Key Without Desc',
      description: null,
    });
  });

  it('sends description when provided in create mode', async () => {
    const user = userEvent.setup();
    const createResponse: ApiKeyCreateResponse = {
      ...mockKey,
      raw_key: 'esk_raw_key_value',
    };
    mockCreateApiKey.mockResolvedValue(createResponse);

    render(<ApiKeyForm open={true} onOpenChange={vi.fn()} />);

    await user.type(screen.getByLabelText(/name/i), 'CI Key');
    await user.type(screen.getByLabelText(/description/i), 'For CI pipeline');
    await user.click(screen.getByRole('button', { name: /create/i }));

    expect(mockCreateApiKey).toHaveBeenCalledWith({
      name: 'CI Key',
      description: 'For CI pipeline',
    });
  });

  it('does not render form inner content when closed', () => {
    render(<ApiKeyForm open={false} onOpenChange={vi.fn()} />);

    expect(screen.queryByLabelText(/name/i)).not.toBeInTheDocument();
  });

  it('trims whitespace from name and description', async () => {
    const user = userEvent.setup();
    const createResponse: ApiKeyCreateResponse = {
      ...mockKey,
      raw_key: 'esk_raw_key_value',
    };
    mockCreateApiKey.mockResolvedValue(createResponse);

    render(<ApiKeyForm open={true} onOpenChange={vi.fn()} />);

    await user.type(screen.getByLabelText(/name/i), '  Padded Name  ');
    await user.type(screen.getByLabelText(/description/i), '  Some desc  ');
    await user.click(screen.getByRole('button', { name: /create/i }));

    expect(mockCreateApiKey).toHaveBeenCalledWith({
      name: 'Padded Name',
      description: 'Some desc',
    });
  });
});
