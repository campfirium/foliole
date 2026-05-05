import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';

type PanelElement = 'section' | 'aside' | 'div';

interface PanelProps<T extends PanelElement = 'section'> {
  as?: T;
  title: ReactNode;
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
  const useHeading = typeof title === 'string';

  return (
    <Component
      aria-label={ariaLabel}
      className={joinClassNames('ui-panel', className)}
      {...rest}
    >
      <header className="ui-panel-header">
        {useHeading ? <h2 className="ui-panel-title">{title}</h2> : <div className="ui-panel-title">{title}</div>}
        {actions}
      </header>
      <div className={joinClassNames('ui-panel-body', scrollBody && 'ui-panel-body-scroll', bodyClassName)}>
        {children}
      </div>
    </Component>
  );
}
