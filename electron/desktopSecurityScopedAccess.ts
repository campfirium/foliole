import {
  restoreMacosFileSecurityScopedBookmarks,
  stopMacosFileSecurityScopedBookmarks
} from './macosFileSecurityBookmarks.js';
import { restoreSecurityScopedBookmarks, stopSecurityScopedBookmarks } from './securityScopedBookmarks.js';

export function restoreDesktopSecurityScopedAccess() {
  restoreMacosFileSecurityScopedBookmarks();
  restoreSecurityScopedBookmarks();
}

export function stopDesktopSecurityScopedAccess() {
  stopMacosFileSecurityScopedBookmarks();
  stopSecurityScopedBookmarks();
}
