import { useEffect, useState, useCallback } from 'react';
import { Check, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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

import { useDatasetStore } from '@/stores/datasetStore';

interface DatasetDetailViewProps {
  datasetId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DatasetDetailView({ datasetId, open, onOpenChange }: DatasetDetailViewProps) {
  const {
    currentDataset,
    isLoading,
    fetchDataset,
    setCurrentDataset,
    addItems,
    updateItem,
    deleteItem,
  } = useDatasetStore();

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editQuestion, setEditQuestion] = useState('');
  const [editAnswer, setEditAnswer] = useState('');
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');

  useEffect(() => {
    if (open && datasetId) {
      fetchDataset(datasetId);
    }
  }, [open, datasetId, fetchDataset]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setCurrentDataset(null);
      setEditingItemId(null);
      setAddingItem(false);
    }
    onOpenChange(nextOpen);
  };

  const startEdit = useCallback((itemId: string, question: string, answer: string | null) => {
    setEditingItemId(itemId);
    setEditQuestion(question);
    setEditAnswer(answer ?? '');
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingItemId(null);
    setEditQuestion('');
    setEditAnswer('');
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editingItemId || !datasetId || !editQuestion.trim()) return;
    try {
      await updateItem(datasetId, editingItemId, {
        question: editQuestion,
        expected_answer: editAnswer || null,
      });
      toast.success('Item updated');
      cancelEdit();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update item');
    }
  }, [editingItemId, datasetId, editQuestion, editAnswer, updateItem, cancelEdit]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTargetId || !datasetId) return;
    try {
      await deleteItem(datasetId, deleteTargetId);
      toast.success('Item deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete item');
    }
    setDeleteTargetId(null);
  }, [deleteTargetId, datasetId, deleteItem]);

  const handleAddItem = useCallback(async () => {
    if (!datasetId || !newQuestion.trim()) return;
    try {
      await addItems(datasetId, [
        { question: newQuestion, expected_answer: newAnswer || undefined },
      ]);
      toast.success('Item added');
      setNewQuestion('');
      setNewAnswer('');
      setAddingItem(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add item');
    }
  }, [datasetId, newQuestion, newAnswer, addItems]);

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="right" size="wide" className="overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-12" data-testid="detail-loading">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : currentDataset ? (
            <>
              <SheetHeader>
                <SheetTitle>{currentDataset.name}</SheetTitle>
                {currentDataset.description && (
                  <SheetDescription>{currentDataset.description}</SheetDescription>
                )}
              </SheetHeader>

              <div className="grid grid-cols-2 gap-3 px-4">
                <div>
                  <p className="text-xs text-muted-foreground">Format</p>
                  <Badge variant="secondary">{currentDataset.format}</Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Version</p>
                  <p className="text-sm">{currentDataset.version}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Items</p>
                  <p className="text-sm">{currentDataset.item_count}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Created</p>
                  <p className="text-sm">
                    {new Date(currentDataset.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Tags</p>
                  {currentDataset.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {currentDataset.tags.map((tag) => (
                        <Badge key={tag} variant="outline">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No tags</p>
                  )}
                </div>
              </div>

              <div className="px-4">
                <Separator />
              </div>

              <div className="px-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">
                    Items ({currentDataset.items?.length ?? 0})
                  </h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAddingItem(true)}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Add Item
                  </Button>
                </div>

                {addingItem && (
                  <div className="rounded-md border border-primary/50 p-3 space-y-2">
                    <p className="text-xs text-muted-foreground">New item</p>
                    <Textarea
                      value={newQuestion}
                      onChange={(e) => setNewQuestion(e.target.value)}
                      placeholder="Enter question..."
                      rows={2}
                      data-testid="new-item-question"
                    />
                    <Textarea
                      value={newAnswer}
                      onChange={(e) => setNewAnswer(e.target.value)}
                      placeholder="Expected answer (optional)..."
                      rows={2}
                      data-testid="new-item-answer"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => void handleAddItem()}
                        disabled={!newQuestion.trim()}
                      >
                        <Check className="mr-1 h-4 w-4" />
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setAddingItem(false);
                          setNewQuestion('');
                          setNewAnswer('');
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {currentDataset.items && currentDataset.items.length > 0 ? (
                  <div className="max-h-[60vh] overflow-y-auto space-y-3">
                    {currentDataset.items.map((item, idx) => (
                      <div key={item.id} className="rounded-md border p-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground">#{idx + 1}</p>
                          <div className="flex gap-1">
                            {editingItemId !== item.id && (
                              <>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() =>
                                    startEdit(item.id, item.question, item.expected_answer)
                                  }
                                  aria-label={`Edit item ${idx + 1}`}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => setDeleteTargetId(item.id)}
                                  aria-label={`Delete item ${idx + 1}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                        {editingItemId === item.id ? (
                          <div className="space-y-2">
                            <Textarea
                              value={editQuestion}
                              onChange={(e) => setEditQuestion(e.target.value)}
                              rows={2}
                              data-testid="edit-question"
                            />
                            <Textarea
                              value={editAnswer}
                              onChange={(e) => setEditAnswer(e.target.value)}
                              rows={2}
                              data-testid="edit-answer"
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => void saveEdit()}
                                disabled={!editQuestion.trim()}
                              >
                                <Check className="mr-1 h-4 w-4" />
                                Save
                              </Button>
                              <Button size="sm" variant="outline" onClick={cancelEdit}>
                                <X className="mr-1 h-4 w-4" />
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="text-sm font-medium">{item.question}</p>
                            {item.expected_answer && (
                              <p className="text-sm text-muted-foreground">
                                {item.expected_answer}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No items yet. Click &quot;Add Item&quot; to get started.
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="flex justify-center py-12">
              <p className="text-sm text-muted-foreground">No dataset selected</p>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteTargetId} onOpenChange={(o) => !o && setDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this item? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
