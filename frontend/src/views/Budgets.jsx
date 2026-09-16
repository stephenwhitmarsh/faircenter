import { useState } from 'react'
import {
  teams, people, projectOwner, priorityTier, teamById, primaryTeam,
  personProjects, teamProjectsList,
  personPoolHours, poolBars, teamPhase, governance,
} from '../data/mockData.js'
import DataTable from '../components/DataTable.jsx'
import InfoTip from '../components/InfoTip.jsx'
import PoolBars from '../components/PoolBars.jsx'

const fmt = (n) => Number(Math.round(n) || 0).toLocaleString('en-GB')
const pct = (v, total) => (total ? Math.round((v / total) * 100) : 0)
const teamNameOf = (p) => (p.teamId ? (teamById(p.teamId)?.name || 'team') : 'Organisation')
const ownerTeamOf = (p) => { const o = people.find((pp) => pp.id === p.personId); const t = o && primaryTeam(o); return t ? t.name : '—' }

function PriorityTag({ p }) {
  const t = priorityTier(p)
  if (!t) return <span className="hint">n/a</span>
  return <span className={'tag prio-' + t}>{t}</span>
}

// allocated budget split across the two pools: teams and person
function PoolsCard() {
  const bars = poolBars()
  return (
    <div className="card">
      <div className="card-title">
        Distribution over pools <span className="th-unit">committed vs capacity</span>
        <InfoTip text="Committed budgets against the GPU-hours the cluster offers over the period. Below capacity leaves an uncommitted tail; beyond it shows as over-committed." />
      </div>
      <PoolBars data={bars} mode="allocated" />
    </div>
  )
}

function Section({ title, meta, open, onToggle, children }) {
  return (
    <div className="acc">
      <button className="acc-head" onClick={onToggle}>
        <span className="acc-chev">{open ? '▾' : '▸'}</span>
        <span className="acc-title">{title}</span>
        <span className="acc-meta"><span>{meta}</span></span>
      </button>
      {open && <div className="acc-body">{children}</div>}
    </div>
  )
}

export default function Budgets({ onNav }) {
  const [open, setOpen] = useState(() => new Set())
  const toggle = (k) => setOpen((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })
  const isOpen = (k) => open.has(k)

  const teamPoolTotal = teams.reduce((s, t) => s + t.budget, 0)
  const maxTeamBudget = Math.max(1, ...teams.map((t) => t.budget))
  // person pool aggregated per person: a uniform policy budget, their actual use, and the gap
  const personPeople = (() => {
    const byId = new Map()
    for (const p of personProjects) {
      const o = byId.get(p.personId) || { id: p.personId, name: projectOwner(p), team: ownerTeamOf(p), budget: 0, used: 0, n: 0 }
      o.budget += p.budget; o.used += p.used; o.n += 1
      byId.set(p.personId, o)
    }
    return [...byId.values()]
  })()
  const personTotal = personPeople.reduce((s, r) => s + r.budget, 0)

  return (
    <section>
      <PoolsCard />

      <Section
        title="Team pools" meta={`${fmt(teamPoolTotal)} GPU-h · ${teams.length} teams · ${teamProjectsList.length} projects`}
        open={isOpen('projects')} onToggle={() => toggle('projects')}
      >
        <div className="subhead">Distribution across teams</div>
        <div className="tbl-scroll">
          <DataTable
            initialSort={{ key: 'budget', dir: 'desc' }}
            columns={[
              { key: 'team', label: 'Team', sortValue: (t) => t.name, render: (t) => t.name },
              { key: 'budget', label: 'Budget', num: true, sortValue: (t) => t.budget, render: (t) => fmt(t.budget) },
              { key: 'share', label: 'Share of team pool', sortValue: (t) => t.budget, render: (t) => (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, width: 200 }}>
                  <span className="meter" style={{ flex: 1 }}><span style={{ width: (t.budget / maxTeamBudget) * 100 + '%' }} /></span>
                  <span style={{ width: 44, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{pct(t.budget, teamPoolTotal)}%</span>
                </span>
              ) },
              { key: 'phase', label: 'Phase', num: true, sortValue: (t) => teamPhase(t), render: (t) => (t.phaseOverride != null ? <span className="tag" title={`Set for this team; org default is phase ${governance.phase}`}>{teamPhase(t)} · set</span> : <span className="hint">{teamPhase(t)}</span>) },
              { key: 'standing', label: 'Standing', num: true, sortValue: (t) => t.standing, render: (t) => t.standing },
              { key: 'people', label: 'People', num: true, sortValue: (t) => people.filter((p) => (p.teamIds ?? []).includes(t.id)).length, render: (t) => fmt(people.filter((p) => (p.teamIds ?? []).includes(t.id)).length) },
              { key: 'projects', label: 'Projects', num: true, sortValue: (t) => teamProjectsList.filter((p) => p.teamId === t.id).length, render: (t) => fmt(teamProjectsList.filter((p) => p.teamId === t.id).length) },
            ]}
            rows={teams.map((t) => ({ ...t, id: t.id }))}
          />
        </div>
        <div className="subhead" style={{ marginTop: 12 }}>Team projects</div>
        <div className="tbl-scroll">
          <DataTable
            initialSort={{ key: 'budget', dir: 'desc' }}
            columns={[
              { key: 'team', label: 'Team', sortValue: (p) => teamNameOf(p), render: (p) => teamNameOf(p) },
              { key: 'name', label: 'Project', sortValue: (p) => p.name, render: (p) => p.name },
              { key: 'budget', label: 'Budget', num: true, sortValue: (p) => p.budget, render: (p) => fmt(p.budget) },
              { key: 'share', label: '% of pool', num: true, sortValue: (p) => p.budget, render: (p) => pct(p.budget, teamPoolTotal) + '%' },
              { key: 'prio', label: 'Priority', sortValue: (p) => ({ high: 3, medium: 2, low: 1 }[priorityTier(p)] || 0), render: (p) => <PriorityTag p={p} /> },
              { key: 'state', label: 'Dates', sortValue: (p) => p.startMs, render: (p) => `${p.start} to ${p.end}` },
            ]}
            rows={teamProjectsList}
          />
        </div>
      </Section>

      <Section
        title="Person pool" meta={`${fmt(personPoolHours())} GPU-h · ${personPeople.length} people`}
        open={isOpen('person')} onToggle={() => toggle('person')}
      >
        <div className="tbl-scroll">
          <DataTable
            initialSort={{ key: 'used', dir: 'desc' }}
            colWidths={[190, 130, 100, 200, 110]}
            columns={[
              { key: 'name', label: 'Person', sortValue: (r) => r.name, render: (r) => r.name },
              { key: 'team', label: 'Home team', sortValue: (r) => r.team, render: (r) => <span className="hint">{r.team}</span> },
              { key: 'budget', label: 'Budget', num: true, sortValue: (r) => r.budget, render: (r) => fmt(r.budget) },
              { key: 'used', label: <>Used <span className="th-unit">of budget</span></>, sortValue: (r) => r.used, render: (r) => {
                const frac = r.budget > 0 ? r.used / r.budget : 0
                const over = frac > 1
                return (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, width: 184 }} title={Math.round(frac * 100) + '% of budget'}>
                    <span className="meter" style={{ flex: 1 }}><span style={{ width: Math.min(1, frac) * 100 + '%', background: over ? 'var(--warning)' : 'var(--good)' }} /></span>
                    <span style={{ width: 58, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(r.used)}</span>
                  </span>
                )
              } },
              { key: 'diff', label: 'Over / under', num: true, sortValue: (r) => r.used - r.budget, render: (r) => { const d = Math.round(r.used - r.budget); if (d > 0) return <span className="tag warn">+{fmt(d)}</span>; if (d < 0) return <span className="tag ok">{fmt(d)}</span>; return <span className="hint">0</span> } },
            ]}
            rows={personPeople}
          />
        </div>
      </Section>
    </section>
  )
}
