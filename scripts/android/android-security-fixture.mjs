import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function mavenPackage(repository, name, version, dependencies = '') {
  const root = path.join(repository, 'example', name, version);
  mkdirSync(root, { recursive: true });
  writeFileSync(path.join(root, `${name}-${version}.pom`), `<project><modelVersion>4.0.0</modelVersion>
    <groupId>example</groupId><artifactId>${name}</artifactId><version>${version}</version>
    <dependencies>${dependencies}</dependencies></project>`);
  writeFileSync(path.join(root, `${name}-${version}.jar`),
    Buffer.from('504b0506000000000000000000000000000000000000', 'hex'));
}

export function prepareAndroidSecurityFixture(root) {
  const repository = path.join(root, 'repository');
  mavenPackage(repository, 'leaf', '1.0');
  mavenPackage(repository, 'leaf', '2.0');
  mavenPackage(repository, 'parent', '1.0', `<dependency><groupId>example</groupId>
    <artifactId>leaf</artifactId><version>1.0</version></dependency>`);
  mavenPackage(repository, 'build-tool', '1.0');
  writeFileSync(path.join(root, 'settings.gradle'), "rootProject.name = 'security-fixture'\ninclude ':app'\n");
  writeFileSync(path.join(root, 'build.gradle'), `buildscript {
    repositories { maven { url = uri('repository') } }
    dependencies { classpath 'example:build-tool:1.0' }
  }`);
  mkdirSync(path.join(root, 'app'));
  writeFileSync(path.join(root, 'app/local.jar'), Buffer.from('504b0506000000000000000000000000000000000000', 'hex'));
  writeFileSync(path.join(root, 'app/build.gradle'), `repositories { maven { url = uri('../repository') } }
    configurations { debugRuntimeClasspath; releaseRuntimeClasspath; protobufToolsLocator_protoc }
    dependencies {
      debugRuntimeClasspath 'example:parent:1.0'
      debugRuntimeClasspath 'example:leaf:2.0'
      debugRuntimeClasspath files('local.jar')
      releaseRuntimeClasspath 'example:parent:1.0'
      protobufToolsLocator_protoc 'example:build-tool:1.0'
    }`);
}
