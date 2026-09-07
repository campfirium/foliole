import { stopKeepImportMonitor } from './keepImportMonitor.js';
import { stopManagedInboxMonitor } from './managedInboxMonitor.js';
import { stopReadwiseApiScheduler } from './readwiseApiScheduler.js';

export function stopReadwiseBackgroundServices() {
  stopManagedInboxMonitor();
  stopKeepImportMonitor();
  stopReadwiseApiScheduler();
}
