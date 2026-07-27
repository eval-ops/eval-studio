import { useState } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Copy, Check } from 'lucide-react';
import { setStoredApiKey } from '@/services/api';

interface ApiKeyRevealDialogProps {
  open: boolean;
  rawKey: string;
  onDone: () => void;
}

export function ApiKeyRevealDialog({ open, rawKey, onDone }: ApiKeyRevealDialogProps): JSX.Element {
  const [copied, setCopied] = useState(false);
  const [setAsActive, setSetAsActive] = useState(true);

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(rawKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard write may fail in non-secure contexts */
    }
  };

  const handleDone = (): void => {
    if (setAsActive) {
      setStoredApiKey(rawKey);
    }
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>API Key Created</DialogTitle>
          <DialogDescription>
            This key will not be shown again. Make sure to copy it now.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md border bg-muted px-3 py-2 font-mono text-xs break-all select-all">
              {rawKey}
            </code>
            <Button variant="outline" size="icon" onClick={handleCopy} aria-label="Copy API key">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="set-active"
              checked={setAsActive}
              onCheckedChange={(checked) => setSetAsActive(checked === true)}
            />
            <Label htmlFor="set-active" className="cursor-pointer text-sm font-normal">
              Set as active key for this browser
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleDone} className="w-full sm:w-auto">
            Done — I&apos;ve saved my key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
