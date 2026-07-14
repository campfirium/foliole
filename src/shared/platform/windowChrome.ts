export function usesNativeMacOSWindowControls(
  platform = navigator.platform,
  userAgent = navigator.userAgent
) {
  return `${platform} ${userAgent}`.toLowerCase().includes('mac');
}
