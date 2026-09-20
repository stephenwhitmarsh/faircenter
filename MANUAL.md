# Manual

## The app, tab by tab
The app is a set of tabs across the top, each with its own audience and job. Which tabs appear depends on the role you are viewing as. The [policy](POLICY.md) sets out the allocation model behind the controls.

A **Viewing as** switcher in the header sets the current role, since the proof of concept has no real sign-in. There are four roles, each with a coloured chip. A viewer sees everything and changes nothing. A project lead plans and books for the projects they run, raising requests and holding their own reservations. A team lead divides their team's pool across its projects and raises requests across the team. Operations sets the policy, sizes the pools, configures the connectors, approves requests, and is the only role that writes to the scheduler. Operations sees every tab and lands on the Overview. The other roles land on My view, and the app hides the operations-only tabs from them.

### Overview
The tab operations and direction land on. Operational tiles and a short list of what needs attention sit at the top, each tile linking to the tab behind it. Below, the app computes the longer-run indicators per period from the jobs themselves and charts them past and forecast over a configurable horizon, with policy changes marked on the trend. A resource outlook frames the acquisition decision, setting realised demand and committed entitlement against capacity, with a runway to the threshold.

### My view
A person's own projects and jobs. Tiles across the top count the projects they are on, the GPUs their running jobs hold, how many jobs are queued, and their wait times. The Projects table shows each project's budget, use and budget status, with a role chip marking the ones they lead. Where the project's team is at a phase that does not enforce that budget, the status reads "target only", since the number is a target rather than a cap there. An "Only mine" toggle is on by default. Below, the Jobs table lists what is running and queued, with wait times per lane when priced lanes are on.

### Team
For team leads and operations. A Policy card shows the mechanisms in force for the team as read-only switches, the same set the Policy tab carries. Operations additionally set the team's roll-out phase here, ahead of or behind the organisation default. The team lead sees Distribution across projects once project budgets are enabled for the team, splitting the team pool across active projects, each allocation capped so the running total never exceeds the pool. The team budget shows only once team budgets are enabled. The size of the team pool itself is set by operations on the Budgets tab. Every change here is staged and applied explicitly.

### Queue
The live picture of jobs waiting to run and the order they will run in, which is what the allocation policies shape. Where cross-team standing is on, the ordering reflects each team's standing.

### Load
The load on the cluster over time, built from individual jobs the way it comes from the scheduler, so the band steps up and down as jobs start and finish. It stacks by team, can be scoped, carries the reservations that hold GPUs for set windows, and forecasts each project's future draw against a dashed capacity line, with a strip below the chart to pan and zoom. A reservations table below lists each hold with how much of the reserved time was actually used, so a held-but-idle slot can be reviewed. Beneath it, the Projects table groups each team's projects, with a final Personal group, and shows a use-of-budget meter for each.

### Projects
The register of team projects, one row each with its team, start, budget, consumed, a pace bar against an even spend, and a budget outlook. Where the project's team does not enforce project budgets, the budget, realisation, pace and outlook show a dash rather than a figure, since there is no cap to read them against. Consumed still shows. Viewers get an "Only mine" default, and a toggle folds finished projects in. Selecting a row opens the full record: the leads to contact, the members, and the recent jobs.

### Budgets
The two pools and how they are divided. A bar at the top shows committed budgets against the capacity the cluster offers over the period, with an uncommitted tail below full or an over-committed overflow past it. The Team pools section lists each team's share of the teams pool, with its phase where that differs from the default, and the projects inside each. Operations size each team's pool here, capped so the running total stays within the teams pool, with the remainder left unallocated. Team leads then split each pool across projects on the Team tab. The Person pool section shows each person's equal allowance, their use against it, and the gap.

### Directory
People, teams and projects as imported from Notion, browsable by person, team or project. This is where operations checks the imported structure against Notion and keeps it in step.

### Requests
A short form raises a change: a new project, a change to a project's or a team's budget, a priority change, an extension, or a reservation. Each type routes to the right approver, and a person sees an approve or decline control only on the requests that are theirs. The board shows only the people involved. A planner charts the demand that granting the pending requests would add on top of the forecast baseline, against capacity, so a request that would push demand past the hardware shows before approval.

### Policy
Visible to everyone and read-only for all but operations: the mechanisms and values that drive allocation. The mechanisms are switches for whether budgets are enforced at the person, project and team level, whether priced lanes and time-of-use weighting apply, and whether teams carry standing between one another. The values are the numbers behind them: the person pool's share of capacity, the over-subscription factor, the lane prices, and the priority weights. Selecting a roll-out phase loads its preset, which operations can then adjust. Changes stay staged and take effect only on apply, when the app writes them to the scheduler and shows the commands.

### Connectors
Operations only: the systems the app reads from and writes to. SLURM is the scheduler it reads use from and writes budgets and reservations to. Notion supplies people and projects. Slack carries approvals, reminders and budget alerts, with email as a fallback. Single sign-on supplies identity, and object storage holds exports. Operations enables and configures each here.

The allocation model behind these controls is in [POLICY.md](POLICY.md). The build, deployment and the architecture the live system needs (the scheduler adapter, the data model and the Notion import) are in [BUILD.md](BUILD.md).
