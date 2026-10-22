# Deployment

The production build is a folder of static files. It needs no server code, environment variables, secrets or URL rewrites.

```bash
npm ci
npm run build      # type-checks, then writes dist/
npm run preview    # optional: serves dist/ at http://localhost:4173
```

Asset paths are relative (`base: './'` in `vite.config.ts`), so `dist/` works at a domain root or in a sub-directory such as `https://example.com/games/shadow-protocol/`.

Saves live in each player's `localStorage` for the origin that serves the game. Moving the game to a different domain starts players with fresh records.

## Any static host

Upload the **contents** of `dist/` (not the folder itself) to Netlify, Vercel, Cloudflare Pages, S3 + CloudFront, nginx, Apache or similar.

| Host | Build command | Output directory |
| --- | --- | --- |
| Netlify | `npm run build` | `dist` |
| Vercel | `npm run build` | `dist` |
| Cloudflare Pages | `npm run build` | `dist` |

Set the host's Node.js version to 22 or 24 (see [Requirements](../README.md#requirements)).

## GitHub Pages

The repository does not deploy itself yet. To publish it on GitHub Pages:

1. In the repository on GitHub, open **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Add `.github/workflows/pages.yml`:

   ```yaml
   name: Deploy to GitHub Pages

   on:
     push:
       branches: [main]
     workflow_dispatch:

   permissions:
     contents: read
     pages: write
     id-token: write

   concurrency:
     group: pages
     cancel-in-progress: false

   jobs:
     deploy:
       runs-on: ubuntu-latest
       environment:
         name: github-pages
         url: ${{ steps.deployment.outputs.page_url }}
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with:
             node-version: 24
             cache: npm
         - run: npm ci
         - run: npm run build
         - uses: actions/configure-pages@v5
         - uses: actions/upload-pages-artifact@v3
           with:
             path: dist
         - id: deployment
           uses: actions/deploy-pages@v4
   ```

3. Push to `main`. The site appears at `https://<user>.github.io/shadow-protocol/`. Because asset paths are relative, no `base` change is needed for the project sub-path.
4. Smoke-test the live URL: intro → skip → New Run → a wave → pause → quit → Continue.

## Checking a build like a host would

```bash
npm run build
npx vite preview --port 4173 --strictPort
```

Or point any static file server at `dist/`. To check sub-directory hosting, copy `dist/` into a sub-folder of a static server's root and open that path. Fonts and scripts should load with no 404s.

## Troubleshooting

- **Blank page from `file://`.** Browsers block ES modules from local files. Serve `dist/` over HTTP instead.
- **No sound.** Browsers allow audio only after a click, tap or key press. The opening cinematic usually plays silently for that reason.
- **Old version after deploying.** Asset file names are content-hashed, but `index.html` may be cached by a CDN. Purge or shorten the cache for `index.html`.
