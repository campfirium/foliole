export interface NativeReadwiseWorkgroupHost {
  host_name: string;
  platform: string | null;
}

export interface NativeReadwiseHostAssignment {
  active_host_name: string | null;
  active_device_identity_key: string | null;
  active_owner_epoch: number;
  current_host_name: string;
  current_device_identity_key: string | null;
  hosts: NativeReadwiseWorkgroupHost[];
  is_active: boolean;
  legacy_unassigned: boolean;
  handoff_pending: boolean;
  activation_blocked_reason:
    | 'handoff-required' | 'handoff-in-progress' | 'group-quiescence-required'
    | 'connection-unavailable' | 'guard-unavailable' | 'guard-history' | null;
}

export interface NativeReadwiseJoinDecision {
  kind: 'none' | 'waiting' | 'choose' | 'switching';
  devices: Array<{ device_id: string; device_name: string }>;
  reason?: string;
}
