import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children: React.ReactNode;
  footer?: React.ReactNode;
}

const SIZE_CLASSES: Record<NonNullable<DialogProps['size']>, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export const Dialog: React.FC<DialogProps> = ({
  open,
  onClose,
  title,
  description,
  size = 'md',
  children,
  footer,
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    const timer = window.setTimeout(() => {
      const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(
        'input, button, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      firstFocusable?.focus();
    }, 10);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-primary/45 backdrop-blur-[1px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={[
          'w-full rounded-lg bg-surface-ivory border border-border-warm shadow-dialog text-ink-primary flex flex-col max-h-[85vh]',
          SIZE_CLASSES[size],
        ].join(' ')}
      >
        <div className="px-5 py-3.5 border-b border-border-warm flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="font-heading text-base font-semibold text-ink-primary">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="text-xs text-ink-secondary mt-0.5">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1 rounded text-ink-secondary hover:text-ink-primary hover:bg-surface-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto text-sm">{children}</div>

        {footer && (
          <div className="px-5 py-3 bg-surface-cream/70 border-t border-border-warm rounded-b-lg flex items-center justify-end gap-2.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
