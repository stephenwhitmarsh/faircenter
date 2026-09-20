# Strategy

## What this addresses
A bare scheduler gives no way to decide who gets what, no shared view of use, no record of what was granted, and no way to weigh demand against the hardware. Without them, access is first come first served, and people over-ask, hold more than they need, or work around the queue.

Deciding who gets what does not scale as a single, central act. As the organisation grows, those decisions have to be shared out: to operations for capacity and cost, to team leads within their teams, to direction for priorities. Each can only decide well with the right figures in front of them: current use, demand against the hardware, what is heading over budget, and what is waiting on approval. Managing that split of decisions, and giving each decision-maker what they need, matters as much as the budgets.

## The end state
The aim is a governed allocation the organisation can act on. Every team, project and person works within a budget, a share of GPU time over a period. Everyone can see use, budgets, reservations and the rules behind them. Changes go through requests to a named approver. Each decision sits with whoever holds the information to make it, and the app gives them the figures to decide and to escalate. Most work has moved from individual use into funded team projects, with a small person pool kept for exploratory work.

## Phasing
The budgets come in over phases. For an engineer each phase opens a new place to draw budget from and adds the cap that comes with it, so a team gains a larger, shared source as it takes on more of its own planning. Teams move through the phases one at a time. Each phase is trialled with a few teams, and once it holds they move on and others follow, so a settled team can advance while a fast-moving one stays at an earlier phase.

```mermaid
graph TD

  p1([phase 1:<br/>measure]) --> p2([phase 2:<br/>person budgets])
  p2 --> p3([phase 3:<br/>team pools])
  p3 --> p4([phase 4:<br/>project budgets])
  p4 --> p5([phase 5:<br/>cross-team standing])
```

The first phase adds no budgets. It measures what happens: whose jobs run, how the cluster fills through the week, and how long work waits. This record sizes every later phase.

The second phase opens a personal budget for each person from the person pool and caps individual use at it. It is the first enforced limit, kept while most work is still individual. Priority stays flat and every job runs at the same urgency, so the cluster shares evenly and budget size carries the weight.

The third phase opens the team pool. An engineer now runs a project's work against the team's shared pool rather than a personal allowance, and the cap is the team total, so the team's projects draw that pool freely until it is used up. This is where sustained work moves off the person pool onto the team, run by the team lead as one coarse envelope sized from recent use rather than a figure per project. As it happens the person pool's share falls and the teams pool grows to match.

The fourth phase opens a budget for each project, carved from the team pool, and caps the project at it. A project gains a share it can rely on instead of competing freely with its siblings, and its planning passes to the project lead: requests, reservations and priority within the budget. Priced lanes open here too, so a project can spend its own budget faster to run sooner, and only project work can buy that urgency, which keeps funded projects ahead of best-effort personal work. It is added only where a team needs the finer grain, not imposed everywhere.

The fifth phase opens no new budget. It gives teams standing relative to one another, so standing arbitrates between teams when the cluster is contended and a strong project can outrank a weaker one in a more favoured team.

## Scalability
The organisation is growing in three ways at once: more people and teams, more demand on the cluster, and eventually more hardware. The scheme addresses the first two directly and makes the third a decision it can inform rather than one it makes.

Churn is where it helps most. Because allocation keys to the project rather than the org chart, and a project carries its own budget and history, teams can split and merge and people can move without stranding budgets, which matters when reorganisations come every few weeks. Governance load scales with the number of funded projects, not with headcount, since personal work is self-service and needs no approval, so a jump in people does not bring a matching jump in approvals.

Governance intensity tracks maturity rather than being fixed. The phasing is a ready escalation path, run light while contention is mild and turned up mechanism by mechanism as it bites, with a per-team override so a fast-growing team can move ahead of the rest. The person-pool share is a single dial operations lowers as sustained individual work formalises into projects, so growth is absorbed by informal work graduating into governed projects rather than by adding process everywhere.

The over-subscription factor scales throughput on fixed hardware. It sets how far committed budgets may exceed the GPU-hours the cluster offers, since projects rarely peak together and the scheduler absorbs the rest, and the admission check keeps total commitments reconciled to the hardware. Raised with evidence from realised use, it lets the same cluster carry more committed work, which buys time before the next purchase. Held below one, it keeps headroom for bursts.

When more hardware is the only answer, the resource outlook frames it: realised demand and committed entitlement against scheduled capacity, with a runway to the threshold, turning growth into a dated and quantified case for the next investment. The app allocates and reports. It does not schedule jobs, which is the scheduler's work, and it does not buy hardware.

```mermaid
graph TD

  growth([explosive growth]) --> churn([teams split, people move])
  growth --> demand([rising demand])
  churn --> unit([project: the durable unit])
  demand --> dials([dials: phase, person-pool share, over-subscription])
  demand --> outlook([demand vs scheduled capacity])
  outlook -.-> buy([capacity decision])
```

## Risk assessment

### Organisational change
Organisational change is the largest risk. Staff, projects and teams change often, and a design tied to a fixed org chart would break at the first reorganisation. The project is the durable unit, carrying its own budget and history, so moving it between teams changes only where it reports. Splitting or merging a team re-points which projects belong where and leaves the projects intact. Because most budget sits with projects and teams, someone leaving does not strand a project, and someone joining draws on their project's budget at once. [BUILD.md](BUILD.md) covers the stored history behind this.

```mermaid
graph TD

  team([current team]) --> project([project])
  prev([previous team]) -.-> project
  project --> budget([budget])
  budget --> history([history])
```

### Gaming and hoarding
Gaming and hoarding do not pay off. A budget is a volume of GPU-time, not a place in the queue. A large one lets a project run more over the period but does not move its jobs up, since standing sets the order and the managers hold standing. Standing falls the more an account has used lately, so spending hard to get ahead pushes a project's own later jobs behind lighter users. The one way to turn budget into priority is to pay for a fast lane, which spends the budget faster. And because a budget is an entitlement and not reserved hardware, a large unused budget holds nothing back: the scheduler runs other work on the idle capacity.

### Over-asking
Over-asking is caught when a budget is granted. Capacity is finite, so a large budget leaves less for everyone else, and an approver who can see the whole pool and the priorities authorises it first. Once the project is running, the analytics show its share of use against its priority, so a project drawing more than its rank warrants stands out and can be cut at the next review.

### Transparency and incentives
Because everyone can see how the app allocates, there is little room for quiet gaming, and the same settings steer behaviour. A cheaper off-hours `time-of-use weight` moves heavy work to the night, a higher rush `lane factor` discourages casual use of the fast lane, and the published `over-subscription factor` shows how fully the organisation commits its capacity.

### Planning burden
Compute for research is hard to predict, sometimes impossible, and holding an engineer to a budget set before a milestone adds overhead and harms morale for little gain. So the app keeps budgets preliminary. A budget is a rough envelope declared for planning, sized from recent use where there is history, and revised at a regular review. In phases that do not enforce it, it is a target to plan against, not a cap that stops jobs.

Introducing project budgets is left to each team leader rather than mandated by the organisation. A lead turns them on only when the team's work divides into projects that can be planned, and otherwise stays at team-level budgeting. This keeps the effort of estimating compute per project off teams whose research resists estimation, and limits the morale cost of strict self-declaration to the teams that have chosen it.

Budgets still do real work. They give each team and project a share of the cluster it can count on, not first-come-first-served. They let every commitment be checked against the hardware, so the organisation knows in advance whether a plan's resources will be there and when to buy more. And a budget is a volume rather than a rank, so it bounds spend without setting order: what runs first comes from the team's standing and the scheduler's fairshare. That lets a budget stay generous and coarse instead of tight and punitive.

Unpredictable work needs no plan at all. It runs in the person pool, with no budget, approval or reservation, and the first phase enforces nothing, showing only use, queues and waits. Operations adds only as much structure as growth demands, leaves teams to run their own work, and watches the total and its spread across teams rather than any one person's plan.

### Smaller risks
The smaller risks each have a clear answer:

- Promising more than exists. The app checks every grant against real capacity, so the totals reconcile to the hardware available (see the [policy](POLICY.md)).
- Stale organisation data. The app keys to its own stable identifiers and falls back when a project or person is briefly unattached, so a Notion rename or a mid-reorganisation gap does not break allocation.
- Reliance on one scheduler. An adapter sits in front of the scheduler, so swapping SLURM for another changes nothing else.
- Weak adoption. The first phase needs no priority policy and no per-job approval, so the scheme is light to adopt, and the visibility it gives direction is the reason to keep using it.
