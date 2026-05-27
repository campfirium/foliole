import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/shared/lib/utils';

interface MenuHelpTooltipProps {
  children: ReactNode;
  help: MenuHelpTooltipCopy;
}

interface TooltipPosition {
  side: 'left' | 'right';
  x: number;
  y: number;
}

interface MenuHelpTooltipContentProps {
  help: MenuHelpTooltipCopy;
  position: TooltipPosition;
}

export interface MenuHelpTooltipCopy {
  body: string;
  detail?: string;
  title: string;
}

const MENU_HELP_TOOLTIP_DELAY_MS = 1000;
const MENU_HELP_TOOLTIP_WIDTH = 248;
const MENU_HELP_TOOLTIP_OFFSET = 24;

function resolvePosition(element: HTMLElement): TooltipPosition {
  const rect = element.getBoundingClientRect();
  const canFitRight = rect.right + MENU_HELP_TOOLTIP_WIDTH + MENU_HELP_TOOLTIP_OFFSET <= window.innerWidth;
  const side = canFitRight || rect.left < MENU_HELP_TOOLTIP_WIDTH ? 'right' : 'left';
  return {
    side,
    x: side === 'right' ? rect.right + MENU_HELP_TOOLTIP_OFFSET : rect.left - MENU_HELP_TOOLTIP_OFFSET,
    y: rect.top + rect.height / 2
  };
}

function MenuHelpTooltipContent({ help, position }: MenuHelpTooltipContentProps) {
  return createPortal(
    <div
      className={cn(
        'pointer-events-none fixed z-popover-elevated max-w-[min(15.5rem,calc(100vw-2rem))]',
        'rounded-[1rem] border border-[var(--app-floating-border-color)] px-4 py-3 shadow-popover',
        'bg-[color-mix(in_oklab,var(--app-floating-surface-bg)_88%,rgb(var(--color-background)))]',
        'text-left'
      )}
      role="tooltip"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: position.side === 'right' ? 'translateY(-50%)' : 'translate(-100%, -50%)',
        width: `${MENU_HELP_TOOLTIP_WIDTH}px`
      }}
    >
      <h3 className="m-0 text-[14px] font-semibold leading-5 text-foreground/88">{help.title}</h3>
      <p className="m-0 mt-1.5 text-[13px] font-normal leading-5 text-foreground/72">{help.body}</p>
      {help.detail ? (
        <p className="m-0 mt-2.5 border-t border-[var(--app-floating-divider-color)] pt-2 text-[12px] font-normal leading-4 text-foreground/48">
          {help.detail}
        </p>
      ) : null}
    </div>,
    document.body
  );
}

function useMenuHelpTooltipPosition() {
  const triggerRef = useRef<HTMLElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  const close = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPosition(null);
  };
  const openAfterDelay = () => {
    if (timerRef.current || position) return;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (triggerRef.current) {
        setPosition(resolvePosition(triggerRef.current));
      }
    }, MENU_HELP_TOOLTIP_DELAY_MS);
  };

  useEffect(
    () => () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    },
    []
  );

  return { close, openAfterDelay, position, triggerRef };
}

export function MenuHelpTooltip({ children, help }: MenuHelpTooltipProps) {
  const { close, openAfterDelay, position, triggerRef } = useMenuHelpTooltipPosition();

  return (
    <>
      <span
        className="block"
        onPointerDown={close}
        onPointerEnter={openAfterDelay}
        onPointerLeave={close}
        ref={triggerRef}
      >
        {children}
      </span>
      {position && typeof document !== 'undefined' ? <MenuHelpTooltipContent help={help} position={position} /> : null}
    </>
  );
}
