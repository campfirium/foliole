export const DOCUMENT_TOPIC_SEARCH_OPEN_EVENT = 'foliole:document-topic-search-open';

export function requestDocumentTopicSearchOpen() {
  window.dispatchEvent(new Event(DOCUMENT_TOPIC_SEARCH_OPEN_EVENT));
}
