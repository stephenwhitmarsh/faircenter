import { useState } from 'react'
import {
  projectsForPerson, teamsForPerson, recentDailyRate, waitStats, queueSnapshot, runningJobsAt,
  projectById, projectState, projectEnforced, period, fmtDay, fmtDateTime, parameters,
} from '../data/mockData.js'
import { useSession, currentPerson, RoleChip } from '../session.jsx'

const DAY = 24 * 3600 * 1000
const fmt = (n) => Math.round(n).toLocaleString('en-GB')
const waited = (ms) => { const h = ms / 3600000; if (h < 1) return Math.round(ms / 60000) + ' min'; if (h < 48) return h.toFixed(1) + ' h'; return (h / 24).toFixed(1) + ' d' }
const laneTag = (l) => <span className={'tag ' + (l === 'fast' ? 'prio-high' : l === 'bulk' ? '' : 'prio-medium')}>{l}</span>
const medLabel = (m) => (m == null ? '—' : m < 60 ? Math.round(m) + ' min' : (m / 60).toFixed(1) + ' h')

export default function Me() {
  const { session } = useSession()
  const [activeOnly, setActiveOnly] = useState(true)
  const me = currentPerson(session)
  const lanesOn = parameters.toggles.lanes // priced-urgency lanes; lane info is only meaningful when on

  if (!me) {
    return (
      <section>
        <div className="card"><p className="hint" style={{ margin: 0 }}>Pick a person in the “Viewing as” selector, top right, to see their projects, jobs and waits.</p></div>
      </section>
    )
  }

  const allMyProjects = projectsForPerson(me)
  const myProjects = activeOnly ? allMyProjects.filter((p) => projectState(p) !== 'finished') : allMyProjects
  const hiddenCount = allMyProjects.length - myProjects.length
  const myTeams = teamsForPerson(me)
  const mine = waitStats(me.id)
  const all = waitStats(null)
  const q = queueSnapshot()
  const qPos = new Map(q.map((r, i) => [r.id, i + 1]))
  const myQueued = q.filter((r) => r.personId === me.id)
  const myRunning = runningJobsAt().filter((j) => j.personId === me.id)
  const myUsed = myProjects.reduce((s, p) => s + p.used, 0)
  const myRunningGpus = myRunning.reduce((s, j) => s + j.gpus, 0)

  const runOut = (p) => {
    const left = Math.max(0, p.budget - p.used)
    const rate = recentDailyRate(p)
    if (rate <= 0) return null
    const d = period.nowMs + (left / rate) * DAY
    return d <= p.endMs && d <= period.endMs ? d : null
  }
  // the actual budget state: already over, ended, on course to run out, or within
  const budgetStatus = (p) => {
    // when the project's team is at a phase that does not enforce this budget, it is a target, not a cap
    if (!projectEnforced(p)) return <span className="hint" title="At this team's phase the budget is a target to read against, not an enforced cap.">target only</span>
    const over = Math.round(p.used - p.budget)
    if (over > 0) return <span className="tag warn" title="Used more than the budget. In the proof of concept the scheduler does not enforce budgets; in production the QOS limit would stop the project's jobs at the budget.">over by {fmt(over)}</span>
    if (projectState(p) === 'finished') return <span className="hint">ended, within budget</span>
    const d = runOut(p)
    return d ? <span className="tag warn">runs out ~{fmtDay(d)}</span> : <span className="hint">within budget</span>
  }
  const laneAdvice = (() => {
    if (mine.fast != null && mine.standard != null) {
      const saved = mine.standard - mine.fast
      if (saved > 30) return `Your fast-lane jobs wait about ${medLabel(mine.fast)}, against ${medLabel(mine.standard)} on standard, so the fast lane is buying you time.`
      return `Your fast and standard jobs wait about the same right now, so the fast lane is not buying much; standard keeps more budget.`
    }
    return ''
  })()

  return (
    <section>
      <div className="tiles">
        <Tile label="Projects" value={fmt(myProjects.length)} note="you are assigned to" />
        <Tile label="Running jobs" value={fmt(myRunningGpus)} note="GPUs" />
        <Tile label="Waiting jobs" value={fmt(myQueued.length)} note="of your jobs queued" />
        <Tile label="Wait time" value={medLabel(mine.all)} note={`min ${medLabel(mine.min.all)} · max ${medLabel(mine.max.all)} · median`} />
      </div>

      <div className="card">
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span>Projects</span>
          <label className="chk" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 400, fontSize: 13 }}>
            <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} /> Active only{hiddenCount > 0 && !activeOnly ? '' : hiddenCount > 0 ? ` (${hiddenCount} finished hidden)` : ''}
          </label>
        </div>
        <div className="tbl-scroll">
          <table className="data" style={{ tableLayout: 'fixed' }}>
            <colgroup><col style={{ width: '24%' }} /><col style={{ width: '104px' }} /><col style={{ width: '86px' }} /><col style={{ width: '86px' }} /><col style={{ width: '86px' }} /><col style={{ width: '70px' }} /><col /><col style={{ width: '150px' }} /></colgroup>
            <thead><tr><th>Project</th><th>Role</th><th className="num">Budget</th><th className="num">Used</th><th className="num">Left</th><th>State</th><th>Consumption</th><th>Budget status</th></tr></thead>
            <tbody>
              {myProjects.map((p) => {
                const left = Math.max(0, p.budget - p.used); const pc = Math.min(100, (p.used / (p.budget || 1)) * 100)
                const st = projectState(p)
                return (
                  <tr key={p.id}>
                    <td>{p.funding === 'person' ? <span className="tag">personal</span> : p.name}</td>
                    <td>{p.leadPersonId === me.id ? <RoleChip role="projlead" /> : <span className="hint">member</span>}</td>
                    <td className="num">{fmt(p.budget)}</td>
                    <td className="num">{fmt(p.used)}</td>
                    <td className="num">{fmt(left)}</td>
                    <td><span className={'tag ' + (st === 'active' ? 'ok' : '')}>{st}</span></td>
                    <td><div className="meter" title={`${Math.round(pc)}%`}><span style={{ width: pc + '%', background: p.used > p.budget ? 'var(--warn, #e6a53a)' : undefined }} /></div></td>
                    <td>{budgetStatus(p)}</td>
                  </tr>
                )
              })}
              {myProjects.length === 0 && <tr><td colSpan={8} className="hint">—</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Jobs</div>
        {myRunning.length === 0 && myQueued.length === 0 ? <p className="hint">—</p> : (
          <div className="tbl-scroll">
            <table className="data">
              <thead><tr><th>Project</th><th>Status</th><th className="num">GPUs</th>{lanesOn && <th>Lane</th>}<th className="num">Waited</th><th>Ends</th></tr></thead>
              <tbody>
                {myRunning.map((j) => (
                  <tr key={j.id}>
                    <td>{projectById(j.projectId)?.name || j.projectId}</td>
                    <td><span className="tag ok">running</span></td>
                    <td className="num">{fmt(j.gpus)}</td>
                    {lanesOn && <td>{laneTag(j.lane)}</td>}
                    <td className="num">—</td>
                    <td>{fmtDateTime(j.end)}</td>
                  </tr>
                ))}
                {myQueued.map((r) => (
                  <tr key={r.id}>
                    <td>{projectById(r.projectId)?.name || r.projectId}</td>
                    <td><span className="tag">queued · #{qPos.get(r.id)} in line</span></td>
                    <td className="num">{fmt(r.gpus)}</td>
                    {lanesOn && <td>{laneTag(r.lane)}</td>}
                    <td className="num">{waited(r.waited)}</td>
                    <td className="hint">—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {lanesOn && (<>
          <div className="subhead" style={{ marginTop: 12 }}>Wait time per lane</div>
          <div className="tbl-scroll">
            <table className="data">
              <thead><tr><th>Lane</th><th className="num">Min</th><th className="num">Max</th><th className="num">Median</th><th className="num">Cluster median</th><th className="num">My jobs</th></tr></thead>
              <tbody>
                {['fast', 'standard', 'bulk'].map((l) => (
                  <tr key={l}><td>{laneTag(l)}</td><td className="num">{medLabel(mine.min[l])}</td><td className="num">{medLabel(mine.max[l])}</td><td className="num">{medLabel(mine[l])}</td><td className="num">{medLabel(all[l])}</td><td className="num">{mine.counts[l]}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {laneAdvice && <p className="hint">{laneAdvice}</p>}
        </>)}
      </div>
    </section>
  )
}

function Tile({ label, value, note }) {
  return (<div className="tile"><div className="tile-label">{label}</div><div className="tile-value">{value}</div>{note && <div className="tile-note">{note}</div>}</div>)
}
