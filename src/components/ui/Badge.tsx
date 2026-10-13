import React from 'react';
import type { SemanticStatus } from '../../styles/tokens';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: SemanticStatus;
  dot?: boolean;
  mono?: boolean;
  size?: 'sm' | 'md';
}

const BADGE_STYLES: Record<SemanticStatus, { container: string; dot: string }> = {
  healthy: {
    container: 'bg-[#16845B]/10 text-[#16845B] border-[#16845B]/25',
    dot: 'bg-[#16845B]',
  },
  warning: {
    container: 'bg-[#C78625]/12 text-[#9A6517] border-[#C78625]/30',
    dot: 'bg-[#C78625]',
  },
  critical: {
    container: 'bg-[#C43C4B]/10 text-[#C43C4B] border-[#C43C4B]/25',
    dot: 'bg-[#C43C4B]',
  },
  info: {
    container: 'bg-[#5578C7]/10 text-[#5578C7] border-[#5578C7]/25',
    dot: 'bg-[#5578C7]',
  },
  neutral: {
    container: 'bg-[#776771]/12 text-[#564850] border-[#776771]/25',
    dot: 'bg-[#776771]',
  },
  burgundy: {
    container: 'bg-[#6D1735]/10 text-[#6D1735] border-[#6D1735]/25',
    dot: 'bg-[#6D1735]',
  },
};

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  dot = false,
  mono = false,
  size = 'sm',
  className = '',
  children,
  ...props
}) => {
  const style = BADGE_STYLES[variant];
  const sizeClass =
    size === 'sm' ? 'px-2 py-0.5 text-[11px] leading-4' : 'px-2.5 py-0.5 text-xs leading-5';

  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded border font-medium whitespace-nowrap',
        mono ? 'font-mono tracking-tight' : 'font-sans',
        sizeClass,
        style.container,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {dot && (
        <span
          className={['w-1.5 h-1.5 rounded-full shrink-0', style.dot].join(' ')}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
};

export interface MonoCodeProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
}

export const MonoCode: React.FC<MonoCodeProps> = ({ className = '', children, ...props }) => (
  <code
    className={[
      'font-mono text-xs px-1.5 py-0.5 rounded bg-surface-secondary/80 text-ink-primary border border-border-warm/80',
      className,
    ]
      .filter(Boolean)
      .join(' ')}
    {...props}
  >
    {children}
  </code>
);
