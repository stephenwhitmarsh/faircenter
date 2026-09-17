# faircenter
faircenter is a proof of concept for sharing GPU time across a research organisation, with clear budgets, visible use, and allocation decisions people can stand behind. Questions and ideas are welcome: [get in touch](mailto:stephen.whitmarsh@proton.me).

## Why it exists
On a shared cluster with no allocation policy, access is first come first served. Direction cannot see where the GPUs go, and a project cannot tell in advance whether the resources it needs will be free. The scheduler records raw usage after the fact, but nothing turns it into a picture the organisation can act on, so people over-ask, hold more than they need, or work around the queue. faircenter turns use, budgets and requests into one shared, current picture, and gives each role the controls to act on it.

## Stakeholders
Everyone works from the same facts. Engineers see whose jobs are running, how full the cluster is through the week, and where their own work sits in the queue. Operations run the policy: the pools and budgets, the roll-out phase, the lane prices and priority weights, the capacity schedule, and the approvals. The managers who fund the cluster set its mandate and budget. Direction reads the few figures a decision rests on: demand against the hardware, the projects heading over budget, and the reports that make the case for the next investment.

```mermaid
graph BT

  engineers([engineers]) -->|transparency| app([faircenter])
  managers([managers]) -->|funding & mandate| app
  operations([operations]) -->|policy & approvals| app
  app -->|reporting & decisions| direction([direction])
```

## Fit within the ecosystem
faircenter sits inside the tools an organisation already runs. People and projects come from Notion. It reads jobs and use from SLURM and writes budgets and reservations back. Notifications go to the existing Slack channel, with email as a fallback. Identity comes from single sign-on.

```mermaid
graph TD

  app([faircenter]) -.->|people & projects| notion([notion])
  app -.->|jobs, budgets & reservations| slurm([slurm])
  app -.->|notifications| slack([slack, email])
  app -.->|identity| sso([single sign-on])
```

## How it is built and run
I (Stephen Whitmarsh) design and direct faircenter, and vibe-code it with Claude, which writes the React and Vite code.

The proof of concept is a browser app in React and Vite, with charts in Recharts and hand-built SVG. It runs on invented data at roughly the real scale of the organisation, around twenty teams and three hundred people, with a small simulated scheduler running the generated demand, so it shows the whole scheme without touching a cluster. There is no backend in this repository. [BUILD.md](BUILD.md) describes the Django service and SLURM adapter the live system needs.

Every push to `main` builds the static site and publishes it to GitHub Pages through `.github/workflows/deploy.yml`. To run it locally, work in the `frontend` directory: `npm install` once, then `npm run dev`.

```mermaid
graph TD

  me([maintainer]) -->|vibe-codes & designs| claude([claude])
  claude -->|writes the react + vite app| repo([github repository])
  repo -->|build| dist([static site])
  dist -->|deploy| pages([github pages])
```

## Documentation
The [manual](MANUAL.md) walks through the app tab by tab. The [policy](POLICY.md) sets out how allocation works: the two pools, budgets, the mechanisms and their parameters, and admission. The [strategy](STRATEGY.md) covers the direction over time, the phased roll-out that moves budget from the person pool into teams, and the risks. [BUILD.md](BUILD.md) covers how the app is built and deployed, and the architecture the live system needs. [TODO.md](TODO.md) tracks the open points.

## Where it lives
- Repository: this repository.
- Demo: published to GitHub Pages under the `/faircenter/` path.
- Contact: stephen.whitmarsh@proton.me
- Licence: proprietary. No use, copying or distribution without written permission. See [LICENSE](LICENSE).
