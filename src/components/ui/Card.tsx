import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'ivory' | 'cream' | 'subtle';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const SURFACE_CLASSES: Record<NonNullable<CardProps['variant']>, string> = {
  ivory: 'surface-card text-ink-primary',
  cream: 'bg-surface-cream/80 border border-border-warm shadow-depth-sm rounded-xl text-ink-primary',
  subtle: 'bg-surface-secondary/50 border border-border-warm/80 rounded-xl text-ink-primary',
};

const PADDING_CLASSES: Record<NonNullable<CardProps['padding']>, string> = {
  none: '',
  sm: 'p-3.5',
  md: 'p-4',
  lg: 'p-5 sm:p-6',
};

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'ivory', padding = 'none', className = '', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={[
          'rounded-xl text-ink-primary relative overflow-hidden',
          SURFACE_CLASSES[variant],
          PADDING_CLASSES[padding],
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      >
        {children}
      </div>
    );
  }
);
Card.displayName = 'Card';

export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  actions?: React.ReactNode;
  bordered?: boolean;
}

export const CardHeader: React.FC<CardHeaderProps> = ({
  actions,
  bordered = true,
  className = '',
  children,
  ...props
}) => {
  return (
    <div
      className={[
        'px-4 py-3 flex items-center justify-between gap-4',
        bordered ? 'border-b border-border-warm' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
    </div>
  );
};

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({
  className = '',
  children,
  ...props
}) => (
  <h2
    className={['font-heading text-sm font-semibold text-ink-primary tracking-tight', className]
      .filter(Boolean)
      .join(' ')}
    {...props}
  >
    {children}
  </h2>
);

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({
  className = '',
  children,
  ...props
}) => (
  <p
    className={['text-xs text-ink-secondary mt-0.5 leading-relaxed', className]
      .filter(Boolean)
      .join(' ')}
    {...props}
  >
    {children}
  </p>
);

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...props
}) => (
  <div className={['p-4', className].filter(Boolean).join(' ')} {...props}>
    {children}
  </div>
);

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...props
}) => (
  <div
    className={[
      'px-4 py-2.5 bg-surface-cream/60 border-t border-border-warm rounded-b-lg flex items-center justify-between gap-3 text-xs text-ink-secondary',
      className,
    ]
      .filter(Boolean)
      .join(' ')}
    {...props}
  >
    {children}
  </div>
);
