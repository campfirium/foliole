export interface NativeReadwiseWorkgroupHost {
  host_name: string;
  platform: string | null;
}

export interface NativeReadwiseHostAssignment {
  active_host_name: string | null;
  current_host_name: string;
  hosts: NativeReadwiseWorkgroupHost[];
  is_active: boolean;
  legacy_unassigned: boolean;
}
