import { copyFile, mkdir, mkdtemp, rename, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

function validateArtifactNames(names) {
  if (names.length === 0 || new Set(names).size !== names.length) {
    throw new Error('Artifact publication requires a non-empty unique file list');
  }
  for (const name of names) {
    if (name !== path.basename(name) || name.endsWith('.app')) {
      throw new Error(`Invalid formal artifact name: ${name}`);
    }
  }
}

export function assertExternalPackageOutput(repositoryRoot, outputDirectory) {
  if (!path.isAbsolute(outputDirectory)) throw new Error('Package output must be an absolute external path');
  const relative = path.relative(repositoryRoot, outputDirectory);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    throw new Error('Expanded package output must stay outside the repository');
  }
  return outputDirectory;
}

async function moveIfPresent(source, target, move) {
  try {
    await move(source, target);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export async function withTemporaryPackageOutput(action, options = {}) {
  const makeTempDirectory = options.makeTempDirectory ?? mkdtemp;
  const remove = options.remove ?? rm;
  const temporaryRoot = options.temporaryRoot ?? tmpdir();
  const outputDirectory = await makeTempDirectory(path.join(temporaryRoot, 'foliole-macos-package-'));
  try {
    return await action(outputDirectory);
  } finally {
    await remove(outputDirectory, { force: true, recursive: true });
  }
}

export async function publishArtifactBatch(options, dependencies = {}) {
  const names = options.names;
  validateArtifactNames(names);
  const copy = dependencies.copy ?? copyFile;
  const makeDirectory = dependencies.makeDirectory ?? mkdir;
  const makeTempDirectory = dependencies.makeTempDirectory ?? mkdtemp;
  const move = dependencies.move ?? rename;
  const remove = dependencies.remove ?? rm;
  const getStat = dependencies.getStat ?? stat;
  const targetParent = path.dirname(options.targetDirectory);
  await makeDirectory(targetParent, { recursive: true });
  const publicationRoot = await makeTempDirectory(
    path.join(targetParent, `.${path.basename(options.targetDirectory)}-publish-`)
  );
  const nextDirectory = path.join(publicationRoot, 'next');
  const backupDirectory = path.join(publicationRoot, 'previous');
  try {
    await makeDirectory(nextDirectory, { recursive: true });
    for (const name of names) {
      await copy(path.join(options.sourceDirectory, name), path.join(nextDirectory, name));
    }
    const [parentDetails, stagingDetails] = await Promise.all([getStat(targetParent), getStat(publicationRoot)]);
    if (parentDetails.dev !== stagingDetails.dev) {
      throw new Error('Artifact publication staging must be on the target filesystem');
    }
    const hadPrevious = await moveIfPresent(options.targetDirectory, backupDirectory, move);
    try {
      await move(nextDirectory, options.targetDirectory);
    } catch (error) {
      if (hadPrevious) await move(backupDirectory, options.targetDirectory);
      throw error;
    }
  } finally {
    await remove(publicationRoot, { force: true, recursive: true });
  }
}
