export interface NativeReadwiseWorkgroupDevice {
  device_id: string;
  device_name: string;
  platform: string | null;
}

export interface NativeReadwiseDeviceAssignment {
  active_device_id: string | null;
  active_device_name: string | null;
  current_device_id: string;
  current_device_name: string;
  devices: NativeReadwiseWorkgroupDevice[];
  is_active: boolean;
  legacy_unassigned: boolean;
}
