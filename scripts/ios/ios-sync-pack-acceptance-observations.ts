export function createIosSyncPackAcceptanceObservations() {
  return {
    ack_statuses: [] as string[],
    capture_node_id: null as string | null,
    push_requests: 0,
    pushed_node_ids: [] as string[],
    pushed_version_ids: [] as string[],
    request_urls: [] as string[]
  };
}
