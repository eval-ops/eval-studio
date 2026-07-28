import { useState, useCallback, useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { TagEditor } from '@/components/ui/tag-editor';
import { useDatasetStore } from '@/stores/datasetStore';

interface ItemRow {
  key: number;
  question: string;
  expected_answer: string;
}

interface CreateDatasetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateDatasetDialog({ open, onOpenChange }: CreateDatasetDialogProps) {
  const uploadDataset = useDatasetStore((s) => s.uploadDataset);
  const fetchDatasets = useDatasetStore((s) => s.fetchDatasets);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [items, setItems] = useState<ItemRow[]>([{ key: 0, question: '', expected_answer: '' }]);
  const [nextKey, setNextKey] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const hasContent = useMemo(
    () =>
      name.trim() !== '' ||
      description.trim() !== '' ||
      tags.length > 0 ||
      items.some((item) => item.question.trim() !== '' || item.expected_answer.trim() !== ''),
    [name, description, tags, items],
  );

  const isValid = useMemo(
    () => name.trim() !== '' && items.some((item) => item.question.trim() !== ''),
    [name, items],
  );

  const resetForm = useCallback(() => {
    setName('');
    setDescription('');
    setTags([]);
    setItems([{ key: 0, question: '', expected_answer: '' }]);
    setNextKey(1);
    setIsSaving(false);
  }, []);

  const addItem = useCallback(() => {
    setItems((prev) => [...prev, { key: nextKey, question: '', expected_answer: '' }]);
    setNextKey((k) => k + 1);
  }, [nextKey]);

  const removeItem = useCallback((key: number) => {
    setItems((prev) => prev.filter((item) => item.key !== key));
  }, []);

  const updateItem = useCallback(
    (key: number, field: 'question' | 'expected_answer', value: string) => {
      setItems((prev) =>
        prev.map((item) => (item.key === key ? { ...item, [field]: value } : item)),
      );
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!isValid) return;
    setIsSaving(true);
    try {
      const validItems = items
        .filter((item) => item.question.trim() !== '')
        .map((item) => ({
          question: item.question,
          expected_answer: item.expected_answer || undefined,
        }));

      await uploadDataset({
        name,
        description: description || undefined,
        format: 'qa_pairs',
        version: '1.0',
        tags,
        items: validItems,
      });

      toast.success(`Dataset "${name}" created`);
      fetchDatasets();
      resetForm();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create dataset');
    } finally {
      setIsSaving(false);
    }
  }, [
    isValid,
    items,
    name,
    description,
    tags,
    uploadDataset,
    fetchDatasets,
    resetForm,
    onOpenChange,
  ]);

  const handleCancel = useCallback(() => {
    if (hasContent) {
      setShowDiscardConfirm(true);
    } else {
      resetForm();
      onOpenChange(false);
    }
  }, [hasContent, resetForm, onOpenChange]);

  const handleConfirmDiscard = useCallback(() => {
    setShowDiscardConfirm(false);
    resetForm();
    onOpenChange(false);
  }, [resetForm, onOpenChange]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        handleCancel();
      }
    },
    [handleCancel],
  );

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Dataset</DialogTitle>
            <DialogDescription>
              Manually author question/answer pairs for evaluation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create-ds-name">Name</Label>
              <Input
                id="create-ds-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Dataset name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-ds-description">Description</Label>
              <Textarea
                id="create-ds-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Tags</Label>
              <TagEditor tags={tags} onChange={setTags} />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Items ({items.length})</Label>
                <Button type="button" variant="outline" size="sm" onClick={addItem}>
                  <Plus className="mr-1 h-4 w-4" />
                  Add Item
                </Button>
              </div>

              <div className="max-h-[40vh] overflow-y-auto space-y-3">
                {items.map((item, idx) => (
                  <div key={item.key} className="rounded-md border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">#{idx + 1}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => removeItem(item.key)}
                        aria-label={`Remove item ${idx + 1}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <Textarea
                      value={item.question}
                      onChange={(e) => updateItem(item.key, 'question', e.target.value)}
                      placeholder="Enter question..."
                      rows={2}
                    />
                    <Textarea
                      value={item.expected_answer}
                      onChange={(e) => updateItem(item.key, 'expected_answer', e.target.value)}
                      placeholder="Expected answer (optional)..."
                      rows={2}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="button" disabled={!isValid || isSaving} onClick={() => void handleSave()}>
              {isSaving ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to discard them?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDiscard}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
