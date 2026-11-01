// @vitest-environment node

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';

import { collectAndroidDependencySecurity } from './android-dependency-security.mjs';
import { writeMavenFixturePackage } from './android-security-fixture.mjs';
import { execute } from './macos-a5-process.mjs';
import { macosA5GradleEnv } from './macos-a5-runtime-paths.mjs';

const versions = [
  ['com.google.guava', 'guava', '33.3.1-jre', '33.7.2-jre'],
  ['io.netty', 'netty-codec-http', '4.1.110.Final', '4.1.139.Final'],
  ['io.netty', 'netty-handler', '4.1.110.Final', '4.1.139.Final'],
  ['org.bouncycastle', 'bcprov-jdk18on', '1.79', '1.86'],
  ['org.bouncycastle', 'bcpkix-jdk18on', '1.79', '1.86'],
  ['org.apache.commons', 'commons-compress', '1.21', '1.28.0'],
  ['org.bitbucket.b_c', 'jose4j', '0.9.5', '0.9.7'],
  ['org.jdom', 'jdom2', '2.0.6', '2.0.6.1'],
  ['org.jetbrains.kotlin', 'kotlin-gradle-plugin', '2.0.21', '2.4.21']
];

function fixture(root) {
  const repository = path.join(root, 'repository');
  for (const [group, name, oldVersion, newVersion] of versions) {
    for (const version of [oldVersion, newVersion]) writeMavenFixturePackage(repository, name, version, '', group);
  }
  for (const version of ['1.8.22', '2.4.21']) writeMavenFixturePackage(repository, 'kotlin-stdlib', version, '', 'org.jetbrains.kotlin');
  writeMavenFixturePackage(repository, 'netty-handler', '4.1.200.Final', '', 'io.netty');
  writeFileSync(path.join(root, 'settings.gradle'), "rootProject.name = 'patched-buildscript'\ninclude ':app'\n");
  const policy = pathToFileURL(path.resolve('android/buildscript-security.gradle')).href;
  const runtimePolicy = pathToFileURL(path.resolve('android/kotlin-runtime.gradle')).href;
  const requested = versions.map(([group, name, version]) => `classpath '${group}:${name}:${version}'`).join('\n');
  writeFileSync(path.join(root, 'build.gradle'), `buildscript {
    apply from: '${policy}'
    if (!project.hasProperty('unpatchedFixture')) project.applyBuildscriptSecurity(buildscript)
    repositories { maven { url = uri('repository') } }
    dependencies { ${requested} }
  }
  subprojects { if (!rootProject.hasProperty('unpatchedFixture')) rootProject.applyBuildscriptSecurity(buildscript) }`);
  mkdirSync(path.join(root, 'app'));
  writeFileSync(path.join(root, 'app/build.gradle'), `buildscript {
    repositories { maven { url = uri('../repository') } }
    dependencies { classpath 'io.netty:netty-handler:4.1.200.Final' }
  }
  repositories { maven { url = uri('../repository') } }
  configurations { debugRuntimeClasspath; releaseRuntimeClasspath; kotlinCompilerClasspath }
  rootProject.ext.kotlinStdlibVersion = '1.8.22'
  apply from: '${runtimePolicy}'
  dependencies {
    debugRuntimeClasspath 'com.google.guava:guava:33.3.1-jre'
    debugRuntimeClasspath 'org.jetbrains.kotlin:kotlin-stdlib:2.4.21'
    kotlinCompilerClasspath 'org.jetbrains.kotlin:kotlin-stdlib:2.4.21'
  }
  tasks.register('verifyCompilerRuntime') { doLast {
    assert configurations.kotlinCompilerClasspath.resolvedConfiguration.resolvedArtifacts.first().moduleVersion.id.version == '2.4.21'
  } }`);
}

// Gradle fixtures run on supported Mac/Linux Android build hosts.
it.runIf(process.platform !== 'win32')('patches buildscript graphs without adding unused modules, downgrading newer fixes or changing runtime dependencies', async () => {
  const artifacts = path.resolve('.tmp/artifacts/T674/android-buildscript-tests');
  mkdirSync(artifacts, { recursive: true });
  const root = mkdtempSync(path.join(artifacts, 'constraints-'));
  try {
    fixture(root);
    const baseline = await collectAndroidDependencySecurity({ projectRoot: root,
      gradle: path.resolve('android/gradlew'), initScript: path.resolve('scripts/android/android-dependency-inventory.gradle'),
      outputDir: path.join(root, 'before'), env: process.platform === 'darwin' ? macosA5GradleEnv() : process.env,
      execute: (command, args, options) => execute(command, [...args, '-PunpatchedFixture'], options),
      fetchImpl: async (_url, options) => ({ ok: true,
        json: async () => ({ results: JSON.parse(options.body).queries.map(() => ({})) }) }) });
    expect(baseline.report.status).toBe('clean');
    const before = baseline.report.inventory.configurations.find(row => row.project === ':' && row.kind === 'buildscript');
    for (const [group, name, version] of versions) expect(before.modules).toContainEqual({ group, name, version });
    const { reportPath } = await collectAndroidDependencySecurity({ projectRoot: root,
      gradle: path.resolve('android/gradlew'), initScript: path.resolve('scripts/android/android-dependency-inventory.gradle'),
      outputDir: path.join(root, 'report'), env: process.platform === 'darwin' ? macosA5GradleEnv() : process.env,
      execute: (command, args, options) => execute(command, [...args, ':app:verifyCompilerRuntime'], options),
      fetchImpl: async (_url, options) => ({ ok: true,
        json: async () => ({ results: JSON.parse(options.body).queries.map(() => ({})) }) }) });
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    expect(report.status, readFileSync(path.join(root, 'report/gradle.log'), 'utf8')).toBe('clean');
    const scopes = report.inventory.configurations;
    const rootModules = scopes.find(row => row.project === ':' && row.kind === 'buildscript').modules;
    for (const [group, name, , version] of versions) expect(rootModules).toContainEqual({ group, name, version });
    expect(rootModules.some(module => module.name === 'netty-buffer')).toBe(false);
    const child = scopes.find(row => row.project === ':app' && row.kind === 'buildscript');
    expect(child.modules).toContainEqual({ group: 'io.netty', name: 'netty-handler', version: '4.1.200.Final' });
    const runtime = scopes.find(row => row.name === 'debugRuntimeClasspath').modules;
    expect(runtime).toContainEqual({ group: 'com.google.guava', name: 'guava', version: '33.3.1-jre' });
    expect(runtime).toContainEqual({ group: 'org.jetbrains.kotlin', name: 'kotlin-stdlib', version: '1.8.22' });
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 90_000);
