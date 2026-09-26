/**
 * Copy the built site into an arbitrarily deep subdirectory.
 *
 * Proves portability with the artifact itself rather than a rebuild: the same
 * `dist/` is served from `/knit/lab/v1/` with no configuration change. A build
 * with an absolute base would 404 here on every asset.
 */
import { cp, rm } from 'node:fs/promises'

const TARGET = 'dist-nested/knit/lab/v1'

await rm('dist-nested', { recursive: true, force: true })
await cp('dist', TARGET, { recursive: true })
console.log(`copied dist/ -> ${TARGET}/ (served at /knit/lab/v1/)`)
