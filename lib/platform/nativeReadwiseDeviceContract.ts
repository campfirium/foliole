export interface NativeReadwiseDeviceAssignment {
  active_device_id: string | null;
  active_device_name: string | null;
  current_device_id: string;
  current_device_name: string;
  is_active: boolean;
  legacy_unassigned: boolean;
}
