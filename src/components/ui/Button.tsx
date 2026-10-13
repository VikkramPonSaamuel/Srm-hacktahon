import React from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'critical';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-r from-burgundy via-burgundy to-[#852C4B] text-surface-ivory border border-burgundy-dark/60 hover:brightness-105 active:brightness-95 shadow-depth-sm cursor-pointer',
  secondary:
    'bg-surface-secondary text-ink-primary border border-border-warm hover:bg-border-warm/70 active:bg-border-warm shadow-depth-sm cursor-pointer',
  outline:
    'bg-surface-ivory text-ink-primary border border-border-warm hover:bg-surface-secondary/70 hover:border-burgundy/40 active:bg-surface-secondary shadow-depth-sm cursor-pointer',
  ghost:
    'bg-transparent text-ink-secondary border border-transparent hover:bg-surface-secondary/80 hover:text-ink-primary cursor-pointer',
  critical:
    'bg-gradient-to-r from-status-critical to-[#A82836] text-surface-ivory border border-status-critical/70 hover:brightness-105 active:brightness-95 shadow-depth-sm cursor-pointer',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: 'h-7 px-2.5 text-xs gap-1.5 rounded-lg font-medium',
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg font-medium',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-lg font-medium',
  lg: 'h-10 px-4 text-sm gap-2 rounded-lg font-semibold',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      disabled,
      className = '',
      children,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || isLoading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={isLoading || undefined}
        className={[
          'inline-flex items-center justify-center font-medium transition-colors duration-150 select-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy-accent focus-visible:ring-offset-1 focus-visible:ring-offset-surface-cream',
          'disabled:opacity-55 disabled:pointer-events-none',
          VARIANT_CLASSES[variant],
          SIZE_CLASSES[size],
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden="true" />
        ) : (
          leftIcon && <span className="shrink-0 inline-flex">{leftIcon}</span>
        )}
        {children && <span className="truncate">{children}</span>}
        {!isLoading && rightIcon && <span className="shrink-0 inline-flex">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';
