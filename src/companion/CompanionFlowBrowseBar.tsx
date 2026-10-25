import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppButton } from '../shared/ui';

import { companionMobileRailClassName } from './companionCssCompatibility';

export function CompanionFlowBrowseBar(props: { onResume(): void; onExit(): void }) {
  const t = useTranslation();
  return (
    <footer aria-label={t('companion.review.toolbar')}
      className={`fixed inset-x-0 bottom-0 z-surface-overlay border-t border-companion-divider bg-companion-content ${companionMobileRailClassName} py-3 supports-[padding-bottom:calc(0px)]:[padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))]`}>
      <div className="mx-auto flex w-full max-w-[760px] items-center justify-between">
        <AppButton variant="subtle" onClick={props.onExit}>{t('companion.review.exit')}</AppButton>
        <AppButton onClick={props.onResume}>{t('desktop.reviewActions.resume')}</AppButton>
      </div>
    </footer>
  );
}
