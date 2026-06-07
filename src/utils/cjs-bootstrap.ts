/**
 * CJS-safe module identifier for jiti's createJiti().
 *
 * In ESM, `import.meta.url` is a file:// URL. In CJS (bundled output),
 * it may be undefined, so we fall back to process.cwd().
 */

import { join } from 'node:path';

export function getModuleIdentifier(): string {
  try {
    const url = import.meta.url;
    if (typeof url === 'string' && url.length > 0) return url;
  } catch {
    // import.meta not available at all (CJS)
  }
  return join(process.cwd(), 'dummy.js');
}
