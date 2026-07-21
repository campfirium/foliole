export function createIosStateWritebackObservations() {
  return {
    ack_statuses: [] as string[],
    pack_requests: 0,
    push_requests: 0,
    pushed_object_types: [] as string[]
  };
}
