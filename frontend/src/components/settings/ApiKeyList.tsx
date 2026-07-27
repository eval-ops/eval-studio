import { useEffect, useState } from 'react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, AlertTriangle, Info, ShieldOff } from 'lucide-react';
import { useApiKeyStore } from '@/stores/apiKeyStore';
import { getStoredApiKey } from '@/services/api';
import { ApiKeyForm } from './ApiKeyForm';
import { ApiKeyRevealDialog } from './ApiKeyRevealDialog';
import type { ApiKeyResponse, ApiKeyCreateResponse } from '@/types';

export function ApiKeyList() {
  const apiKeys = useApiKeyStore((s) => s.apiKeys);
  const isLoading = useApiKeyStore((s) => s.isLoading);
  const error = useApiKeyStore((s) => s.error);
  const authDisabled = useApiKeyStore((s) => s.authDisabled);
  const fetchApiKeys = useApiKeyStore((s) => s.fetchApiKeys);
  const revokeApiKey = useApiKeyStore((s) => s.revokeApiKey);
  const fetchAuthStatus = useApiKeyStore((s) => s.fetchAuthStatus);
  const clearError = useApiKeyStore((s) => s.clearError);

  const [formOpen, setFormOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<ApiKeyResponse | undefined>(undefined);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyResponse | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [revealKey, setRevealKey] = useState<string | null>(null);

  useEffect(() => {
    // Bootstrap: fetch keys and auth status, then auto-open the create form
    // if no keys exist and auth is enabled (first-time setup flow).
    let cancelled = false;
    async function init(): Promise<void> {
      await Promise.all([fetchApiKeys(), fetchAuthStatus()]);
      if (cancelled) return;
      const state = useApiKeyStore.getState();
      if (state.apiKeys.length === 0 && state.authDisabled === false) {
        setEditingKey(undefined);
        setFormOpen(true);
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [fetchApiKeys, fetchAuthStatus]);

  const storedKey = getStoredApiKey();
  const activeKeys = apiKeys.filter((k) => k.is_active);
  const storedKeyMatchesActive =
    !storedKey || activeKeys.some((k) => storedKey.startsWith(k.key_prefix.replace('..', '')));

  const handleNew = (): void => {
    setEditingKey(undefined);
    setFormOpen(true);
  };

  const handleEdit = (key: ApiKeyResponse): void => {
    setEditingKey(key);
    setFormOpen(true);
  };

  const handleCreated = (response: ApiKeyCreateResponse): void => {
    setRevealKey(response.raw_key);
  };

  const handleRevealDone = (): void => {
    setRevealKey(null);
    fetchApiKeys();
  };

  const handleSaved = (): void => {
    fetchApiKeys();
  };

  const handleRevoke = async (): Promise<void> => {
    if (!revokeTarget) return;
    setRevokeError(null);
    try {
      await revokeApiKey(revokeTarget.id);
      setRevokeTarget(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to revoke key. It may be the last active key.';
      setRevokeError(message);
    }
  };

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="space-y-4">
      {authDisabled && (
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/50">
          <ShieldOff className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
          <div className="text-[13px] text-blue-800 dark:text-blue-300">
            <p className="font-medium">Authentication is disabled</p>
            <p className="mt-1 text-blue-700 dark:text-blue-400">
              API keys can still be created and managed, but they are not currently enforced for API
              access. Enable authentication in the server configuration to require API keys.
            </p>
          </div>
        </div>
      )}

      {storedKey && !storedKeyMatchesActive && apiKeys.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/50">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="text-[13px] text-amber-800 dark:text-amber-300">
            <p className="font-medium">Active key mismatch</p>
            <p className="mt-1 text-amber-700 dark:text-amber-400">
              The API key stored in this browser does not match any active key. Create a new key or
              update your stored key.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/50">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
          <p className="text-[13px] text-red-800 dark:text-red-300">{error}</p>
          <button
            className="ml-auto text-[12px] text-red-600 underline dark:text-red-400"
            onClick={clearError}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-[13px] text-text-3">
          <Info className="h-3.5 w-3.5" />
          <span>
            {apiKeys.length} key{apiKeys.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          className="inline-flex items-center rounded-[9px] bg-primary px-4 py-2.5 text-[13px] font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
          onClick={handleNew}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Create API Key
        </button>
      </div>

      {isLoading && (
        <div className="flex justify-center py-8">
          <p className="text-[13px] text-text-3">Loading API keys...</p>
        </div>
      )}

      {!isLoading && apiKeys.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-[14px] border border-dashed border-border py-12">
          <p className="text-[13px] text-text-3">No API keys yet. Create one to get started.</p>
        </div>
      )}

      {!isLoading && apiKeys.length > 0 && (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[12px]">Name</TableHead>
                <TableHead className="text-[12px]">Key Prefix</TableHead>
                <TableHead className="text-[12px]">Description</TableHead>
                <TableHead className="text-[12px]">Created</TableHead>
                <TableHead className="text-[12px]">Last Used</TableHead>
                <TableHead className="text-[12px]">Status</TableHead>
                <TableHead className="text-right text-[12px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apiKeys.map((key) => {
                const isCurrentKey =
                  storedKey && storedKey.startsWith(key.key_prefix.replace('..', ''));

                return (
                  <TableRow key={key.id}>
                    <TableCell className="text-[13px] font-medium">{key.name}</TableCell>
                    <TableCell>
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                        {key.key_prefix}
                      </code>
                    </TableCell>
                    <TableCell
                      className="max-w-[200px] truncate text-[12px] text-text-3"
                      title={key.description ?? undefined}
                    >
                      {key.description || '-'}
                    </TableCell>
                    <TableCell className="text-[12px] text-text-3">
                      {formatDate(key.created_at)}
                    </TableCell>
                    <TableCell className="text-[12px] text-text-3">
                      {formatDate(key.last_used_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {key.is_active ? (
                          <Badge
                            variant="default"
                            className="bg-pass-bg text-pass text-[10px] border-0"
                          >
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">
                            Revoked
                          </Badge>
                        )}
                        {isCurrentKey && (
                          <Badge
                            variant="outline"
                            className="text-[10px] border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400"
                          >
                            Current
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          className="rounded-md p-1.5 text-text-3 transition-colors hover:bg-surface-3 hover:text-foreground"
                          onClick={() => handleEdit(key)}
                          aria-label={`Edit ${key.name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {key.is_active && (
                          <button
                            className="rounded-md p-1.5 text-text-3 transition-colors hover:bg-surface-3 hover:text-foreground"
                            onClick={() => setRevokeTarget(key)}
                            aria-label={`Revoke ${key.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <ApiKeyForm
        open={formOpen}
        onOpenChange={setFormOpen}
        apiKey={editingKey}
        onCreated={handleCreated}
        onSaved={handleSaved}
      />

      {revealKey && (
        <ApiKeyRevealDialog open={!!revealKey} rawKey={revealKey} onDone={handleRevealDone} />
      )}

      <AlertDialog
        open={!!revokeTarget}
        onOpenChange={(open) => {
          if (!open) {
            setRevokeTarget(null);
            setRevokeError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API Key</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke &quot;{revokeTarget?.name}&quot;? This action cannot
              be undone. Any systems using this key will lose access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {revokeError && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {revokeError}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevoke}>Revoke</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
