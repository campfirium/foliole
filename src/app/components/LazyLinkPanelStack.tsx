import { lazy, Suspense } from 'react';

import type { LinkPanelStackProps } from './LinkPanelStack';

const LinkPanelStack = lazy(() => import('./LinkPanelStack').then((module) => ({ default: module.LinkPanelStack })));

export function LazyLinkPanelStack(props: LinkPanelStackProps) {
  if (props.panels.length === 0) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <LinkPanelStack {...props} />
    </Suspense>
  );
}
