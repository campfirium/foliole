import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'ghost' | 'subtle' | 'list';
type ButtonSize = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  active?: boolean;
}

function joinClassNames(...classNames: Array<string | undefined | false>) {
  return classNames.filter(Boolean).join(' ');
}

export function Button({
  children,
  variant = 'ghost',
  size = 'sm',
  className,
  active = false,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      className={joinClassNames(
        'ui-button',
        `ui-button-size-${size}`,
        `ui-button-variant-${variant}`,
        className
      )}
      data-active={active}
      type={type}
      {...rest}
    >
      {children}
    </button>
  );
}
