import { useEffect, useRef, useState } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/services/api';
import type { DatasetVersion } from '@/types';

const LATEST_VALUE = '__latest__';

interface DatasetVersionSelectorProps {
  datasetId: string;
  value: string | undefined;
  onChange: (versionId: string | undefined) => void;
}

function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString();
}

export function DatasetVersionSelector({
  datasetId,
  value,
  onChange,
}: DatasetVersionSelectorProps): React.JSX.Element | null {
  const [versions, setVersions] = useState<DatasetVersion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const currentDatasetId = useRef(datasetId);

  useEffect(() => {
    currentDatasetId.current = datasetId;
    let cancelled = false;

    api
      .listDatasetVersions(datasetId)
      .then((data) => {
        if (!cancelled) {
          setVersions(data);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setVersions([]);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [datasetId]);

  if (!isLoading && versions.length === 0) {
    return null;
  }

  const handleChange = (val: string): void => {
    onChange(val === LATEST_VALUE ? undefined : val);
  };

  return (
    <Select value={value ?? LATEST_VALUE} onValueChange={handleChange} disabled={isLoading}>
      <SelectTrigger className="w-full" data-testid="version-selector">
        <SelectValue placeholder={isLoading ? 'Loading versions...' : 'Select version...'} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={LATEST_VALUE}>Latest (auto)</SelectItem>
        {versions.map((v) => (
          <SelectItem key={v.id} value={v.id}>
            {formatRelativeDate(v.created_at)}
            {v.change_note ? ` - ${v.change_note.slice(0, 40)}` : ''}
            {` (${v.item_count} items)`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
