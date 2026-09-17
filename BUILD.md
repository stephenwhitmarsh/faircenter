# Build and deploy

## Stack
The frontend is a React 18 app built with Vite 5, its charts drawn with Recharts and hand-built SVG (see the [README](README.md)). There is no build step beyond Vite, no CSS framework, and no test runner.

## Config files
- `frontend/package.json` holds the dependencies and three scripts: `dev`, `build` and `preview`.
- `frontend/vite.config.js` is the only build customisation. It sets `base: '/faircenter/'` so asset URLs resolve under the GitHub Pages project path, `https://stephenwhitmarsh.github.io/faircenter/`. If the repository is renamed, change `base` here.
- `frontend/index.html` is the page shell: the `#root` mount point and the module entry.
- `frontend/src/main.jsx` mounts `<App/>` into `#root`.
- `.gitignore` ignores `node_modules/`, `dist/`, `_to_delete/`, and Vite's `vite.config.js.timestamp-*.mjs` reload artifacts.

## Run and build locally
Work in the `frontend` directory.

```bash
npm install     # once
npm run dev     # dev server with hot reload
npm run build   # production build into frontend/dist
npm run preview # serve the built dist locally
```

The dev server serves at the root and ignores `base`. The production build applies it.

## Deploy to GitHub Pages
Every push to `main` builds the site and publishes it, through `.github/workflows/deploy.yml`. The workflow runs `npm ci` and `npm run build` in `frontend`, uploads `frontend/dist` as the Pages artifact, and deploys it. The live demo is at `https://stephenwhitmarsh.github.io/faircenter/`.

To redeploy, push to `main`, or run the workflow by hand from the Actions tab, which also carries a `workflow_dispatch` trigger. Watch the run under Actions. The demo updates once it is green.

Two settings the workflow depends on, set once:
- GitHub Pages enabled with the source set to GitHub Actions (Settings, then Pages).
- A public repository, since Pages on the free plan does not serve private repositories.

## Where customisation goes
Any change to how the app is built or served belongs in a config file above, not in component code. The base path is the clearest case: it is set once in `vite.config.js` and read by every asset URL, rather than hard-coded anywhere in the app.
