# Policy

## Teams, projects and budgets
faircenter organises work into teams, which hold projects, which people run. Teams change over time, splitting and merging, so the project is the stable unit the system is built on. A project keeps its own identity, budget and history even as the teams around it change.

faircenter divides the cluster's GPU time into two pools, the teams pool and the person pool. The teams pool holds a pool for each team, which the team divides across its projects. Every funded project belongs to a team. The person pool is separate: it gives each person a small allowance for individual, exploratory work, and draws on no team's budget. A project draws only on the pool that funds it.

Operations sets the split between the two pools with one number in the Policy view: the person pool's share of the capacity the cluster offers. Keeping it separate from the teams shows the balance between individual and team work at a glance, and lets operations move that one number without touching any team's budget. The person pool starts large. Operations moves its share into the teams pool as the organisation matures, partly by policy, lowering the share phase by phase, and partly by graduation, as sustained personal work becomes a project and leaves the pool.

Person work is self-service. Because the person pool is a best-effort share with no guaranteed capacity, personal work holds no reservation and needs no approval: it takes what the pool's fair share allows, scheduled fairly among the people using it. Reservations and budget approvals need governance because they remove capacity from others, so personal work carries none of that burden. It also sets the incentive to formalise a sustained need into a project, where it can earn a reservation and a guaranteed share. Team leaders do not fund or track their people's personal work. The person pool is an organisation-level concern: operations sizes it, and the app reports it by team only for attribution, so a team leaning heavily on it shows work that has not yet formalised.

```mermaid
graph TD

  cap([cluster gpu time]) --> teamspool([teams pool])
  cap -->|ops-sized share| personpool([person pool])
  teamspool --> team1([team 1])
  teamspool --> team2([team 2])
  team1 --> t1a([project])
  team1 --> t1b([project])
  team2 --> t2a([project])
  personpool -.-> person1([person 1])
  personpool -.-> person2([person 2])
  t1a --> j1([jobs])
  person1 -.-> j2([personal jobs])
```

A team project belongs to a home team, both for the org chart and for who works on it, and that team's pool funds it. Individual work is the exception: it is not a project, and draws on the person pool rather than a team's.

Team leadership is a role that can be held, shared, left empty, or reassigned. Where a team has no leader, operations makes its allocation decisions from the team's pool. A team gets its own pool to divide only once it is stable enough to warrant it.

## Who decides what
Direction sets the priorities that say what matters most. Operations sizes the budgets, a question of capacity and cost. A team leader divides the team's budget across its projects, and an engineer chooses the lane for each job within the budget granted. A project carries a high, medium or low priority tier, which the team leader sets as a tie-break within its pool. Arbitration between pools follows the budget shares through SLURM's fair-tree. The design drops absolute priority numbers as false precision that would not, on their own, move work across teams. Each decision sits with whoever holds the relevant information, and direction and operations can each ask the other to change priorities, one proposing and the other confirming.

```mermaid
graph TD

  direction([direction]) -->|sets priorities| app([the app])
  operations([operations]) -->|size budgets| app
  lead([team lead]) -->|split team budget| app
  engineer([engineer]) -->|lane per job| app
  app -->|implements| scheduler([scheduler])
  app -->|analytics| dashboard([dashboard])
```

## Requests and allocation
A project gets its budget by proposal. The proposal names a maximum budget, a start, and a deadline or duration. A change to a project's budget or an extension goes to the team leader, who allocates from the team's pool. A new project, and a change to a team's whole pool, go to operations. The right approver handles each proposal as it arrives, rather than gathering them to a date.

Once a project has a budget, an engineer submits jobs against it and picks a lane for each one. The scheduler decides when a job runs, the job then executes on the hardware, and its use draws the budget down. Usage and a periodic review go back to the managers, who adjust priorities and budgets over time. Individual jobs and lane choices need no approval, because the scheduler shares fairly and the lane is already paid for out of the project's own budget. Only budgets and priorities need approval. This whole flow is for projects that draw a team pool. Personal work skips it, running best-effort within the person pool with no proposal, no approval and no reservation.

```mermaid
graph TD

  proposal([project proposal]) -->|allocation| budget([budget])
  budget -->|submit, pick lane| submission([job submission])
  submission --> scheduler([scheduler])
  scheduler --> execution([job execution])
  execution -.->|burn down| budget
```

## The controls, mapped to SLURM
The app presents a handful of controls, and several are combinations of lower-level SLURM settings, so there are more knobs underneath than the app exposes. A budget is a ceiling on total use, held as a `GrpTRESMins` limit in GPU-minutes on an entry in the accounting tree. The enforcement switch chooses where that limit sits: on the user's association for a person, on the project account for a project, on the team account for a team. The limits nest and coexist, and SLURM holds a job to the tightest that applies up the tree, so the roll-out enables them cumulatively rather than swapping one for another. `AccountingStorageEnforce=limits` makes them bind. SLURM carries standing, which decides order under contention, as fairshare together with a base account priority. A lane is a QOS carrying both an added priority and a usage factor, so running faster draws the budget down faster. A reservation locks specific GPUs for a window. The app reads actual use back from SLURM accounting (sacct), and applies time-of-use pricing through TRESBillingWeights.

```mermaid
graph LR

  budget([budget: volume]) -->|how much| cap([qos grptresmins cap])
  standing([standing: order]) -->|who goes first| fairshare([fairshare + base priority])
  lane([lane: urgency]) -->|per job| qos([qos priority + usagefactor])
  timeofuse([time of use]) -->|cheaper off-hours| billing([tresbillingweights])
  reservation([reservation]) -->|guaranteed slot| resv([slurm reservation])
```

Budget and standing are independent. An account can have generous standing and a small budget, so it starts quickly but cannot run for long, or little standing and a large budget, so it waits but can run a great deal once it starts. Standing steers the order of the queue. It does not reserve a fixed share of GPUs, and use converges towards the standing ratios only while everyone is competing, so a standing that works out to forty percent is a tendency under demand rather than a guaranteed forty percent at any moment.

Two of the controls move more than one thing at once. Choosing a faster lane raises both a job's order and its cost, so a job that jumps the queue also spends its budget faster, and the speed pays for itself from the same pool. Time of use moves cost alone: the same work run off-hours draws less budget at no change to its order. Roughly, a job draws

```text
budget drawn = GPU-hours × time-of-use weight × lane factor
```

and its place in the queue is

```text
job priority = account standing + lane priority + age
```

where account standing is what the managers set and lane priority is what the engineer picks. A single weight caps how far the lane term can lift a job above the standing the managers have set, so an engineer can reorder their own work without overturning the organisation's priorities.

## Priced urgency
Budget is one quantity, weighted GPU-time, and two settings change how fast a job spends it. Time of use makes off-hours cheaper, and a faster lane costs more per GPU-hour. Together they let a small urgent project afford the fast lane while a large one runs most of its work at normal priority. In SLURM these lanes are QOSes: a rush lane with high priority and a usage factor of two, a normal lane at one, and a batch lane with low priority and a usage factor of a half, all drawing on the same budget. The proof of concept can set every factor to one, so priority and budget stay visibly separate until pricing starts.

## Standing across the hierarchy
SLURM's fairshare, in its default form, ranks whole teams before the projects inside them, so a more favoured team's projects sit above a less favoured team's whatever the share values. To let a strong project cross that line when the organisation wants it to, the app computes each project's effective standing itself, blending the team's standing with the project's own, and hands SLURM that single value with its own hierarchical fairshare switched off, so SLURM does not count the team twice. A weight controls how far team membership dominates, from full team precedence at one end to projects competing across the whole organisation at the other. Because the app owns this calculation, it refreshes it periodically from recent use, so that a project that has been idle rises in the queue. At full team precedence the app can leave ordering to SLURM's own fairshare instead. The account tree still holds the budgets and still gathers usage for reporting. A second weight, of the same kind, governs how far an engineer's lane choice can move a job ahead of the standing the managers have set.

## Admission and availability
faircenter counts every budget against the hardware that exists. The GPU-hours the cluster offers over a period are the ceiling, and it measures committed budgets against them. One control, the over-subscription factor, sets how far budgets can commit: below one it holds capacity back so not all of it is promised, at one it commits to the full amount, and above one it over-commits on purpose, since projects rarely peak together and the scheduler absorbs the rest. The app refuses a request that would push committed budgets past that limit, so it can answer at any time whether the resources a project needs will be there.

Because a budget is an entitlement, not reserved hardware, holding capacity back leaves no GPUs idle. The held-back share is a figure in the account tree. The machines behind it run other work.

```text
committed budgets  ≤  capacity × over-subscription factor
```

A proposal's budget, spread over its window, gives an expected demand curve, flat by default, so the average concurrent demand is the budget divided by the duration. Real training loads tend to rise towards a deadline, so once a project is running the app trusts its actual use and remaining budget over the estimate. Summed across projects, the app checks these curves against capacity when it grants a budget: committed demand over any overlapping window must stay within `capacity × over-subscription factor`. The factor starts close to one, so the organisation does not promise much more than exists, and can rise once real use shows how fully projects consume their budgets. Over-committing this way is safe because projects rarely peak together and the scheduler absorbs the rest. Committed budgets run for the life of the project, not re-cut each cycle. Direction can reduce a running budget for more urgent work, a rare manual step rather than routine.

## Parameters
Every tunable value the app holds, and how it is used. Only operations can edit them, and everyone can see them, in the Policy view. Operations keeps the dated capacity schedule on the Load view. Edits stay staged, and reach the scheduler only on an explicit apply.

- `budget` is the cap on how much a pool or project may consume over a period, in weighted GPU-hours, held as a `GrpTRESMins` limit on the person, project or team entry in the account tree.
- `budget enforcement` is the set of switches that decide where budgets bind: person, project and team, each an independent `GrpTRESMins` cap. They are cumulative and coexist, and the roll-out enables them in turn.
- `person pool share` is the fraction of the capacity the cluster offers set aside for the person pool, the rest going to the teams pool. Operations sets it, and it defaults from the rollout phase, starting large and falling towards a small residual as the rollout advances. The person pool's allocated size in GPU-hours is this share of capacity. The teams pool takes the remainder.
- `over-subscription factor` sets how far budgets may be committed against capacity: below 1 holds capacity back, 1 commits to it, above 1 over-commits. It sets admission on its own: a grant is allowed only while `committed demand ≤ capacity × over-subscription factor` over every window. It defaults to 1.05.
- `time-of-use weight` multiplies the cost of running by time of day, for example 1.0 in office hours and 0.5 off-hours.
- `lane priority` is what a lane buys: the queue order it adds, so a rush job starts sooner and a batch job waits.
- `lane factor` is what that speed costs: the multiplier on how fast the job draws its budget, for example 2.0 for rush, 1.0 for normal, 0.5 for batch.
- `standing` is the relative weight that sets order under contention, held per team and per project.
- `team-vs-project weight` sets how much team membership bands the order, as `effective standing = team-vs-project weight × team standing + project standing`, from flat at zero to full team precedence when large.
- `account-vs-lane weight` caps how far a lane can lift a job above account standing, in `job priority = account standing + account-vs-lane weight × lane priority + age`.
- `age` is the priority a job gains from waiting, rising the longer it sits in the queue so that no job waits behind newer arrivals forever, with a scheduler setting controlling how strongly it counts.
- `budget drawn` is how fast a running job consumes its budget: `budget drawn = GPU-hours × time-of-use weight × lane factor`.
- `expected consumption` forecasts end-of-period use from the project's recent rate, capped at its remaining budget so it never exceeds it. The app flags a project on track to reach its cap before the period ends with the date it would. In the proof of concept the rate is a smoothed recent average. Later a model trained on past use replaces it.
