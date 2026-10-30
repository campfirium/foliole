import type { ReactNode } from 'react';

import { companionFlexRowGap1ClassName } from './companionCssCompatibility';

export function CompanionBottomBar(props: { children: ReactNode; className?: string; testId?: string }) {
  return (
    <footer
      className={`companion-bottom-bar fixed inset-x-0 bottom-0 z-workspace-overlay border-t border-companion-divider bg-companion-base px-4 pt-2 pb-2 [left:0] [right:0] [bottom:0] [height:4rem] [padding-top:0.5rem] [padding-bottom:0.5rem] [padding-left:1rem] [padding-right:1rem] supports-[padding-bottom:calc(0px)]:[height:calc(4rem+env(safe-area-inset-bottom))] supports-[padding-bottom:calc(0px)]:[padding-bottom:calc(0.5rem+env(safe-area-inset-bottom))] ${props.className ?? ''}`}
      data-testid={props.testId}
    >
      <div className={`mx-auto flex h-full w-full max-w-[760px] items-center ${companionFlexRowGap1ClassName}`}>
        {props.children}
      </div>
    </footer>
  );
}
