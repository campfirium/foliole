const ACCEPTANCE_APP_ID = 'com.foliole.android.acceptance';

async function removeUserPackage(args, packageId, options) {
  await args.execute(args.paths.adb,
    ['-s', args.serial, 'shell', 'am', 'force-stop', packageId], options);
  const uninstall = await args.execute(args.paths.adb,
    ['-s', args.serial, 'uninstall', packageId], options);
  if (uninstall.code === 0) return;
  const userUninstall = await args.execute(args.paths.adb,
    ['-s', args.serial, 'shell', 'pm', 'uninstall', '--user', '0', packageId], options);
  if (userUninstall.code === 0 && /success/iu.test(String(userUninstall.output))) return;
  const installed = await args.execute(args.paths.adb,
    ['-s', args.serial, 'shell', 'pm', 'path', '--user', '0', packageId], options);
  if (installed.code === 0 && !String(installed.output).includes('package:')) return;
  throw new Error(`A5 acceptance package cleanup failed: ${packageId}; `
    + `uninstall=${String(uninstall.output)}; user=${String(userUninstall.output)}`);
}

export async function removeA5AcceptanceApplication(args) {
  const options = { env: args.env, timeoutCode: 'a5_acceptance_cleanup_timeout',
    timeoutMs: 60_000 };
  await removeUserPackage(args, `${ACCEPTANCE_APP_ID}.test`, options);
  await removeUserPackage(args, ACCEPTANCE_APP_ID, options);
}

export { ACCEPTANCE_APP_ID };
