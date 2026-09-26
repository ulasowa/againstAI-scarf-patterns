/**
 * Fold the offline build into a single HTML file.
 *
 * A `file://` page is treated as an opaque origin, so the browser refuses to
 * fetch external module scripts, stylesheets loaded as modules, or anything
 * else next to the page. Inline content has no such restriction, so everything
 * goes into the document: script, stylesheet and favicon.
 *
 * Run after `APP_OFFLINE=1 vite build --outDir dist-offline`.
 */
import { readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const DIST = 'dist-offline'
const OUT = join(DIST, 'adversarial-knit-lab.html')

/** `</script>` inside a string literal would close the surrounding tag. */
function escapeForScriptTag(code) {
  return code.replace(/<\/script/gi, '<\\/script')
}

const html = await readFile(join(DIST, 'index.html'), 'utf8')

const scriptMatch = html.match(/<script[^>]*src="([^"]+)"[^>]*><\/script>/)
const styleMatch = html.match(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/)
if (!scriptMatch || !styleMatch) {
  throw new Error('Could not find the built script and stylesheet in index.html')
}

const scriptPath = join(DIST, scriptMatch[1].replace(/^\.\//, ''))
const stylePath = join(DIST, styleMatch[1].replace(/^\.\//, ''))
const [script, style, favicon] = await Promise.all([
  readFile(scriptPath, 'utf8'),
  readFile(stylePath, 'utf8'),
  readFile(join(DIST, 'favicon.svg'), 'utf8'),
])

const faviconDataUri = `data:image/svg+xml;base64,${Buffer.from(favicon, 'utf8').toString('base64')}`

const SCRIPT_SLOT = '@@INLINE_SCRIPT@@'
const STYLE_SLOT = '@@INLINE_STYLE@@'

let single = html
  .replace(scriptMatch[0], `<script type="module">${SCRIPT_SLOT}</script>`)
  .replace(styleMatch[0], `<style>${STYLE_SLOT}</style>`)
  .replace(/href="\.\/favicon\.svg"/, `href="${faviconDataUri}"`)
  // Any remaining preload hints point at files that no longer exist here.
  .replace(/<link[^>]*rel="modulepreload"[^>]*>\s*/g, '')

// A single file is self-contained by definition; a stray crossorigin attribute
// on an inline tag is meaningless and, on file://, actively unhelpful.
single = single.replace(/\s+crossorigin(="[^"]*")?/g, '')

// Verify the markup BEFORE the bundles are substituted in: the bundled
// JavaScript legitimately contains strings like `src="`, and checking the
// finished document would trip over its own payload.
const externalScript = /<script[^>]*\ssrc=/i
const externalStyle = /<link[^>]*rel="stylesheet"/i
if (externalScript.test(single) || externalStyle.test(single)) {
  throw new Error('The offline page still references an external file')
}

single = single
  .replace(SCRIPT_SLOT, () => `\n${escapeForScriptTag(script)}\n`)
  .replace(STYLE_SLOT, () => `\n${style}\n`)

await writeFile(OUT, single, 'utf8')

// Leave only the single file behind, so there is nothing to copy by mistake.
for (const entry of await readdir(DIST)) {
  if (entry !== 'adversarial-knit-lab.html') {
    await rm(join(DIST, entry), { recursive: true, force: true })
  }
}

const bytes = Buffer.byteLength(single, 'utf8')
console.log(`${OUT}  ${(bytes / 1024 / 1024).toFixed(1)} MB (single file, opens with file://)`)
