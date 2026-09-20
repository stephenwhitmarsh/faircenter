# TODO
Open points for faircenter: what is still to build, decide, or reconcile.

## Proof-of-concept gaps
Parts of the app that look finished but do not yet behave as the live system would.

- The per-team roll-out phase drives that team's enforcement labels and budget figures, not the simulated scheduler, so queue order and waits are the same whichever phase a team sits at. Decide whether the proof of concept should schedule and enforce per team, or stay presentational at the scheduler level.
- The Budgets distribution now lets team pools be filled into the over-subscription headroom, so the committed-vs-capacity bar shows the over-subscribed state and its ceiling live as budgets are edited. A Policy what-if that sets a scenario over capacity is still worth adding.
- The projected-demand chart in Requests spreads project and extension budgets evenly across their window and treats every request as certain. Add real ramp profiles and a view that counts only approved requests.

## Decisions still open
- The review cadence. Project extensions and team-pool augmentation now have request buttons on the Projects and Budgets tables; the approval cadence behind them is still open.
- Whether Notion is read through its API or directly from its database, and how the app's records map when things are renamed or moved.
- Whether projects are defined in the app or in Notion.
- Whether team leads set priorities within their teams, or all priority is set centrally.
- The starting over-subscription factor.
- The starting values for the priority and pricing controls.
- Whether the Projects view stays visible to every role, or is restricted to leads and operations.

## Features not yet built
- Within-team prioritisation between a team's projects. Projects no longer carry a priority tier; a team orders its own work through how it splits its budget. A per-project tier could be reintroduced later if teams need a finer lever.
- Editable roll-out phase presets: edit a phase, save it to the preset, then apply it to the scheduler.
- A what-if simulator over the policy parameters, so a change can be seen before it is applied.
- A person-pool admission check, so individual work is bounded the way project work is.
- Automatic reclaim of reserved time that goes unused. The reservations table now shows how much of each reservation was used, but returning the GPUs is still a manual cancel.
- Filters and CSV export on the Requests board.
- A glossary of the terms and controls.
- The graduation flow that formalises sustained personal work into a project.
- A "fund more" link on the Team view that opens a pre-filled budget request (the Budgets and Projects tables now carry augmentation and extension buttons; the Team-view shortcut is still to add).
