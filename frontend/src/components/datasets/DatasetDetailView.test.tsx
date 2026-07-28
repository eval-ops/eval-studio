import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DatasetDetail } from '@/types';

const mockFetchDataset = vi.fn();
const mockSetCurrentDataset = vi.fn();
const mockAddItems = vi.fn();
const mockUpdateItem = vi.fn();
const mockDeleteItem = vi.fn();

const makeDetail = (overrides: Partial<DatasetDetail> = {}): DatasetDetail => ({
  id: 'ds-1',
  name: 'Test Dataset',
  description: 'A test dataset',
  format: 'qa_pairs',
  version: '1.0',
  tags: ['test', 'qa'],
  source_type: 'upload',
  item_count: 2,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  items: [
    {
      id: 'item-1',
      question: 'What is Linux?',
      expected_answer: 'An operating system kernel',
      metadata: {},
      order_index: 0,
    },
    {
      id: 'item-2',
      question: 'What is Bash?',
      expected_answer: 'A Unix shell',
      metadata: {},
      order_index: 1,
    },
  ],
  ...overrides,
});

let storeState: {
  currentDataset: DatasetDetail | null;
  isLoading: boolean;
  fetchDataset: typeof mockFetchDataset;
  setCurrentDataset: typeof mockSetCurrentDataset;
  addItems: typeof mockAddItems;
  updateItem: typeof mockUpdateItem;
  deleteItem: typeof mockDeleteItem;
};

vi.mock('@/stores/datasetStore', () => ({
  useDatasetStore: (selector?: unknown) => {
    if (typeof selector === 'function') {
      return (selector as (s: typeof storeState) => unknown)(storeState);
    }
    return storeState;
  },
}));

import { DatasetDetailView } from './DatasetDetailView';

describe('DatasetDetailView', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
    storeState = {
      currentDataset: null,
      isLoading: false,
      fetchDataset: mockFetchDataset,
      setCurrentDataset: mockSetCurrentDataset,
      addItems: mockAddItems,
      updateItem: mockUpdateItem,
      deleteItem: mockDeleteItem,
    };
  });

  it('renders sheet when open with dataset name', () => {
    storeState.currentDataset = makeDetail();
    render(<DatasetDetailView datasetId="ds-1" open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByText('Test Dataset')).toBeInTheDocument();
  });

  it('calls fetchDataset with the provided id', () => {
    render(<DatasetDetailView datasetId="ds-1" open={true} onOpenChange={vi.fn()} />);
    expect(mockFetchDataset).toHaveBeenCalledWith('ds-1');
  });

  it('displays dataset metadata fields', () => {
    storeState.currentDataset = makeDetail();
    render(<DatasetDetailView datasetId="ds-1" open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByText('qa_pairs')).toBeInTheDocument();
    expect(screen.getByText('1.0')).toBeInTheDocument();
  });

  it('renders item list when dataset has items', () => {
    storeState.currentDataset = makeDetail();
    render(<DatasetDetailView datasetId="ds-1" open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByText('What is Linux?')).toBeInTheDocument();
    expect(screen.getByText('An operating system kernel')).toBeInTheDocument();
    expect(screen.getByText('What is Bash?')).toBeInTheDocument();
  });

  it('shows loading state while fetching', () => {
    storeState.isLoading = true;
    render(<DatasetDetailView datasetId="ds-1" open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByTestId('detail-loading')).toBeInTheDocument();
  });

  it('shows edit and delete buttons for each item', () => {
    storeState.currentDataset = makeDetail();
    render(<DatasetDetailView datasetId="ds-1" open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByLabelText('Edit item 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Delete item 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Edit item 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Delete item 2')).toBeInTheDocument();
  });

  it('shows Add Item button', () => {
    storeState.currentDataset = makeDetail();
    render(<DatasetDetailView datasetId="ds-1" open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /add item/i })).toBeInTheDocument();
  });

  it('enters edit mode when clicking edit button', async () => {
    storeState.currentDataset = makeDetail();
    render(<DatasetDetailView datasetId="ds-1" open={true} onOpenChange={vi.fn()} />);

    await user.click(screen.getByLabelText('Edit item 1'));

    expect(screen.getByTestId('edit-question')).toBeInTheDocument();
    expect(screen.getByTestId('edit-answer')).toBeInTheDocument();
  });

  it('calls updateItem when saving edit', async () => {
    storeState.currentDataset = makeDetail();
    mockUpdateItem.mockResolvedValue({});
    render(<DatasetDetailView datasetId="ds-1" open={true} onOpenChange={vi.fn()} />);

    await user.click(screen.getByLabelText('Edit item 1'));

    const questionInput = screen.getByTestId('edit-question');
    await user.clear(questionInput);
    await user.type(questionInput, 'Updated question');

    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(mockUpdateItem).toHaveBeenCalledWith('ds-1', 'item-1', {
      question: 'Updated question',
      expected_answer: 'An operating system kernel',
    });
  });

  it('cancels edit mode on cancel click', async () => {
    storeState.currentDataset = makeDetail();
    render(<DatasetDetailView datasetId="ds-1" open={true} onOpenChange={vi.fn()} />);

    await user.click(screen.getByLabelText('Edit item 1'));
    expect(screen.getByTestId('edit-question')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByTestId('edit-question')).not.toBeInTheDocument();
  });

  it('shows delete confirmation dialog when clicking delete', async () => {
    storeState.currentDataset = makeDetail();
    render(<DatasetDetailView datasetId="ds-1" open={true} onOpenChange={vi.fn()} />);

    await user.click(screen.getByLabelText('Delete item 1'));

    const alertDialog = screen.getByRole('alertdialog');
    expect(alertDialog).toBeInTheDocument();
    expect(within(alertDialog).getByText(/delete this item/i)).toBeInTheDocument();
  });

  it('calls deleteItem when confirming delete', async () => {
    storeState.currentDataset = makeDetail();
    mockDeleteItem.mockResolvedValue(undefined);
    render(<DatasetDetailView datasetId="ds-1" open={true} onOpenChange={vi.fn()} />);

    await user.click(screen.getByLabelText('Delete item 1'));
    await user.click(screen.getByRole('button', { name: /^delete$/i }));

    expect(mockDeleteItem).toHaveBeenCalledWith('ds-1', 'item-1');
  });

  it('shows add item form when clicking Add Item', async () => {
    storeState.currentDataset = makeDetail();
    render(<DatasetDetailView datasetId="ds-1" open={true} onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /add item/i }));

    expect(screen.getByTestId('new-item-question')).toBeInTheDocument();
    expect(screen.getByTestId('new-item-answer')).toBeInTheDocument();
  });

  it('calls addItems when saving new item', async () => {
    storeState.currentDataset = makeDetail();
    mockAddItems.mockResolvedValue([]);
    render(<DatasetDetailView datasetId="ds-1" open={true} onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /add item/i }));

    await user.type(screen.getByTestId('new-item-question'), 'New question');
    await user.type(screen.getByTestId('new-item-answer'), 'New answer');

    const saveButtons = screen.getAllByRole('button', { name: /save/i });
    await user.click(saveButtons[0]!);

    expect(mockAddItems).toHaveBeenCalledWith('ds-1', [
      { question: 'New question', expected_answer: 'New answer' },
    ]);
  });

  it('shows empty state when dataset has no items', () => {
    storeState.currentDataset = makeDetail({ items: [], item_count: 0 });
    render(<DatasetDetailView datasetId="ds-1" open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByText(/no items yet/i)).toBeInTheDocument();
  });

  it('disables save button for new item when question is empty', async () => {
    storeState.currentDataset = makeDetail();
    render(<DatasetDetailView datasetId="ds-1" open={true} onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /add item/i }));

    // Save button should be disabled when question is empty
    const saveButtons = screen.getAllByRole('button', { name: /save/i });
    expect(saveButtons[0]).toBeDisabled();
  });

  it('cancels delete when cancel is clicked in confirmation', async () => {
    storeState.currentDataset = makeDetail();
    render(<DatasetDetailView datasetId="ds-1" open={true} onOpenChange={vi.fn()} />);

    await user.click(screen.getByLabelText('Delete item 1'));
    const alertDialog = screen.getByRole('alertdialog');
    await user.click(within(alertDialog).getByRole('button', { name: /cancel/i }));

    expect(mockDeleteItem).not.toHaveBeenCalled();
  });
});
