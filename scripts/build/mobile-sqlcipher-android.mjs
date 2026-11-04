import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { downloadPinned, extractPinned, run } from './mobile-sqlcipher-sources.mjs';

function ndkBuild(root, version) {
  const properties = path.join(root, 'android/local.properties');
  const localSdk = existsSync(properties)
    ? readFileSync(properties, 'utf8').match(/^sdk\.dir=(.+)$/m)?.[1]?.replaceAll('\\:', ':') : null;
  const sdk = process.env.ANDROID_SDK_ROOT ?? process.env.ANDROID_HOME ?? localSdk;
  if (!sdk) throw new Error('ANDROID_SDK_ROOT is required to build mobile SQLCipher');
  const executable = path.join(sdk, 'ndk', version, 'ndk-build');
  if (!existsSync(executable)) throw new Error(`Install Android SDK ndk;${version} before building`);
  return executable;
}

async function prepareJni(cache, core, pins) {
  const source = await extractPinned(cache, 'android-source', pins.android);
  const tomcrypt = await extractPinned(cache, 'libtomcrypt', pins.libtomcrypt);
  const jni = path.join(source, 'sqlcipher/src/main/jni');
  cpSync(tomcrypt, path.join(jni, 'libtomcrypt/src'), { recursive: true });
  for (const name of ['sqlite3.c', 'sqlite3.h']) {
    copyFileSync(path.join(core.build, name), path.join(jni, 'sqlcipher', name));
  }
  copyFileSync(path.join(core.build, 'foliole_sqlite_rsync.inc'), path.join(jni, 'sqlcipher/foliole_sqlite_rsync.inc'));
  for (const name of ['FolioleFolderBackup.h', 'FolioleFolderBackupInternal.h',
    'FolioleFolderBackup.c', 'FolioleFolderBackupTransport.c', 'FolioleFolderBackupFingerprint.inc',
    'FolioleFolderBackupAndroid.h', 'FolioleFolderBackupAndroidIo.c',
    'FolioleFolderBackupAndroidVfs.c', 'FolioleFolderBackupAndroidJni.c']) {
    copyFileSync(path.join(core.nativeRoot, name), path.join(jni, 'sqlcipher', name));
  }
  const makefile = path.join(jni, 'sqlcipher/Android.mk');
  const text = readFileSync(makefile, 'utf8');
  if (!text.includes('-DSQLITE_ENABLE_DBPAGE_VTAB')) {
    writeFileSync(makefile, text.replace('LOCAL_CPPFLAGS +=',
      'LOCAL_CFLAGS += -DSQLITE_ENABLE_DBPAGE_VTAB\n\nLOCAL_CPPFLAGS +=')
      .replace('LOCAL_C_INCLUDES +=',
        'LOCAL_SRC_FILES += FolioleFolderBackup.c FolioleFolderBackupTransport.c FolioleFolderBackupAndroidIo.c FolioleFolderBackupAndroidVfs.c FolioleFolderBackupAndroidJni.c\n\nLOCAL_C_INCLUDES +='));
  }
  return { source, jni };
}

async function publishAndroidArtifact(root, cache, pins, artifact) {
  const pom = await downloadPinned(path.join(cache, 'downloads'), 'vendor.pom', pins.pom);
  const directory = path.join(root, '.cache/mobile-sqlcipher/maven/net/zetetic/sqlcipher-android', pins.version);
  mkdirSync(directory, { recursive: true });
  copyFileSync(artifact, path.join(directory, `sqlcipher-android-${pins.version}.aar`));
  copyFileSync(pom, path.join(directory, `sqlcipher-android-${pins.version}.pom`));
  return { artifact, version: pins.version, provider: 'LibTomCrypt', repository: path.dirname(directory) };
}

export async function buildAndroidSqlcipher({ root, cache, core, pins }) {
  const output = path.join(cache, 'android');
  const artifact = path.join(output, `sqlcipher-android-${pins.version}-dbpage.aar`);
  if (existsSync(artifact)) return publishAndroidArtifact(root, cache, pins, artifact);
  const ndk = ndkBuild(root, pins.ndk);
  const { source, jni } = await prepareJni(cache, core, pins);
  const libraries = path.join(output, 'libs');
  const env = { ...process.env };
  delete env.SQLCIPHER_CFLAGS;
  run(ndk, ['-j2', `NDK_PROJECT_PATH=${path.join(source, 'sqlcipher')}`,
    `APP_BUILD_SCRIPT=${path.join(jni, 'Android.mk')}`,
    `NDK_APPLICATION_MK=${path.join(jni, 'Application.mk')}`,
    'APP_PLATFORM=android-23', 'APP_ABI=arm64-v8a armeabi-v7a x86 x86_64',
    'APP_OPTIM=release', `NDK_OUT=${path.join(output, 'obj')}`, `NDK_LIBS_OUT=${libraries}`], { env });
  const vendor = await downloadPinned(path.join(cache, 'downloads'), 'vendor.aar', pins.aar);
  const unpacked = path.join(output, 'aar');
  mkdirSync(unpacked, { recursive: true });
  run('unzip', ['-q', '-o', vendor, '-d', unpacked]);
  for (const abi of ['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64']) {
    copyFileSync(path.join(libraries, abi, 'libsqlcipher.so'),
      path.join(unpacked, 'jni', abi, 'libsqlcipher.so'));
  }
  run('zip', ['-q', '-r', `${artifact}.partial.zip`, '.'], { cwd: unpacked });
  renameSync(`${artifact}.partial.zip`, artifact);
  return publishAndroidArtifact(root, cache, pins, artifact);
}
