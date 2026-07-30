import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { DatasetVersionSelector } from './DatasetVersionSelector';

const mockVersions = [
  {
    id: 'ver-1',
    dataset_id: 'ds-1',
    created_at: '2024-06-01T12:00:00Z',
    change_note: 'Initial version',
    item_count: 10,
  },
  {
    id: 'ver-2',
    dataset_id: 'ds-1',
    created_at: '2024-07-15T12:00:00Z',
    change_note: 'Added new questions',
    item_count: 15,
  },
];

const mockListDatasetVersions = vi.fn();

vi.mock('@/services/api', () => ({
  api: {
    listDatasetVersions: (...args: unknown[]) => mockListDatasetVersions(...args),
  },
}));

describe('DatasetVersionSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders versions list when dataset has versions', async () => {
    mockListDatasetVersions.mockResolvedValue(mockVersions);
    const onChange = vi.fn();

    render(<DatasetVersionSelector datasetId="ds-1" value={undefined} onChange={onChange} />);

    await waitFor(() => {
      expect(screen.getByTestId('version-selector')).toBeInTheDocument();
    });

    expect(mockListDatasetVersions).toHaveBeenCalledWith('ds-1');
  });

  it('defaults to Latest (auto)', async () => {
    mockListDatasetVersions.mockResolvedValue(mockVersions);
    const onChange = vi.fn();

    render(<DatasetVersionSelector datasetId="ds-1" value={undefined} onChange={onChange} />);

    await waitFor(() => {
      expect(screen.getByText('Latest (auto)')).toBeInTheDocument();
    });
  });

  it('renders nothing when dataset has no versions', async () => {
    mockListDatasetVersions.mockResolvedValue([]);
    const onChange = vi.fn();

    const { container } = render(
      <DatasetVersionSelector datasetId="ds-1" value={undefined} onChange={onChange} />,
    );

    await waitFor(() => {
      expect(container.innerHTML).toBe('');
    });
  });

  it('calls onChange with version ID on selection', async () => {
    mockListDatasetVersions.mockResolvedValue(mockVersions);
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<DatasetVersionSelector datasetId="ds-1" value={undefined} onChange={onChange} />);

    await waitFor(() => {
      expect(screen.getByTestId('version-selector')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('combobox'));

    const options = screen.getAllByRole('option');
    const versionOption = options.find((opt) => opt.textContent?.includes('10 items'));
    expect(versionOption).toBeDefined();
    await user.click(versionOption!);

    expect(onChange).toHaveBeenCalledWith('ver-1');
  });

  it('calls onChange with undefined when Latest is selected', async () => {
    mockListDatasetVersions.mockResolvedValue(mockVersions);
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<DatasetVersionSelector datasetId="ds-1" value="ver-1" onChange={onChange} />);

    await waitFor(() => {
      expect(screen.getByTestId('version-selector')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('combobox'));

    const latestOption = screen.getByRole('option', { name: 'Latest (auto)' });
    await user.click(latestOption);

    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('fetches new versions when datasetId changes', async () => {
    mockListDatasetVersions.mockResolvedValue(mockVersions);
    const onChange = vi.fn();

    const { rerender } = render(
      <DatasetVersionSelector datasetId="ds-1" value={undefined} onChange={onChange} />,
    );

    await waitFor(() => {
      expect(mockListDatasetVersions).toHaveBeenCalledWith('ds-1');
    });

    mockListDatasetVersions.mockResolvedValue([]);
    rerender(<DatasetVersionSelector datasetId="ds-2" value={undefined} onChange={onChange} />);

    await waitFor(() => {
      expect(mockListDatasetVersions).toHaveBeenCalledWith('ds-2');
    });
  });
});
