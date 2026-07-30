import { useEffect, useState } from 'react';

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

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function DatasetVersionSelector({
  datasetId,
  value,
  onChange,
}: DatasetVersionSelectorProps): React.JSX.Element | null {
  const [versions, setVersions] = useState<DatasetVersion[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset loading for new fetch
    setIsLoading(true);

    api
      .listDatasetVersions(datasetId)
      .then((data) => {
        if (!cancelled) {
          setVersions(data);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        console.error('Failed to fetch dataset versions:', err);
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
            {formatTimestamp(v.created_at)}
            {v.change_note ? ` - ${v.change_note}` : ''}
            {` (${v.item_count} items)`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
