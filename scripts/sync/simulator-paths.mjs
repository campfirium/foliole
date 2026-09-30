import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

function canonical(value) {
  let ancestor = path.resolve(value);
  const suffix = [];
  while (!existsSync(ancestor)) {
    suffix.unshift(path.basename(ancestor));
    const parent = path.dirname(ancestor);
    if (parent === ancestor) throw new Error('output_path_unresolvable');
    ancestor = parent;
  }
  return path.join(realpathSync(ancestor), ...suffix);
}
function contains(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
export function validateOutputPath(output, options) {
  const destination = canonical(output);
  for (const key of ['database', 'target-database', 'assets', 'target-assets']) {
    if (!options[key]) continue;
    const input = canonical(key.endsWith('database') ? path.dirname(options[key]) : options[key]);
    if (contains(input, destination) || contains(destination, input)) {
      throw new Error(`output_overlaps_input:${key}`);
    }
  }
  return destination;
}
