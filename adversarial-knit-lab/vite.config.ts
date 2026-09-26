import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * The default base is relative, on purpose.
 *
 * With `./`, every asset URL in the built page is resolved against the page's
 * own location. The same `dist/` folder therefore works:
 *   - opened from a plain static server at a domain root,
 *   - in any subdirectory of any host, with no configuration,
 *   - under a GitHub Pages repository subpath, and
 *   - copied onto a USB stick or into an existing site.
 *
 * An absolute base can still be forced with APP_BASE, but nothing needs it.
 */
const base = process.env.APP_BASE ?? './'

/** A single self-contained HTML file for `file://` use. */
const offline = process.env.APP_OFFLINE === '1'

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    target: 'es2022',
    ...(offline
      ? {
          // One file: no module graph to fetch, because a `file://` page is
          // treated as a cross-origin context and cannot load module scripts
          // or dynamic imports at all.
          cssCodeSplit: false,
          assetsInlineLimit: Number.MAX_SAFE_INTEGER,
          rollupOptions: { output: { inlineDynamicImports: true } },
          chunkSizeWarningLimit: 8000,
        }
      : {
          // Model and PDF code stay in their own lazily loaded chunks.
          rollupOptions: {
            output: {
              manualChunks(id: string) {
                if (id.includes('@tensorflow')) return 'tfjs'
                if (id.includes('pdf-lib') || id.includes('@pdf-lib')) return 'pdf'
                if (id.includes('image-q')) return 'imageq'
              },
            },
          },
          chunkSizeWarningLimit: 1200,
        }),
  },
})
