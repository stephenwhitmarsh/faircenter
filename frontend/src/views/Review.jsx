import { useState, useEffect } from 'react'
import DataTable from '../components/DataTable.jsx'
import InfoTip from '../components/InfoTip.jsx'
import {
  projectProjects, teamById, period, projRate, projectState, fmtDay, fmtDateTime,
  projectById, personById, priorityTier, projectOwner, people, jobs, expectedToDate, projectEnforced,
} from '../data/mockData.js'
import { useSession, currentPerson } from '../session.jsx'

const DAY = 24 * 3600 * 1000
const fmt = (n) => Number(Math.round(n) || 0).toLocaleString('en-GB')
function runsOutDate(p) {
  const rate = projRate(p)
  if (rate <= 0 || p.used >= p.budget) return null
  const d = period.nowMs + ((p.budget - p.used) / rate) * DAY
  return d <= Math.min(p.endMs, period.endMs) ? d : null
}
function handle(name) { return name ? name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '') + '@org' : null }

// retained across view switches
const memo = { sel: null, finished: false, mine: true }

export default function Review() {
  const { session } = useSession()
  const me = currentPerson(session)
  // a viewer sees only their own projects by default; operations and the anonymous viewer see all
  const scoped = !!me && session.role !== 'ops'
  const [sel, setSel] = useState(memo.sel)
  const [showFinished, setShowFinished] = useState(memo.finished)
  const [onlyMine, setOnlyMine] = useState(memo.mine)
  useEffect(() => { memo.sel = sel; memo.finished = showFinished; memo.mine = onlyMine })

  const isMine = (p) => !!me && ((me.projectIds || []).includes(p.id) || p.leadPersonId === me.id)
  const rows = projectProjects
    .filter((p) => p.startMs < period.nowMs)
    .filter((p) => showFinished || projectState(p) !== 'finished')
    .filter((p) => !(scoped && onlyMine) || isMine(p))
    .map((p) => {
      const expected = expectedToDate(p)
      return {
        id: p.id, name: p.name, team: p.teamId ? (teamById(p.teamId)?.name || 'team') : 'Organisation',
        startMs: p.startMs, start: p.start, budget: p.budget, used: p.used, enforced: projectEnforced(p),
        pace: expected > 0 ? p.used / expected : 0, runsOut: runsOutDate(p), finished: projectState(p) === 'finished',
        realisation: p.budget > 0 ? p.used / p.budget : 0,
      }
    })
  const finishedCount = projectProjects.filter((p) => p.startMs < period.nowMs && projectState(p) === 'finished').length

  const columns = [
    { key: 'name', label: 'Project', sortValue: (r) => r.name, render: (r) => r.name },
    { key: 'team', label: 'Team', sortValue: (r) => r.team, render: (r) => r.team },
    { key: 'start', label: 'Start', sortValue: (r) => r.startMs, render: (r) => fmtDay(r.startMs) },
    { key: 'budget', label: 'Budget', num: true, sortValue: (r) => r.budget, render: (r) => fmt(r.budget) },
    { key: 'consumed', label: 'Consumed', num: true, sortValue: (r) => r.used, render: (r) => fmt(r.used) },
    { key: 'realisation', label: <>Realisation <InfoTip text="Consumed as a share of the project's budget. Final for a finished project; for a running one it is the share used so far, marked 'to date'." /></>, sortValue: (r) => r.realisation, render: (r) => <Realisation frac={r.realisation} finished={r.finished} /> },
    { key: 'pace', label: <>Pace <span className="th-unit">slow · fast</span></>, sortValue: (r) => r.pace, render: (r) => <PaceBar pace={r.pace} /> },
    { key: 'outlook', label: <>Budget outlook <InfoTip text="Projected from the recent job rate: when the budget would run out before the project ends, or how far it is already over." /></>, sortValue: (r) => (!r.enforced ? Infinity : r.used > r.budget ? -2 : r.runsOut ? r.runsOut : Infinity - 1), render: (r) => { if (!r.enforced) return <span className="hint" title="At this team's phase the budget is a target, not an enforced cap.">target only</span>; const over = Math.round(r.used - r.budget); if (over > 0) return <span className="tag warn">over by {fmt(over)}</span>; if (r.finished) return <span className="hint">ended, within budget</span>; return r.runsOut ? <span className="tag warn">runs out ~{fmtDay(r.runsOut)}</span> : <span className="hint">within budget</span> } },
  ]

  return (
    <section>
      <div className="card">
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span>Projects <span className="th-unit">{rows.length} {scoped && onlyMine ? 'of your projects' : 'team projects'}</span></span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            {scoped && (
              <label className="chk" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 400, fontSize: 13 }}>
                <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> Only mine
              </label>
            )}
            <label className="chk" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 400, fontSize: 13 }}>
              <input type="checkbox" checked={showFinished} onChange={(e) => setShowFinished(e.target.checked)} /> Include finished{finishedCount ? ` (${finishedCount})` : ''}
            </label>
          </span>
        </div>
        <div className="tbl-scroll">
          <DataTable
            initialSort={{ key: 'consumed', dir: 'desc' }}
            onRowClick={(r) => setSel((id) => (id === r.id ? null : r.id))}
            selectedId={sel}
            expandedId={sel}
            renderExpanded={(r) => <ProjectDetail id={r.id} onClose={() => setSel(null)} />}
            columns={columns}
            rows={rows}
          />
        </div>
      </div>
    </section>
  )
}

// full record for one project: details, leads to contact, members, recent jobs
function ProjectDetail({ id, onClose }) {
  const p = projectById(id)
  if (!p) return null
  const team = p.teamId ? teamById(p.teamId) : null
  const lead = p.leadPersonId ? personById(p.leadPersonId) : null
  const teamLead = team ? people.find((pp) => pp.role === 'lead' && (pp.teamIds || [])[0] === team.id) : null
  const members = people.filter((pp) => (pp.projectIds || []).includes(id))
  const pj = jobs.filter((j) => j.projectId === id).sort((a, b) => b.start - a.start)
  const left = Math.max(0, p.budget - p.used)
  const NOW = period.nowMs
  const runs = runsOutDate(p)
  const enforced = projectEnforced(p)
  const outlook = !enforced ? 'target only, not enforced this phase' : p.used > p.budget ? `over by ${fmt(Math.round(p.used - p.budget))} GPU-h` : runs ? `projected to run out ~${fmtDay(runs)}` : 'within budget'
  const Field = ({ label, children }) => (<div style={{ minWidth: 130 }}><div className="tile-label">{label}</div><div style={{ fontSize: 13, marginTop: 2 }}>{children}</div></div>)
  const Contact = ({ who, role }) => who ? (
    <div style={{ minWidth: 180 }}><div className="tile-label">{role}</div><div style={{ fontSize: 13, marginTop: 2 }}>{who.name} <span className="hint">· {handle(who.name)}</span></div></div>
  ) : null
  return (
    <div className="card" style={{ background: 'var(--surface-2, var(--surface))', margin: '4px 0 10px', border: '1px solid var(--accent)' }}>
      <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <span>{p.name} <span className="th-unit">{projectOwner(p)} · full record</span></span>
        <button className="btn" onClick={onClose}>Collapse</button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginBottom: 10 }}>
        <Field label="Team">{team ? team.name : 'Organisation'}</Field>
        <Field label="Priority"><PriorityInline p={p} /></Field>
        <Field label="Window">{p.start} to {p.end}</Field>
        <Field label="Budget">{fmt(p.budget)} GPU-h</Field>
        <Field label="Consumed">{fmt(p.used)} GPU-h</Field>
        <Field label="Left">{fmt(left)} GPU-h</Field>
        <Field label="Budget outlook">{enforced && (p.used > p.budget || runs) ? <span className="tag warn">{outlook}</span> : <span className="hint">{outlook}</span>}</Field>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginBottom: 10 }}>
        <Contact who={lead} role="Project lead — contact" />
        <Contact who={teamLead} role="Team lead — contact" />
        <div><div className="tile-label">Members ({members.length})</div><div style={{ fontSize: 13, marginTop: 2, maxWidth: 620 }}>{members.map((m) => m.name).join(', ') || '—'}</div></div>
      </div>
      <div className="subhead">Recent jobs <span className="th-unit">{pj.length} total</span></div>
      <div className="tbl-scroll">
        <table className="data">
          <thead><tr><th>Submitted by</th><th className="num">GPUs</th><th>Lane</th><th>Started</th><th>Ends</th><th>Status</th></tr></thead>
          <tbody>
            {pj.slice(0, 12).map((j) => (
              <tr key={j.id}>
                <td>{personById(j.personId)?.name || j.personId}</td>
                <td className="num">{fmt(j.gpus)}</td>
                <td><span className={'tag ' + (j.lane === 'fast' ? 'prio-high' : j.lane === 'bulk' ? '' : 'prio-medium')}>{j.lane}</span></td>
                <td>{fmtDateTime(j.start)}</td>
                <td>{fmtDateTime(j.end)}</td>
                <td>{j.end > NOW ? <span className="tag ok">running</span> : <span className="hint">finished</span>}</td>
              </tr>
            ))}
            {pj.length === 0 && <tr><td colSpan={6} className="hint">No jobs recorded for this project.</td></tr>}
          </tbody>
        </table>
      </div>
      {pj.length > 12 && <p className="hint">Showing the 12 most recent of {pj.length} jobs.</p>}
    </div>
  )
}

function PriorityInline({ p }) {
  const t = priorityTier(p)
  if (!t) return <span className="hint">n/a</span>
  return <span className={'tag prio-' + t}>{t}</span>
}

function Realisation({ frac, finished }) {
  const pct = Math.round((frac || 0) * 100)
  const over = pct > 100
  const title = `${pct}% of budget ${finished ? 'used (final)' : 'used so far'}`
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', width: '100%' }} title={title}>
      <span className="meter" style={{ width: 84, flex: '0 0 auto' }}>
        <span style={{ width: Math.min(100, pct) + '%', background: over ? 'var(--warning)' : 'var(--good)' }} />
      </span>
      <span className={finished ? '' : 'hint'} style={{ minWidth: 34, textAlign: 'right' }}>{pct}%</span>
      {!finished && <span className="th-unit">to date</span>}
    </span>
  )
}

function PaceBar({ pace }) {
  const p = Math.max(0.4, Math.min(2, pace || 0))
  const fast = p >= 1
  const mag = fast ? Math.min(1, (p - 1) / 1) : Math.min(1, (1 - p) / 0.6)
  const w = (mag * 50).toFixed(0)
  return (
    <span className="pacebar" title={Math.round((pace || 0) * 100) + '% of on-pace'}>
      <span className="pacebar-track">
        <span className="pacebar-center" />
        <span className={'pacebar-fill ' + (fast ? 'fast' : 'slow')} style={fast ? { left: '50%', width: w + '%' } : { right: '50%', width: w + '%' }} />
      </span>
    </span>
  )
}
