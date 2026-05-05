import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';

type PanelElement = 'section' | 'aside' | 'div';

interface PanelProps<T extends PanelElement = 'section'> {
  as?: T;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  ariaLabel?: string;
  scrollBody?: boolean;
}

function joinClassNames(...classNames: Array<string | undefined | false>) {
  return classNames.filter(Boolean).join(' ');
}

export function Panel<T extends PanelElement = 'section'>({
  as,
  title,
  actions,
  children,
  className,
  bodyClassName,
  ariaLabel,
  scrollBody = false,
  ...rest
}: PanelProps<T> & Omit<ComponentPropsWithoutRef<T>, keyof PanelProps>) {
  const Component = (as ?? 'section') as ElementType;

  return (
    <Component
      aria-label={ariaLabel}
      className={joinClassNames('ui-panel', className)}
      {...rest}
    >
      <header className="ui-panel-header">
        <h2 className="ui-panel-title">{title}</h2>
        {actions}
      </header>
      <div className={joinClassNames('ui-panel-body', scrollBody && 'ui-panel-body-scroll', bodyClassName)}>
        {children}
      </div>
    </Component>
  );
}
