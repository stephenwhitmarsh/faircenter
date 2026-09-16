---
title: TODO
status: working draft
updated: 2026-09-15
---

# TODO
The open points for faircenter, gathered in one place. The design rationale and the tab-by-tab walkthrough live in the [manual](MANUAL.md). This file tracks what is still to build, decide, or reconcile.

## Proof-of-concept gaps
These are parts of the app that look complete but do not yet behave as the live system would.

- The per-team roll-out phase drives that team's enforcement labels and budget figures, but not the simulated scheduler, so queue order and waits are the same whichever phase a team sits at. Decide whether the proof of concept should schedule and enforce differently per team, or stay presentational at the scheduler level.
- The over-committed state on the Budgets distribution bar has no data that reaches it, so the visual is untested. Add a demo scenario, or a Policy what-if, where committed budgets exceed capacity.
- The projected-demand chart in Requests spreads project and extension budgets evenly across their window and treats every request as certain. Add real ramp profiles and a view that counts only the approved requests.

## Decisions still open
- The review cadence, and how project extensions are handled.
- Whether Notion is read through its API or directly from its database, and how the app's records map to Notion records when things are renamed or moved.
- Whether projects are defined in the app or in Notion.
- Whether team leads set priorities within their teams, or all priority is set centrally.
- The starting over-subscription factor, how far to commit budgets against capacity at the outset.
- The starting values for the priority and pricing controls in the Policy view.
- Whether the Projects view stays visible to every role, or is restricted to leads and operations.

## Features not yet built
- Editable roll-out phase presets: edit a phase, save it back to the preset, then apply it to the scheduler.
- A what-if simulator over the policy parameters, so a change can be seen before it is applied.
- A person-pool admission check, so individual work is bounded the way project work is.
- Reclaiming reserved time that goes unused.
- Filters and CSV export on the Requests board.
- A glossary of the terms and controls.
- The graduation flow that formalises sustained personal work into a project.
- A "fund more" link on the Team view that opens a pre-filled budget request.

## Documentation
The README, manual, TODO, LICENSE and CONTRIBUTING are in place and in step: the README is the overview, the manual carries the design and the tab walkthrough, and the pool model is reconciled across both. No documentation items are open.
