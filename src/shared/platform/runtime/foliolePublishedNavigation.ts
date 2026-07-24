const listeners = new Set<() => void>();

export function requestOpenFoliolePublishedTopics() {
  listeners.forEach((listener) => listener());
}

export function subscribeOpenFoliolePublishedTopics(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
