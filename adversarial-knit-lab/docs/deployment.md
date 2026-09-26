# Running it anywhere

The site is static and self-contained. There is no backend, no database, no
account and no API key, and **GitHub Pages is optional** — it is one host among
many, not a requirement.

The application never requests its own files at runtime. Examples, the palette
data and every panel are part of the bundle. The only network request it can
make is the model download, and only after you press the button.

## Four ways to run it

### 1. A single file, no server

```bash
npm ci
npm run build:offline
```

Produces `dist-offline/adversarial-knit-lab.html` — one file, about 2 MB.
Double-click it. Email it. Put it on a USB stick.

Everything is inlined, because a `file://` page is treated as an opaque origin
and cannot load external module scripts, dynamic imports or sibling files at
all. Verified working from `file://`: pattern generation, the chart editor, the
bundled examples, PDF export, and **model loading** — the weights are served
with `access-control-allow-origin: *`, so the opaque origin is not a problem.

Trade-offs, stated plainly:

- Everything loads up front. On the web, TensorFlow.js and pdf-lib are separate
  lazy chunks; here they are in the file whether you use them or not.
- Local storage on `file://` is browser-dependent. It worked in Chromium during
  testing; if it is unavailable the application says so and keeps working, but
  autosave will not persist. Export a project file instead.
- Only Chromium was tested. Firefox and Safari apply their own `file://` rules.

### 2. A folder on any static host

```bash
npm ci
npm run build
```

Copy `dist/` anywhere: nginx, Apache, Caddy, S3, Netlify, Vercel, a shared web
host, a Raspberry Pi, a folder inside an existing site. No configuration, no
environment variables, no rewrite rules.

The build uses a **relative base**, so the same `dist/` works at a domain root
and at any depth:

```
https://example.org/                     ✓
https://example.org/tools/knit/          ✓
https://user.github.io/repository/       ✓
```

This is tested, not assumed: `npm run build:portable` copies the unmodified
`dist/` into `dist-nested/knit/lab/v1/`, and the browser suite serves it from
there and fails on any absolute asset URL or any 404.

Tabs use a URL hash (`#/knit`). Static hosts have no rewrite rules, so a
path-based route would 404 on reload; a hash survives every deployment above.

### 3. Locally, with whatever you have

```bash
# Node, if you have it
npm run serve            # serves dist/ at http://localhost:4173

# or Python, with no Node at all
cd dist && python3 -m http.server 8000

# or PHP
cd dist && php -S localhost:8000
```

Any static file server works. The `dist/` folder has no server-side
requirements.

### 4. Development

```bash
npm ci
npm run dev
```

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run typecheck` | `tsc -b`, strict |
| `npm run test` | Domain tests (Vitest) |
| `npm run test:e2e` | Browser tests (Playwright) |
| `npm run build` | Type check, then build `dist/` |
| `npm run build:offline` | Single-file `dist-offline/adversarial-knit-lab.html` |
| `npm run build:portable` | Build, then copy into a deep subdirectory for testing |
| `npm run serve` / `npm run preview` | Serve `dist/` |

`APP_BASE` still forces an absolute base if some host needs one
(`APP_BASE=/knit/ npm run build`). Nothing here requires it.

## GitHub Pages, if you want it

`.github/workflows/deploy-knit-lab.yml` type checks, runs the domain tests,
builds both the folder and the single file, and publishes to Pages. Because the
build is relative, the workflow does not compute a base path and works for both
`<owner>.github.io/` and `<owner>.github.io/<repository>/`.

The `configure-pages` step runs with `enablement: true`, so it turns Pages on
and points its source at GitHub Actions on the first run rather than requiring
a visit to Settings. That needs the workflow's `pages: write` permission, which
it has; if an organisation policy blocks it, the step fails with a clear
message and you set **Settings → Pages → Source → GitHub Actions** by hand.

The workflow publishes from `main` and from the `adversarial-knit-lab` branch,
so the branch can be reviewed as a live page rather than as a diff. A manual
run (`workflow_dispatch`) publishes whatever branch it is dispatched on.

Every run also uploads the built site as a downloadable artifact
(`adversarial-knit-lab-site`), so the build is usable even where Pages is not.

## Model artifacts

No weights are committed. COCO-SSD weights are downloaded from
`storage.googleapis.com` on demand and cached by TensorFlow.js in IndexedDB;
the Evaluate tab can clear that cache.

That download is the only external request the application makes. No analytics,
and no web fonts — the interface uses system fonts.

To run with no internet at all, everything except the Evaluate tab works
offline. If you need evaluation offline too, host the weights yourself: check
the Apache-2.0 redistribution terms, serve them over HTTPS with permissive CORS
headers, and point `modelUrl` at your copy in
`src/features/evaluation/cocoSsd.ts`.

## ONNX Runtime Web

Not shipped. If it is added later, ship a tested single-threaded WASM path:
neither GitHub Pages nor a `file://` page provides cross-origin isolation, so
`SharedArrayBuffer` and multithreaded WASM cannot be requirements.
`src/features/evaluation/adapter.ts` is the seam it would use.
