import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (specifier.endsWith('.js') && context.parentURL?.endsWith('.ts')) {
      const parentPath = fileURLToPath(context.parentURL);
      const candidatePath = path.resolve(path.dirname(parentPath), `${specifier.slice(0, -3)}.ts`);
      if (fs.existsSync(candidatePath)) {
        return {
          shortCircuit: true,
          url: pathToFileURL(candidatePath).href
        };
      }
    }
    if (specifier.startsWith('.') && path.extname(specifier) === '' && context.parentURL?.endsWith('.ts')) {
      const parentPath = fileURLToPath(context.parentURL);
      const candidatePath = path.resolve(path.dirname(parentPath), `${specifier}.ts`);
      if (fs.existsSync(candidatePath)) {
        return {
          shortCircuit: true,
          url: pathToFileURL(candidatePath).href
        };
      }
    }
    throw error;
  }
}
