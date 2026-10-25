import { ResumeReviewAction } from '../shared/ui';

import { CompanionReviewActionFooter } from './CompanionReviewActionFooter';

export function CompanionFlowBrowseBar(props: { onResume(): void }) {
  return <CompanionReviewActionFooter primary={<ResumeReviewAction onResumeReviewItem={props.onResume} />} />;
}
