export const DAILY_FLOW_NO_OTHER_TOPICS = 'daily_flow_no_other_topics';

export type SoonReviewActionResult = boolean | typeof DAILY_FLOW_NO_OTHER_TOPICS;

export function isDailyFlowNoOtherTopics(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /\bdaily_flow_no_other_topics\b/u.test(message);
}
