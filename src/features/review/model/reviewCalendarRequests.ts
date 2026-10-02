const OPEN_REVIEW_CALENDAR_EVENT = 'foliole:open-review-calendar';

export function requestReviewCalendarOpen() {
  window.dispatchEvent(new Event(OPEN_REVIEW_CALENDAR_EVENT));
}

export function subscribeReviewCalendarOpen(listener: () => void) {
  window.addEventListener(OPEN_REVIEW_CALENDAR_EVENT, listener);
  return () => window.removeEventListener(OPEN_REVIEW_CALENDAR_EVENT, listener);
}
