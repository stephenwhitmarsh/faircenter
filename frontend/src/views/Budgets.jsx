// Budgets tab: the two pools and how they are divided. Operations size each
// team's pool here; team leads split it across projects on the Team tab.
import { useState } from 'react'
import { fmt } from '../format.js'
import {
  teams, people, projectOwner, priorityTier, teamById, primaryTeam,
  personProjects, teamProjectsList,
  personPoolHours, projectsPoolHours, poolBars, teamPhase, teamHue, governance, capacityHours, parameters, period,
} from '../data/mockData.js'
import DataTable from '../components/DataTable.jsx'
import InfoTip from '../components/InfoTip.jsx'
import PoolBars from '../components/PoolBars.jsx'
import { useSession } from '../session.jsx'

const pct = (v, total) => (total ? Math.round((v / total) * 100) : 0)
const PERIOD_H = (period.endMs - period.startMs) / (3600 * 1000)
const avgGpus = (gpuh) => Math.round(gpuh / PERIOD_H)
const teamNameOf = (p) => (p.teamId ? (teamById(p.teamId)?.name || 'team') : 'Organisation')
const ownerTeamOf = (p) => { const o = people.find((pp) => pp.id === p.personId); const t = o && primaryTeam(o); return t ? t.name : '—' }
const teamUsed = (t) => teamProjectsList.filter((p) => p.teamId === t.id).reduce((s, p) => s + (p.used || 0), 0)

function PriorityTag({ p }) {
  const t = priorityTier(p)
  if (!t) return <span className="hint">n/a</span>
  return <span className={'tag prio-' + t}>{t}</span>
}

// allocated budget split across the two pools: teams and person
function PoolsCard({ teamDraftTotal }) {
  const bars = poolBars(120, teamDraftTotal)
  return (
    <div className="card">
      <div className="card-title">
        Distribution over pools <span className="th-unit">committed vs capacity · GPUs</span>
        <InfoTip text="Pools and team allowances are shown as GPUs: a share of the cluster. Of the ~1408 GPUs the cluster runs, the person pool holds about 310 and the teams pool about 1098; a team's allowance is how many GPUs of the cluster it holds on average. Project budgets, by contrast, are GPU-hours over each project's own dates. Below capacity leaves an uncommitted tail; beyond it is over-subscribed." />
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
  const { can } = useSession()
  const canEdit = can('editPolicy') // only operations size team pools
  const [open, setOpen] = useState(() => new Set())
  const toggle = (k) => setOpen((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })
  const isOpen = (k) => open.has(k)

  // the teams pool: the GPU-hours left after the person pool, divided across teams
  const teamsPoolHours = projectsPoolHours()
  // over-subscription: budgets may be committed up to capacity x factor, so the teams pool can be
  // filled past its nominal size into that headroom (see the over-subscription factor in Policy)
  const oversub = parameters?.oversubscriptionFactor ?? 1
  const teamsCeiling = Math.max(teamsPoolHours, Math.round(capacityHours() * oversub) - personPoolHours())
  const [, setRev] = useState(0) // bump to re-read team.budget after Apply
  const [tDraft, setTDraft] = useState(() => Object.fromEntries(teams.map((t) => [t.id, t.budget])))
  const resetTeams = () => setTDraft(Object.fromEntries(teams.map((t) => [t.id, t.budget])))
  // an edit can never push the running total past the teams pool; the rest holds what the other teams hold
  const setTeamBudget = (id, rawGpus) => setTDraft((d) => {
    const gpuh = Math.round((Number(rawGpus) || 0) * PERIOD_H)
    const others = teams.reduce((s, t) => s + (t.id === id ? 0 : (d[t.id] ?? t.budget)), 0)
    const maxV = Math.max(0, teamsCeiling - others)
    return { ...d, [id]: Math.min(maxV, Math.max(0, gpuh)) }
  })
  const allocTeams = teams.reduce((s, t) => s + (tDraft[t.id] ?? t.budget), 0)
  const remainTeams = teamsPoolHours - allocTeams
  const teamsDirty = teams.some((t) => (tDraft[t.id] ?? t.budget) !== t.budget)
  const applyTeams = () => { for (const t of teams) if (tDraft[t.id] != null) t.budget = tDraft[t.id]; setRev((v) => v + 1) }

  const teamPoolTotal = teams.reduce((s, t) => s + t.budget, 0)
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

  return (
    <section>
      <PoolsCard teamDraftTotal={allocTeams} />

      <Section
        title="Team pools" meta={`${fmt(avgGpus(teamsPoolHours))} GPUs · ${teams.length} teams · ${teamProjectsList.length} projects`}
        open={isOpen('projects')} onToggle={() => toggle('projects')}
      >
        <div className="subhead">Distribution across teams</div>
        {canEdit && <p className="hint" style={{ margin: '0 0 8px' }}>Size each team's pool within the teams pool. Team leads split it across projects on the Team tab.</p>}
        <div className="tbl-scroll">
          <table className="data" style={{ tableLayout: 'fixed' }}>
            <colgroup><col /><col style={{ width: '90px' }} /><col style={{ width: '110px' }} /><col style={{ width: '140px' }} /><col style={{ width: '190px' }} /></colgroup>
            <thead><tr><th>Team</th><th className="num">Phase</th><th className="num">Used <span className="th-unit">GPUs</span></th><th className="num">Allowance <span className="th-unit">GPUs</span></th><th>Share of teams pool</th></tr></thead>
            <tbody>
              {teams.map((t) => {
                const b = tDraft[t.id] ?? t.budget
                const share = pct(b, teamsPoolHours)
                return (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td className="num">{t.phaseOverride != null ? <span className="tag" title={`Set for this team; org default is phase ${governance.phase}`}>{teamPhase(t)} · set</span> : <span className="hint">{teamPhase(t)}</span>}</td>
                    <td className="num">{fmt(avgGpus(teamUsed(t)))}</td>
                    <td className="num">
                      {canEdit
                        ? <span className="numin"><input type="number" min="0" step="8" value={avgGpus(b)} onChange={(e) => setTeamBudget(t.id, e.target.value)} style={{ width: 90 }} /></span>
                        : fmt(avgGpus(b))}
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, width: 180 }}>
                        <span className="meter" style={{ flex: 1 }}><span style={{ width: Math.min(100, share) + '%', background: teamHue[t.id] }} /></span>
                        <span style={{ width: 38, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{share}%</span>
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}><b>Allocated</b></td>
                <td className="num"><b>{fmt(avgGpus(allocTeams))}</b></td>
                <td><b>{pct(allocTeams, teamsPoolHours)}%</b> of pool</td>
              </tr>
              <tr>
                <td colSpan={3}>{remainTeams < 0 ? 'Over-subscribed' : 'Remaining'}</td>
                <td className="num">{fmt(avgGpus(Math.abs(remainTeams)))}</td>
                <td>{remainTeams < 0 ? `${pct(Math.abs(remainTeams), teamsPoolHours)}% past the pool (within the ${fmt(avgGpus(teamsCeiling))} GPU ceiling)` : `${pct(Math.abs(remainTeams), teamsPoolHours)}% of pool`}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {canEdit && (
          <div className="apply-bar">
            <button className="btn primary" disabled={!teamsDirty} onClick={applyTeams}>Apply</button>
            <button className="btn" disabled={!teamsDirty} onClick={resetTeams}>Discard</button>
            <span className="hint">{teamsDirty ? 'Staged.' : 'No staged changes.'} The pool can be filled past its size into the over-subscription headroom, up to the {fmt(avgGpus(teamsCeiling))} GPU ceiling.</span>
          </div>
        )}
      </Section>

      <Section
        title="Person pool" meta={`${fmt(avgGpus(personPoolHours()))} GPUs · ${personPeople.length} people`}
        open={isOpen('person')} onToggle={() => toggle('person')}
      >
        <div className="tbl-scroll">
          <DataTable
            initialSort={{ key: 'used', dir: 'desc' }}
            colWidths={[190, 130, 100, 200, 110]}
            columns={[
              { key: 'name', label: 'Person', sortValue: (r) => r.name, render: (r) => r.name },
              { key: 'team', label: 'Home team', sortValue: (r) => r.team, render: (r) => <span className="hint">{r.team}</span> },
              { key: 'budget', label: <>Budget <span className="th-unit">GPUs</span></>, num: true, sortValue: (r) => r.budget, render: (r) => fmt(avgGpus(r.budget)) },
              { key: 'used', label: <>Used <span className="th-unit">of budget</span></>, sortValue: (r) => r.used, render: (r) => {
                const frac = r.budget > 0 ? r.used / r.budget : 0
                const over = frac > 1
                return (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, width: 184 }} title={Math.round(frac * 100) + '% of budget'}>
                    <span className="meter" style={{ flex: 1 }}><span style={{ width: Math.min(1, frac) * 100 + '%', background: over ? 'var(--warning)' : 'var(--good)' }} /></span>
                    <span style={{ width: 58, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(avgGpus(r.used))}</span>
                  </span>
                )
              } },
              { key: 'diff', label: 'Over / under', num: true, sortValue: (r) => r.used - r.budget, render: (r) => { const d = avgGpus(r.used - r.budget); if (d > 0) return <span className="tag warn">+{fmt(d)}</span>; if (d < 0) return <span className="tag ok">{fmt(d)}</span>; return <span className="hint">0</span> } },
            ]}
            rows={personPeople}
          />
        </div>
      </Section>
    </section>
  )
}
