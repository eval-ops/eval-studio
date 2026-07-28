import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUploadDataset = vi.fn();
const mockFetchDatasets = vi.fn();

vi.mock('@/stores/datasetStore', () => ({
  useDatasetStore: (selector?: unknown) => {
    const state = {
      uploadDataset: mockUploadDataset,
      fetchDatasets: mockFetchDatasets,
    };
    if (typeof selector === 'function') {
      return (selector as (s: typeof state) => unknown)(state);
    }
    return state;
  },
}));

import { CreateDatasetDialog } from './CreateDatasetDialog';

describe('CreateDatasetDialog', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders dialog with form fields when open', () => {
    render(<CreateDatasetDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByText('Create Dataset')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
  });

  it('renders an initial empty item row', () => {
    render(<CreateDatasetDialog open={true} onOpenChange={vi.fn()} />);
    const questionInputs = screen.getAllByPlaceholderText('Enter question...');
    expect(questionInputs).toHaveLength(1);
  });

  it('adds a new item row when clicking Add Item', async () => {
    render(<CreateDatasetDialog open={true} onOpenChange={vi.fn()} />);
    const addButton = screen.getByRole('button', { name: /add item/i });
    await user.click(addButton);

    const questionInputs = screen.getAllByPlaceholderText('Enter question...');
    expect(questionInputs).toHaveLength(2);
  });

  it('removes an item row when clicking remove', async () => {
    render(<CreateDatasetDialog open={true} onOpenChange={vi.fn()} />);
    const addButton = screen.getByRole('button', { name: /add item/i });
    await user.click(addButton);

    const removeButtons = screen.getAllByLabelText(/remove item/i);
    expect(removeButtons).toHaveLength(2);

    await user.click(removeButtons[0]!);

    const questionInputs = screen.getAllByPlaceholderText('Enter question...');
    expect(questionInputs).toHaveLength(1);
  });

  it('disables save when name is empty', () => {
    render(<CreateDatasetDialog open={true} onOpenChange={vi.fn()} />);
    const saveButton = screen.getByRole('button', { name: /create$/i });
    expect(saveButton).toBeDisabled();
  });

  it('disables save when no items have questions', async () => {
    render(<CreateDatasetDialog open={true} onOpenChange={vi.fn()} />);
    const nameInput = screen.getByLabelText('Name');
    await user.type(nameInput, 'My Dataset');

    const saveButton = screen.getByRole('button', { name: /create$/i });
    expect(saveButton).toBeDisabled();
  });

  it('enables save when name and at least one question are filled', async () => {
    render(<CreateDatasetDialog open={true} onOpenChange={vi.fn()} />);
    const nameInput = screen.getByLabelText('Name');
    await user.type(nameInput, 'My Dataset');

    const questionInput = screen.getByPlaceholderText('Enter question...');
    await user.type(questionInput, 'What is Linux?');

    const saveButton = screen.getByRole('button', { name: /create$/i });
    expect(saveButton).toBeEnabled();
  });

  it('calls uploadDataset with correct data on save', async () => {
    mockUploadDataset.mockResolvedValue({ id: 'ds-new', name: 'My Dataset' });
    const onOpenChange = vi.fn();

    render(<CreateDatasetDialog open={true} onOpenChange={onOpenChange} />);

    await user.type(screen.getByLabelText('Name'), 'My Dataset');
    await user.type(screen.getByLabelText('Description'), 'A description');
    await user.type(screen.getByPlaceholderText('Enter question...'), 'What is Linux?');

    const answerInputs = screen.getAllByPlaceholderText('Expected answer (optional)...');
    await user.type(answerInputs[0]!, 'An OS kernel');

    await user.click(screen.getByRole('button', { name: /create$/i }));

    expect(mockUploadDataset).toHaveBeenCalledWith({
      name: 'My Dataset',
      description: 'A description',
      format: 'qa_pairs',
      version: '1.0',
      tags: [],
      items: [{ question: 'What is Linux?', expected_answer: 'An OS kernel' }],
    });
  });

  it('shows unsaved changes confirmation when closing with content', async () => {
    const onOpenChange = vi.fn();
    render(<CreateDatasetDialog open={true} onOpenChange={onOpenChange} />);

    await user.type(screen.getByLabelText('Name'), 'My Dataset');

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    const alertDialog = screen.getByRole('alertdialog');
    expect(alertDialog).toBeInTheDocument();
    expect(
      within(alertDialog).getByRole('heading', { name: /unsaved changes/i }),
    ).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<CreateDatasetDialog open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByText('Create Dataset')).not.toBeInTheDocument();
  });
});
