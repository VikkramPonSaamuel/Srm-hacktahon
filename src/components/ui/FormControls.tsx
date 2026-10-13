import React, { useId } from 'react';

export interface FormFieldProps {
  label: string;
  htmlFor?: string;
  helperText?: string;
  errorText?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  htmlFor,
  helperText,
  errorText,
  required,
  children,
  className = '',
}) => {
  return (
    <div className={['space-y-1.5', className].filter(Boolean).join(' ')}>
      <label
        htmlFor={htmlFor}
        className="block text-xs font-medium text-ink-primary tracking-tight"
      >
        {label}
        {required && <span className="text-status-critical ml-0.5">*</span>}
      </label>
      {children}
      {errorText ? (
        <p className="text-[11px] text-status-critical font-medium" role="alert">
          {errorText}
        </p>
      ) : (
        helperText && <p className="text-[11px] text-ink-secondary">{helperText}</p>
      )}
    </div>
  );
};

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  leftAddon?: React.ReactNode;
  rightAddon?: React.ReactNode;
  hasError?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ leftAddon, rightAddon, hasError = false, className = '', ...props }, ref) => {
    return (
      <div className="relative flex items-center">
        {leftAddon && (
          <span className="absolute left-2.5 text-ink-secondary pointer-events-none flex items-center">
            {leftAddon}
          </span>
        )}
        <input
          ref={ref}
          className={[
            'w-full h-8 rounded-md bg-surface-ivory text-xs text-ink-primary placeholder:text-ink-secondary/75',
            'border transition-colors duration-150',
            hasError
              ? 'border-status-critical focus-visible:ring-status-critical'
              : 'border-border-warm hover:border-border-strong focus-visible:border-burgundy-accent',
            leftAddon ? 'pl-8' : 'px-3',
            rightAddon ? 'pr-8' : 'px-3',
            'disabled:bg-surface-secondary/50 disabled:text-ink-secondary disabled:cursor-not-allowed',
            className,
          ]
            .filter(Boolean)
            .join(' ')}
          {...props}
        />
        {rightAddon && (
          <span className="absolute right-2.5 text-ink-secondary flex items-center">
            {rightAddon}
          </span>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: readonly SelectOption[];
  hasError?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ options, hasError = false, className = '', ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={[
          'h-8 rounded-md bg-surface-ivory px-2.5 pr-7 text-xs text-ink-primary',
          'border transition-colors duration-150 cursor-pointer',
          hasError
            ? 'border-status-critical'
            : 'border-border-warm hover:border-border-strong focus-visible:border-burgundy-accent',
          'disabled:bg-surface-secondary/50 disabled:text-ink-secondary disabled:cursor-not-allowed',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }
);
Select.displayName = 'Select';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ hasError = false, className = '', ...props }, ref) => (
    <textarea
      ref={ref}
      className={[
        'w-full rounded-md bg-surface-ivory p-2.5 text-xs text-ink-primary placeholder:text-ink-secondary/75',
        'border transition-colors duration-150',
        hasError
          ? 'border-status-critical'
          : 'border-border-warm hover:border-border-strong focus-visible:border-burgundy-accent',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}) => {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-3">
      {(label || description) && (
        <div>
          {label && (
            <label htmlFor={id} className="text-xs font-medium text-ink-primary cursor-pointer">
              {label}
            </label>
          )}
          {description && <p className="text-[11px] text-ink-secondary mt-0.5">{description}</p>}
        </div>
      )}
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={[
          'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border transition-colors duration-150',
          checked
            ? 'bg-burgundy border-burgundy-dark'
            : 'bg-surface-secondary border-border-strong',
          'disabled:opacity-50 disabled:cursor-not-allowed',
        ].join(' ')}
      >
        <span
          aria-hidden="true"
          className={[
            'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-surface-ivory shadow transition duration-150',
            checked ? 'translate-x-4' : 'translate-x-0',
          ].join(' ')}
        />
      </button>
    </div>
  );
};
