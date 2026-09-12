// Synthetic POC dataset for faircenter.
//
// This module is the single data source for the whole app during the POC.
// Its shape mirrors what the Django REST API will later return, so when the
// backend exists the views keep working and only this file is swapped for
// live API calls.
//
// All GPU figures are GPU-hours. Budgets are set per allocation period.

export const period = {
  name: 'September 2026',
  year: 2026,
  month: 9,            // 1-based
  start: '2026-09-01',
  end: '2026-09-30',
  totalDays: 30,
  today: 12,           // day-of-month reached so far
  nowHour: 14,         // hour of day reached today (0-23)
}
period.elapsed = period.today / period.totalDays

// Format a day-of-month in the period as a short date label, e.g. "03 Sep".
export function dayLabel(day) {
  const d = new Date(period.year, period.month - 1, day)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}
export function hourLabel(h) {
  return String(h).padStart(2, '0') + ':00'
}

// Whole cluster for the period. The org pool is the whole capacity; every
// other budget is a division of it.
export const cluster = {
  capacityGpuHours: 48000,
  gpus: 64,
}

export const teams = [
  { id: 't-pre', name: 'Pretraining', budget: 10000 },
  { id: 't-ft', name: 'Fine-tuning', budget: 5000 },
  { id: 't-eval', name: 'Evaluation', budget: 1500 },
]

// teamIds: teams a person belongs to (many-to-many; a multi-domain expert can
// support several). The first is treated as the primary team, used as the default
// SLURM account context and for tidy single-team display.
// projectIds: which projects a person is allocated to (from Notion). This is the
// staffing link, separate from team membership.
// role: 'lead' marks a team lead (of their primary team); 'ops' marks
// operations. Everyone else is an ordinary member (implicitly a viewer).
// In production this comes from the identity provider, not the app.
export const people = [
  { id: 'p-ada', name: 'Ada Lovelace', teamIds: ['t-pre'], budget: 150, projectIds: ['prj-base', 'prj-sched'], role: 'lead' },
  { id: 'p-alan', name: 'Alan Turing', teamIds: ['t-pre'], budget: 150, projectIds: ['prj-base', 'prj-datapipe'] },
  { id: 'p-grace', name: 'Grace Hopper', teamIds: ['t-pre'], budget: 150, projectIds: ['prj-datapipe'] },
  { id: 'p-ravi', name: 'Ravi Patel', teamIds: ['t-ft'], budget: 150, projectIds: ['prj-instruct', 'prj-probe'] },
  { id: 'p-lena', name: 'Lena Hart', teamIds: ['t-ft'], budget: 150, projectIds: ['prj-instruct', 'prj-rlhf'], role: 'lead' },
  { id: 'p-omar', name: 'Omar Diallo', teamIds: ['t-ft'], budget: 150, projectIds: ['prj-rlhf'] },
  { id: 'p-mei', name: 'Mei Chen', teamIds: ['t-eval'], budget: 150, projectIds: ['prj-bench'], role: 'lead' },
  { id: 'p-jonas', name: 'Jonas Weber', teamIds: ['t-eval'], budget: 150, projectIds: ['prj-redteam', 'prj-safety'] },
  { id: 'p-sara', name: 'Sara Nkosi', teamIds: ['t-eval'], budget: 150, projectIds: ['prj-bench', 'prj-safety'] },
  // multi-domain expert supporting two teams
  { id: 'p-nadia', name: 'Nadia Rahman', teamIds: ['t-pre', 't-eval'], budget: 150, projectIds: ['prj-base', 'prj-bench'] },
  // operations: no team, sets policy and capacity, approves and writes to SLURM
  { id: 'p-priya', name: 'Priya Nair', teamIds: [], budget: 0, projectIds: [], role: 'ops' },
]

export const leads = people.filter((p) => p.role === 'lead')
export const opsPeople = people.filter((p) => p.role === 'ops')

// Lanes are the priced urgency tiers, chosen per job at submission (not a
// project attribute). factor scales how fast budget is drawn; priority is the
// queue weight the lane adds. `enabled` is set by operations.
export const lanes = {
  bulk: { key: 'bulk', label: 'bulk', factor: 0.7, priority: -50, enabled: true },
  standard: { key: 'standard', label: 'standard', factor: 1.0, priority: 0, enabled: true },
  fast: { key: 'fast', label: 'fast', factor: 1.5, priority: 100, enabled: true },
}

// funding: 'team' draws on the team budget, 'person' on a personal budget,
// 'org' directly on the org pool.
export const projects = [
  { id: 'prj-base', name: 'Base model v3', funding: 'team', teamId: 't-pre', budget: 7000, used: 3100, priority: 60, start: '2026-09-01', end: '2026-09-30' },
  { id: 'prj-datapipe', name: 'Data pipeline', funding: 'team', teamId: 't-pre', budget: 3000, used: 1300, priority: 40, start: '2026-09-01', end: '2026-09-30' },
  { id: 'prj-instruct', name: 'Instruct tuning', funding: 'team', teamId: 't-ft', budget: 3250, used: 1900, priority: 55, start: '2026-09-01', end: '2026-09-30' },
  { id: 'prj-rlhf', name: 'RLHF experiments', funding: 'team', teamId: 't-ft', budget: 1750, used: 450, priority: 35, start: '2026-09-05', end: '2026-09-30' },
  { id: 'prj-bench', name: 'Benchmark suite', funding: 'team', teamId: 't-eval', budget: 1750, used: 1050, priority: 45, start: '2026-09-01', end: '2026-09-30' },
  { id: 'prj-redteam', name: 'Red-team evals', funding: 'team', teamId: 't-eval', budget: 1250, used: 700, priority: 50, start: '2026-09-01', end: '2026-09-30' },
  { id: 'prj-sched', name: 'Ada Lovelace (personal)', funding: 'person', personId: 'p-ada', budget: 150, used: 60, priority: 1, start: '2026-09-01', end: '2026-09-30' },
  { id: 'prj-probe', name: 'Ravi Patel (personal)', funding: 'person', personId: 'p-ravi', budget: 150, used: 125, priority: 1, start: '2026-09-01', end: '2026-09-30' },
  { id: 'prj-safety', name: 'Safety audit', funding: 'org', teamId: 't-eval', budget: 1250, used: 650, priority: 80, start: '2026-09-01', end: '2026-09-30' },
  { id: 'prj-infra', name: 'Infra benchmarking', funding: 'org', budget: 750, used: 200, priority: 30, start: '2026-09-08', end: '2026-09-30' },
]

export const reservations = [
  { id: 'r-base', projectId: 'prj-base', label: 'Full-cluster training run', gpus: 16, start: '2026-09-20', end: '2026-09-22' },
  { id: 'r-bench', projectId: 'prj-bench', label: 'Release evaluation', gpus: 8, start: '2026-09-18', end: '2026-09-18' },
  { id: 'r-safety', projectId: 'prj-safety', label: 'Audit sweep', gpus: 8, start: '2026-09-24', end: '2026-09-25' },
]

// Policy values, editable only by operations, visible to all.
export const parameters = {
  headroom: { org: 0.10, team: 0.10, project: 0.05 },
  oversubscriptionFactor: 1.1,
  timeOfUse: { office: 1.0, off: 0.5 },
  weights: { accountVsLane: 1.0, teamVsProject: 0.5 },
  lanes,
  // switchable policy toggles, set by operations
  toggles: {
    lanes: true,          // priced urgency in effect
    timeOfUse: true,      // office/off-hours weighting in effect
    headroom: true,       // headroom held back
    oversubscription: true,
    teamStanding: false,  // cross-team standing (phased in later)
  },
}

// Change requests routed up for approval.
export const requests = [
  { id: 'req-1', type: 'budget change', subject: 'Instruct tuning +2000 GPU-hours', requestedBy: 'Lena Hart', routedTo: 'Operations', status: 'pending', warning: 'Would take the Fine-tuning budget past its limit.' },
  { id: 'req-2', type: 'new project', subject: 'Long-context evaluation', requestedBy: 'Mei Chen', routedTo: 'Evaluation lead', status: 'pending', warning: null },
  { id: 'req-3', type: 'priority change', subject: 'Raise Base model v3 priority to 75', requestedBy: 'Alan Turing', routedTo: 'Direction', status: 'pending', warning: null },
  { id: 'req-4', type: 'budget change', subject: 'Red-team evals +500 GPU-hours', requestedBy: 'Sara Nkosi', routedTo: 'Evaluation lead', status: 'approved', warning: null },
]

// --- helpers ---

export const orgPool = cluster.capacityGpuHours

export function teamById(id) { return teams.find((t) => t.id === id) }
export function personById(id) { return people.find((p) => p.id === id) }
export function teamsForPerson(person) { return (person.teamIds ?? []).map(teamById).filter(Boolean) }
export function primaryTeam(person) { return teamsForPerson(person)[0] }
export function projectById(id) { return projects.find((p) => p.id === id) }
export function projectsForPerson(person) { return (person.projectIds ?? []).map(projectById).filter(Boolean) }
export function peopleForProject(projectId) { return people.filter((p) => (p.projectIds ?? []).includes(projectId)) }

export function projectOwner(prj) {
  if (prj.funding === 'team') return teamById(prj.teamId)?.name ?? 'team'
  if (prj.funding === 'person') return personById(prj.personId)?.name ?? 'person'
  return 'Organisation'
}

export function ownerBucket(prj) {
  if (prj.funding === 'team') return teamById(prj.teamId)?.name
  if (prj.funding === 'person') return 'Personal'
  return 'Organisation'
}

export function pctOfOrg(v) { return Math.round((v / orgPool) * 100) }

// Ordinal rank of a project within its owning pool (its team, or the org pool
// for teamless projects). Between-pool arbitration is by budget share via SLURM
// fair-tree; this rank is only the owner's ordering inside the pool, so its
// magnitude carries no meaning, only its order. Personal projects have no rank.
export function projectRank(project) {
  if (project.funding === 'person') return null
  const key = project.teamId ?? null
  const pool = projects.filter((p) => p.funding !== 'person' && (p.teamId ?? null) === key)
  const sorted = [...pool].sort((a, b) => b.priority - a.priority)
  return { rank: sorted.findIndex((p) => p.id === project.id) + 1, of: pool.length }
}
export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// deterministic pseudo-random so the synthetic series is stable across renders
function hashSeed(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
function makeRng(seed) {
  let s = seed || 1
  return () => { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; return s / 0x7fffffff }
}

// Daily GPU-hours used by a project for days 1..today, summing to project.used.
export function dailyIncrements(project) {
  const rng = makeRng(hashSeed(project.id))
  const startDay = project.start === period.start ? 1 : Number(project.start.slice(-2))
  const days = []
  let sum = 0
  for (let d = 1; d <= period.today; d++) {
    const w = d < startDay ? 0 : 0.8 + rng() * 0.4
    days.push(w); sum += w
  }
  return days.map((w) => (sum > 0 ? (project.used * w) / sum : 0))
}

// Cumulative usage across the whole period: actual for days 1..today, then a
// straight-line projection at the current rate for today+1..totalDays.
export function projectDailyCumulative(project) {
  const inc = dailyIncrements(project)
  const out = []
  let cum = 0
  for (let d = 1; d <= period.today; d++) { cum += inc[d - 1]; out.push({ day: d, value: Math.round(cum), projected: false }) }
  const rate = period.today > 0 ? project.used / period.today : 0
  for (let d = period.today + 1; d <= period.totalDays; d++) {
    out.push({ day: d, value: Math.round(project.used + rate * (d - period.today)), projected: true })
  }
  return out
}

// Sum of a project's usage within a day window [startDay, endDay] inclusive.
export function usedInWindow(project, startDay, endDay) {
  const inc = dailyIncrements(project)
  let s = 0
  for (let d = Math.max(1, startDay); d <= Math.min(period.today, endDay); d++) s += inc[d - 1]
  return Math.round(s)
}

export function expectedConsumption(project) {
  if (period.elapsed <= 0) return project.used
  return Math.round(project.used / period.elapsed)
}

// Per-hour usage for today (hours 0..nowHour), with a diurnal shape, scaled so
// the hours sum to the project's usage on the current day.
export function hourlyActualToday(project) {
  const rng = makeRng(hashSeed(project.id + ':h'))
  const todayUsed = dailyIncrements(project)[period.today - 1] || 0
  const weights = []
  let sum = 0
  for (let h = 0; h <= period.nowHour; h++) {
    // low overnight, rising through the working day
    const diurnal = 0.5 + 0.5 * Math.max(0, Math.sin(((h - 6) / 24) * Math.PI * 2) * 0.5 + 0.5)
    const w = diurnal * (0.9 + rng() * 0.2)
    weights.push(w); sum += w
  }
  return weights.map((w, h) => ({ hour: h, value: sum > 0 ? (todayUsed * w) / sum : 0 }))
}

// Smoothed recent rate per bucket (a stand-in for spline/trend extrapolation):
// the mean of the last `n` actual buckets.
function recentRate(values, n = 3) {
  const tail = values.slice(-n).filter((v) => v > 0)
  if (!tail.length) return 0
  return tail.reduce((s, v) => s + v, 0) / tail.length
}

// Forecast future buckets by continuing the recent rate, but never spending
// more than the budget still has left: each bucket is capped by the remaining
// budget, so the forecast tapers to zero as a project exhausts its budget.
// Returns an array of `steps` forecast values.
export function forecastBuckets(project, actualValues, steps) {
  const rate = recentRate(actualValues)
  let remaining = Math.max(0, project.budget - project.used)
  const out = []
  for (let i = 0; i < steps; i++) {
    const v = Math.min(rate, remaining)
    out.push(v)
    remaining -= v
  }
  return out
}

// Day the project is on track to exhaust its budget at the current rate, or
// null if it stays within budget through the period.
export function exhaustionDay(project) {
  const rate = period.today > 0 ? project.used / period.today : 0
  if (rate <= 0) return null
  const remaining = project.budget - project.used
  const day = period.today + remaining / rate
  return day <= period.totalDays ? Math.round(day) : null
}

// Cross-period history for Analytics: monthly cluster utilisation (%) and
// committed demand (GPU-hours) over the past months. Illustrative.
export const history = [
  { month: 'Apr', util: 61, demand: 33000 },
  { month: 'May', util: 66, demand: 36000 },
  { month: 'Jun', util: 72, demand: 38000 },
  { month: 'Jul', util: 78, demand: 41000 },
  { month: 'Aug', util: 83, demand: 44000 },
  { month: 'Sep', util: 88, demand: 46000 },
]
