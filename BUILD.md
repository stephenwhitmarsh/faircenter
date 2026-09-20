# Build, deploy and architecture
How faircenter is built, run and published, and the architecture the live system needs behind the browser-only proof of concept. No build setting is edited inside component code. Every one lives in a config file listed below.

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

## The live system
The proof of concept runs entirely in the browser on invented data with a simulated scheduler, so it needs no backend and GitHub Pages can host it. The live system adds one: a Django service with Django REST Framework over PostgreSQL, and a scheduler adapter, a small module wrapping sacctmgr, scontrol and sacct behind the app's own interface, for which the proof of concept's simulator stands in. A scheduled task refreshes effective standing from recent use and reconciles the Notion import. Django's own users carry authentication mapped to Notion, with the roles below as permissions.

Hosting follows the same split. GitHub Pages hosts the static demo, since the synthetic data and simulated scheduler run in the browser. The live backend has to reach SLURM and Notion, so it runs on a machine near the cluster, most likely an ICM-hosted server, serving the front end from there or from Pages against that backend.

### Where the app sits against the scheduler
The cluster runs SLURM, with the app behind an adapter so another scheduler could be substituted later. Only the app's own service account makes scheduler changes. People act through the app and never hold scheduler permissions.

The app extracts data per job. SLURM's accounting database (read with sacct) holds one finalised record per job with its submit, start and end times, GPU allocation, account, user and QOS. The app stores these and derives every curve from them, so the natural resolution is the job event and the load series is irregular. For work still running, whose accounting record is not final until it ends, the app also polls the live queue (squeue/scontrol) on a short interval to capture in-flight allocations. This job-level history also makes forecasting tractable: with arrival times, sizes, durations and lanes per project and person, demand becomes a time series a trained model can predict and tune parameters against, rather than the recent-rate projection the proof of concept shows.

On a cluster where SLURM has already been running, the first phase does not start from an empty record: the accounting database still holds the same job history. The site's `PurgeJobAfter` in `slurmdbd.conf` sets how far back it reaches. Where purging was never configured, SLURM keeps individual job records indefinitely, often for the life of the cluster. Where it is set, SLURM removes records older than the window, but only after rolling them up into per-association usage aggregates (hourly, then daily, then monthly, the tables `sreport` reads), and usually keeps those rollups far longer. So the fine-grained job stream stays available for at least the retention window and often since the cluster was commissioned, and the coarse usage picture, GPU-hours by account, user and period, reaches back further still. Two conditions gate this: accounting must have been enabled (a `slurmdbd` with `AccountingStorageType=accounting_storage/slurmdbd`, not `accounting_storage/none`), and GPU detail requires `gres/gpu` in `AccountingStorageTRES`, since jobs recorded before GPUs were tracked as a TRES carry no GPU count. So the shared picture and the first budget sizing can draw on real history from day one rather than waiting a period to accumulate it.

```mermaid
graph TD

  humans([humans]) -->|decisions| app([the app])
  app -->|writes changes| slurm([slurm])
  humans -.->|no direct access| slurm
```

### Budgets on the account tree
Every budget is a `GrpTRESMins` limit on one node of SLURM's accounting tree, and the roll-out phases only decide which nodes carry a limit, not where a job is charged.

The tree is built from the Notion memberships and does not change with the phase. The person pool is one branch, with each person a user association under it. The teams pool is the other, shaped as a team account, then a project account under it, then the people as user associations under the project. A job is submitted against an account, and that account decides which branch it draws from: a person's exploratory work charges their association in the person pool, and their funded work charges the project account that already sits under its team. Because the project association exists from the first import, project work charges its project account whether or not a project budget is set, which is why the app can show consumed per project throughout and add the cap only later.

```mermaid
graph TD

  root([accounting tree]) --> pp([person pool])
  root --> tp([teams pool])
  pp --> pu([user: person budget])
  tp --> team([team: team budget])
  team --> proj([project: project budget])
  proj --> u([user])
```

A phase turns a limit on at one level. Person budgets place it on the user associations in the person pool, team budgets on the team accounts, project budgets on the project accounts. SLURM binds a job to the tightest limit anywhere above it, so the limits coexist and the roll-out adds them without moving anything, with `AccountingStorageEnforce=limits` making them bind.

The transition into project budgets is additive. With team budgets on and project budgets off, only the team account carries a limit, so the team total is capped and its projects share that pool freely. Turning project budgets on adds a limit to each project account, sized to fit inside the team's, and the team limit stays where it was as the outer ceiling. Nothing is re-declared and no budget is removed. Switching project budgets off again clears the project limits and leaves the team limit doing the work alone.

The one place an account changes is graduation. When sustained personal work is taken on as a team project, its jobs start being submitted against the project account under the team instead of against the person pool, which is a new association rather than a budget being moved, and the person's still-exploratory work keeps charging the person pool. A person with team membership but no project has no project account to charge, so their team work goes against a team-level default account until they join or start a project.

### Data model
The entities the app stores, beyond what it reads live from the scheduler:

- People, teams and projects, imported from Notion and keyed to the app's own stable identifiers.
- Membership links, a person in a project and a project in a team, effective-dated so the app can rebuild past structure.
- Budgets for the two pools, the teams pool and the person pool, and for each team, project and person within them.
- Proposals and the allocations they become, holding requested and granted quota, start, end, and funding source.
- Reservations, each holding GPUs for a window for a named holder.
- Jobs, one record each from the scheduler's accounting database: submit, start and end time, GPU (TRES) count, owning project and person, and lane. The app derives every load curve from these, and the concurrent GPUs at an instant is the sum over jobs running then, so the series is an irregular step function.
- Usage records read from the scheduler, by account, lane, GPU-hours and time.
- Change requests, each with a type (new project, budget change, priority change), a status, and the approver it is routed to.
- Parameters, the policy values (see [POLICY.md](POLICY.md)), versioned with the date each value took effect, so the app can explain a past decision and read an indicator against the settings in force when it was measured.
- Period indicators, computed and retained per period, so the app can compare performance over time and against parameter changes.

### Robustness in the data model
Reporting relies on being able to rebuild any past state, so the app keeps structure and allocations versioned rather than overwritten. This is the app's own storage, not a SLURM feature. It can use effective-dated rows, where each membership or allocation carries a valid-from and valid-to and a change closes the old row and opens a new one, or an append-only log it derives the current state from. Where a reorganisation leaves something unattached, the app falls back: operations funds a project with no team directly until it is reassigned, and a person with no project has only their personal budget.

### Source of truth and identity
For the proof of concept, Notion holds people, projects, teams and their composition. The app keys everything to its own stable identifiers mapped to Notion records, so a rename or a move updates a link rather than breaking it. Identity comes from Notion where possible, otherwise from a name, email and password matched to the Notion records. Whether projects are defined in the app or in Notion, and whether the app reads Notion through its API or directly, are still open.

### Importing associations
The app is built around three relationships, all imported from Notion.

A person's projects come from workspace membership in Notion, a many-to-many link that imports directly. The same link is what SLURM uses as its account associations, deciding which project budgets a person may charge, so one relation serves both the app and the scheduler. A person's default project sets the account a job charges when none is named.

A person's teams are also many-to-many, since a multi-domain expert can support several teams. How this imports depends on the Notion model. If teams are workspaces in their own right, team membership is a direct relation. If only projects are workspaces, team membership follows the teams that own a person's projects. Where a home or reporting team must be distinguished from project involvement, the app keeps it as a separate single field.

A project's team and funding are single-valued attributes of the project: one owning team, and the pool that funds it. Personal work is not a project. It draws on the person pool and is tracked per person.

Where Notion cannot express a many-to-many relation directly, the app holds the extra links itself, keyed to its own identifiers on top of the Notion records.

### Roles and permissions
In production the four roles (viewer, project lead, team lead and operations) come from the organisation's identity provider. The proof of concept simulates them with the switcher. The app stages every change that reaches the scheduler and applies it explicitly, logging who made it and when, which also versions the parameters.
