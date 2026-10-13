import React, { useId, useState } from 'react';

export interface TooltipProps {
  content: React.ReactNode;
  side?: 'top' | 'bottom' | 'right' | 'left';
  children: React.ReactElement;
  disabled?: boolean;
}

const POSITION_CLASSES: Record<NonNullable<TooltipProps['side']>, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
};

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  side = 'top',
  children,
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();

  if (disabled || !content) {
    return children;
  }

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {React.cloneElement(children, {
        'aria-describedby': open ? tooltipId : undefined,
      } as React.HTMLAttributes<HTMLElement>)}
      {open && (
        <span
          id={tooltipId}
          role="tooltip"
          className={[
            'pointer-events-none absolute z-50 px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap',
            'bg-ink-primary text-surface-ivory border border-ink-primary shadow-elevated',
            POSITION_CLASSES[side],
          ].join(' ')}
        >
          {content}
        </span>
      )}
    </span>
  );
};
