/**
 * Deployment base path.
 *
 * The build defaults to a relative base, so this is normally `./` and every
 * asset resolves against the page's own location. That is what lets the same
 * build run from a domain root, from a subdirectory, from a GitHub Pages
 * repository subpath and from a local folder without reconfiguration.
 *
 * The application does not fetch any of its own files at runtime -- examples
 * and the model manifest are bundled -- so this is only needed for assets
 * referenced by URL.
 */
export const BASE_URL: string = import.meta.env.BASE_URL || './'

/** Resolve a path that is relative to the deployed application root. */
export function asset(path: string): string {
  const clean = path.replace(/^\/+/, '')
  const root = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`
  return `${root}${clean}`
}
