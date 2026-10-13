import React, { useEffect, useRef, useState } from 'react';

export interface DropdownMenuItem {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
  onSelect: () => void;
}

export interface DropdownMenuProps {
  trigger: React.ReactElement<{
    onClick?: React.MouseEventHandler;
    'aria-expanded'?: boolean;
    'aria-haspopup'?: 'menu';
  }>;
  items?: DropdownMenuItem[];
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  align?: 'left' | 'right';
  widthClass?: string;
  ariaLabel?: string;
}

export const DropdownMenu: React.FC<DropdownMenuProps> = ({
  trigger,
  items,
  header,
  footer,
  children,
  align = 'right',
  widthClass = 'w-64',
  ariaLabel = 'Menu options',
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-flex">
      {React.cloneElement(trigger, {
        onClick: (e: React.MouseEvent) => {
          trigger.props.onClick?.(e);
          setOpen((prev) => !prev);
        },
        'aria-expanded': open,
        'aria-haspopup': 'menu',
      })}

      {open && (
        <div
          role="menu"
          aria-label={ariaLabel}
          className={[
            'absolute top-full mt-1.5 z-40 rounded-lg bg-surface-ivory border border-border-warm shadow-elevated text-ink-primary overflow-hidden',
            align === 'right' ? 'right-0' : 'left-0',
            widthClass,
          ].join(' ')}
        >
          {header && (
            <div className="px-3.5 py-2.5 border-b border-border-warm bg-surface-cream/60 text-xs">
              {header}
            </div>
          )}

          {children ? (
            <div className="p-2">{children}</div>
          ) : (
            <div className="py-1">
              {items?.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    if (!item.disabled) {
                      item.onSelect();
                      setOpen(false);
                    }
                  }}
                  className={[
                    'w-full px-3.5 py-2 text-left text-xs flex items-start justify-between gap-2.5 transition-colors',
                    item.danger
                      ? 'text-status-critical hover:bg-status-critical/10'
                      : 'text-ink-primary hover:bg-surface-secondary/80',
                    'disabled:opacity-50 disabled:pointer-events-none',
                  ].join(' ')}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    {item.icon && (
                      <span className="mt-0.5 text-ink-secondary shrink-0">{item.icon}</span>
                    )}
                    <div className="min-w-0">
                      <div className="font-medium truncate">{item.label}</div>
                      {item.description && (
                        <div className="text-[11px] text-ink-secondary mt-0.5 leading-snug">
                          {item.description}
                        </div>
                      )}
                    </div>
                  </div>
                  {item.badge && <div className="shrink-0">{item.badge}</div>}
                </button>
              ))}
            </div>
          )}

          {footer && (
            <div className="px-3.5 py-2 border-t border-border-warm bg-surface-cream/50 text-xs">
              {footer}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
