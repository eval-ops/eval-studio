import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiKeyRevealDialog } from './ApiKeyRevealDialog';

vi.mock('@/services/api', () => ({
  setStoredApiKey: vi.fn(),
  getStoredApiKey: vi.fn(() => null),
}));

describe('ApiKeyRevealDialog', () => {
  const mockOnDone = vi.fn();
  const rawKey = 'esk_test_secret_key_value_12345';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('displays the raw key', () => {
    render(<ApiKeyRevealDialog open={true} rawKey={rawKey} onDone={mockOnDone} />);

    expect(screen.getByText(rawKey)).toBeInTheDocument();
  });

  it('shows warning text about key not being shown again', () => {
    render(<ApiKeyRevealDialog open={true} rawKey={rawKey} onDone={mockOnDone} />);

    expect(screen.getByText(/this key will not be shown again/i)).toBeInTheDocument();
  });

  it('has a copy button', () => {
    render(<ApiKeyRevealDialog open={true} rawKey={rawKey} onDone={mockOnDone} />);

    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument();
  });

  it('has the "set as active" checkbox checked by default', () => {
    render(<ApiKeyRevealDialog open={true} rawKey={rawKey} onDone={mockOnDone} />);

    expect(screen.getByRole('checkbox', { name: /set as active/i })).toBeChecked();
  });

  it('calls onDone and sets stored key when Done button is clicked', async () => {
    const { setStoredApiKey: mockSetStored } = await import('@/services/api');
    const user = userEvent.setup();
    render(<ApiKeyRevealDialog open={true} rawKey={rawKey} onDone={mockOnDone} />);

    await user.click(screen.getByRole('button', { name: /done/i }));

    expect(mockSetStored).toHaveBeenCalledWith(rawKey);
    expect(mockOnDone).toHaveBeenCalled();
  });

  it('does not set stored key when checkbox is unchecked', async () => {
    const { setStoredApiKey: mockSetStored } = await import('@/services/api');
    const user = userEvent.setup();
    render(<ApiKeyRevealDialog open={true} rawKey={rawKey} onDone={mockOnDone} />);

    await user.click(screen.getByRole('checkbox', { name: /set as active/i }));
    await user.click(screen.getByRole('button', { name: /done/i }));

    expect(mockSetStored).not.toHaveBeenCalled();
    expect(mockOnDone).toHaveBeenCalled();
  });
});
