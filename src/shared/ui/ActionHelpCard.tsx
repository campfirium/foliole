import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { useTranslation } from '../localization/LocalizationProvider';

import { localizeActionHelpCopy } from './actionHelpLocalization';

import { cn } from '@/shared/lib/utils';

interface ActionHelpCardProps {
  children: ReactNode;
  help: ActionHelpCardCopy;
  placement?: ActionHelpCardPlacement;
}

interface TooltipPosition {
  side: 'above' | 'left' | 'right';
  x: number;
  y: number;
}

interface ActionHelpCardContentProps {
  help: ActionHelpCardCopy;
  position: TooltipPosition;
}

export interface ActionHelpCardCopy {
  body: string;
  detail?: string;
  title: string;
}

export type ActionHelpCardPlacement = 'above' | 'side';

const ACTION_HELP_CARD_DELAY_MS = 1000;
const ACTION_HELP_CARD_WIDTH = 248;
const ACTION_HELP_CARD_OFFSET = 24;
const ACTION_HELP_CARD_VIEWPORT_MARGIN = 16;

function clampHorizontalCenter(x: number) {
  const halfWidth = ACTION_HELP_CARD_WIDTH / 2;
  const min = ACTION_HELP_CARD_VIEWPORT_MARGIN + halfWidth;
  const max = window.innerWidth - ACTION_HELP_CARD_VIEWPORT_MARGIN - halfWidth;
  return Math.min(Math.max(x, min), max);
}

function resolvePosition(element: HTMLElement, placement: ActionHelpCardPlacement): TooltipPosition {
  const rect = element.getBoundingClientRect();
  if (placement === 'above') {
    return {
      side: 'above',
      x: clampHorizontalCenter(rect.left + rect.width / 2),
      y: rect.top - ACTION_HELP_CARD_OFFSET
    };
  }
  const canFitRight = rect.right + ACTION_HELP_CARD_WIDTH + ACTION_HELP_CARD_OFFSET <= window.innerWidth;
  const side = canFitRight || rect.left < ACTION_HELP_CARD_WIDTH ? 'right' : 'left';
  return {
    side,
    x: side === 'right' ? rect.right + ACTION_HELP_CARD_OFFSET : rect.left - ACTION_HELP_CARD_OFFSET,
    y: rect.top + rect.height / 2
  };
}

function positionTransform(side: TooltipPosition['side']) {
  if (side === 'above') return 'translate(-50%, -100%)';
  return side === 'right' ? 'translateY(-50%)' : 'translate(-100%, -50%)';
}

function ActionHelpCardContent({ help, position }: ActionHelpCardContentProps) {
  const t = useTranslation();
  const copy = localizeActionHelpCopy(t, help);
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
        transform: positionTransform(position.side),
        width: `${ACTION_HELP_CARD_WIDTH}px`
      }}
    >
      <h3 className="m-0 text-[14px] font-semibold leading-5 text-foreground/88">{copy.title}</h3>
      <p className="m-0 mt-1.5 text-[13px] font-normal leading-5 text-foreground/72">{copy.body}</p>
      {copy.detail ? (
        <p className="m-0 mt-2.5 border-t border-[var(--app-floating-divider-color)] pt-2 text-[12px] font-normal leading-4 text-foreground/48">
          {copy.detail}
        </p>
      ) : null}
    </div>,
    document.body
  );
}

function useActionHelpCardPosition(placement: ActionHelpCardPlacement) {
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
        setPosition(resolvePosition(triggerRef.current, placement));
      }
    }, ACTION_HELP_CARD_DELAY_MS);
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

export function ActionHelpCard({ children, help, placement = 'side' }: ActionHelpCardProps) {
  const { close, openAfterDelay, position, triggerRef } = useActionHelpCardPosition(placement);

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
      {position && typeof document !== 'undefined' ? <ActionHelpCardContent help={help} position={position} /> : null}
    </>
  );
}
