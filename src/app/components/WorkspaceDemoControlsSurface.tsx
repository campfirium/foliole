import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { useDemoRuntimeState } from '../../shared/platform/runtime/demoRuntime';
import { inspectorListInsetPaddingClassName, inspectorListMetaClassName } from '../../shared/ui';
import type { ReviewFlowWindow } from '../../store/workspaceReviewFlowWindow';

import { getDemoPreviewDisplayDay } from './workspaceRightSidebarReviewQueueDays';

export function WorkspaceDemoControlsSurface({
  flowWindow
}: {
  flowWindow?: ReviewFlowWindow | undefined;
}) {
  const t = useTranslation();
  const demoState = useDemoRuntimeState();
  if (!demoState.isDemo || !shouldShowDayClearNotice(flowWindow)) {
    return null;
  }

  return (
    <aside
      aria-label={t('desktop.rightPanel.flow.demo.notice')}
      className={`${inspectorListInsetPaddingClassName} border-b border-border/55 pb-3 pt-1`}
    >
      <p className="m-0 text-[13px] font-medium text-foreground/78">
        {t('desktop.rightPanel.flow.demo.dayClearTitle', { day: getDemoPreviewDisplayDay(demoState.previewDay) })}
      </p>
      <p className={`m-0 mt-1 ${inspectorListMetaClassName}`}>
        {t('desktop.rightPanel.flow.demo.dayClearDescription')}
      </p>
    </aside>
  );
}

function shouldShowDayClearNotice(flowWindow: ReviewFlowWindow | undefined) {
  if (!flowWindow) return false;
  const currentDayCount = flowWindow.queueNodeIds.length + flowWindow.readyNodeIds.length;
  return currentDayCount === 0 && flowWindow.dayBuckets.some((bucket) => bucket.dayOffset > 0 && bucket.nodeIds.length > 0);
}
