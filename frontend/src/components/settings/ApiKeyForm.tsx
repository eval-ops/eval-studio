import { useState } from 'react';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useApiKeyStore } from '@/stores/apiKeyStore';
import type { ApiKeyResponse, ApiKeyCreateResponse } from '@/types';

interface ApiKeyFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiKey?: ApiKeyResponse;
  onCreated?: (response: ApiKeyCreateResponse) => void;
  onSaved?: () => void;
}

export function ApiKeyForm({ open, onOpenChange, apiKey, onCreated, onSaved }: ApiKeyFormProps) {
  const [formKey, setFormKey] = useState(0);

  const handleOpenChange = (nextOpen: boolean): void => {
    if (nextOpen) {
      setFormKey((k) => k + 1);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" size="wide" className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{apiKey ? 'Edit API Key' : 'Create API Key'}</SheetTitle>
        </SheetHeader>
        {open && (
          <ApiKeyFormInner
            key={formKey}
            apiKey={apiKey}
            onCreated={onCreated}
            onSaved={onSaved}
            onClose={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

interface ApiKeyFormInnerProps {
  apiKey?: ApiKeyResponse;
  onCreated?: (response: ApiKeyCreateResponse) => void;
  onSaved?: () => void;
  onClose: () => void;
}

function ApiKeyFormInner({ apiKey, onCreated, onSaved, onClose }: ApiKeyFormInnerProps) {
  const createApiKey = useApiKeyStore((s) => s.createApiKey);
  const updateApiKey = useApiKeyStore((s) => s.updateApiKey);

  const isEditMode = !!apiKey;

  const [name, setName] = useState(apiKey?.name ?? '');
  const [description, setDescription] = useState(apiKey?.description ?? '');
  const [errors, setErrors] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const validate = (): boolean => {
    const newErrors: string[] = [];
    if (!name.trim()) {
      newErrors.push('Name is required');
    }
    setErrors(newErrors);
    return newErrors.length === 0;
  };

  const handleSave = async (): Promise<void> => {
    if (!validate()) return;

    setIsSaving(true);
    try {
      if (isEditMode && apiKey) {
        await updateApiKey(apiKey.id, {
          name: name.trim(),
          description: description.trim() || null,
        });
        onSaved?.();
        onClose();
      } else {
        const response = await createApiKey({
          name: name.trim(),
          description: description.trim() || null,
        });
        onClose();
        onCreated?.(response);
      }
    } catch {
      setErrors(['Failed to save API key. Please try again.']);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 px-4 pb-4">
      {errors.length > 0 && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {errors.map((e, i) => (
            <p key={i}>{e}</p>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="api-key-name">Name</Label>
        <Input
          id="api-key-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., CI Pipeline Key"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="api-key-description">Description (optional)</Label>
        <Textarea
          id="api-key-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this key is used for..."
          rows={3}
        />
      </div>

      <div className="flex gap-2 pt-2">
        <Button onClick={handleSave} disabled={isSaving} className="flex-1">
          {isSaving ? 'Saving...' : isEditMode ? 'Update' : 'Create'}
        </Button>
        <Button variant="outline" onClick={onClose} className="flex-1">
          Cancel
        </Button>
      </div>
    </div>
  );
}
