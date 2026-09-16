import { useState } from 'react'
import { queueForecast, runningJobsAt, projectById, personById, teamById, priorityTier, period, effectiveGpus, fmtDateTime, parameters } from '../data/mockData.js'
import { useSession, currentPerson } from '../session.jsx'
import DataTable from '../components/DataTable.jsx'
import InfoTip from '../components/InfoTip.jsx'

const fmt = (n) => Math.round(n).toLocaleString('en-GB')
const TIER_RANK = { high: 3, medium: 2, low: 1 }
const LANE = { fast: 'fast', standard: 'standard', bulk: 'bulk' }
const laneTag = (l) => <span className={'tag ' + (l === 'fast' ? 'prio-high' : l === 'bulk' ? '' : 'prio-medium')}>{LANE[l] || l}</span>
const tierTag = (p) => { const t = priorityTier(p); return t ? <span className={'tag prio-' + t}>{t}</span> : <span className="tag">personal</span> }
const waited = (ms) => { const h = ms / 3600000; if (h < 1) return Math.round(ms / 60000) + ' min'; if (h < 48) return h.toFixed(1) + ' h'; return (h / 24).toFixed(1) + ' d' }
const etaLabel = (eta) => { if (eta == null) return 'beyond range'; const d = (eta - period.nowMs) / 3600000; if (d < 0.05) return 'imminent'; if (d < 48) return 'in ' + d.toFixed(1) + ' h'; return 'in ' + (d / 24).toFixed(1) + ' d' }
const teamOf = (p) => (p && p.teamId ? teamById(p.teamId)?.name : (p && p.funding === 'person' ? 'personal' : 'org'))

export default function Queue() {
  const { session } = useSession()
  const me = currentPerson(session)
  const [mineOnly, setMineOnly] = useState(false)
  const [showRunning, setShowRunning] = useState(false)

  const q = queueForecast()
  const running = runningJobsAt()
  const teamStandingOn = parameters.toggles.teamStanding // between-team ordering, on in the last roll-out phase
  const capNow = effectiveGpus(period.nowMs)
  const inUse = running.reduce((s, j) => s + j.gpus, 0)
  const queuedGpus = q.reduce((s, j) => s + j.gpus, 0)
  const maxWait = q.reduce((m, j) => Math.max(m, j.waited), 0)

  const mine = (personId) => !mineOnly || (me && personId === me.id)
  const shown = q.map((r, i) => ({ ...r, pos: i + 1 })).filter((r) => mine(r.personId))
  const runShown = running.filter((j) => mine(j.personId))

  return (
    <section>
      <div className="tiles">
        <Tile label="Waiting" value={fmt(q.length)} note="jobs in the queue" />
        <Tile label="Queued demand" value={fmt(queuedGpus)} note="GPUs requested and waiting" />
        <Tile label="Longest wait" value={waited(maxWait)} note="of any queued job" />
      </div>

      <div className="controls">
        <label className="chk" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={mineOnly} disabled={!me} onChange={(e) => setMineOnly(e.target.checked)} /> Only my jobs
        </label>
        {!me && <span className="hint">Sign in as a team member (top right) to pick out your own jobs.</span>}
        <label className="chk" style={{ marginLeft: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={showRunning} onChange={(e) => setShowRunning(e.target.checked)} /> Show running jobs
        </label>
      </div>

      <div className="card">
        <div className="card-title">Waiting <span className="th-unit">{shown.length} shown</span></div>
        <div className="tbl-scroll">
          <DataTable
            initialSort={{ key: 'pos', dir: 'asc' }}
            rowClassName={(r) => (me && r.personId === me.id ? 'row-sel' : '')}
            columns={[
              { key: 'pos', label: '#', num: true, sortValue: (r) => r.pos, render: (r) => r.pos },
              { key: 'project', label: 'Project', sortValue: (r) => projectById(r.projectId)?.name || '', render: (r) => projectById(r.projectId)?.name || r.projectId },
              { key: 'team', label: 'Team', sortValue: (r) => teamOf(projectById(r.projectId)) || '', render: (r) => teamOf(projectById(r.projectId)) },
              { key: 'person', label: 'Person', sortValue: (r) => personById(r.personId)?.name || '', render: (r) => personById(r.personId)?.name || '—' },
              { key: 'gpus', label: 'GPUs', num: true, sortValue: (r) => r.gpus, render: (r) => fmt(r.gpus) },
              { key: 'lane', label: 'Lane', sortValue: (r) => ({ fast: 3, standard: 2, bulk: 1 }[r.lane] || 0), render: (r) => laneTag(r.lane) },
              { key: 'prio', label: <>Priority <span className="th-unit">in team</span> <InfoTip text="The project's priority tier, a tie-break within its own team." /></>, sortValue: (r) => TIER_RANK[priorityTier(projectById(r.projectId))] || 0, render: (r) => { const p = projectById(r.projectId); return p ? tierTag(p) : null } },
              { key: 'teamstd', label: <>Team standing <InfoTip text="A team's standing in the queue: higher standing lifts its jobs when the cluster is busy." /></>, sortValue: (r) => { const p = projectById(r.projectId); const t = p && p.teamId ? teamById(p.teamId) : null; return teamStandingOn && t ? t.standing : -1 }, render: (r) => { if (!teamStandingOn) return <span className="hint">n/a</span>; const p = projectById(r.projectId); const t = p && p.teamId ? teamById(p.teamId) : null; return t ? <span className="tag">{t.standing}</span> : <span className="hint">n/a</span> } },
              { key: 'waited', label: 'Waited', num: true, sortValue: (r) => r.waited, render: (r) => waited(r.waited) },
              { key: 'eta', label: 'Est. start', num: true, sortValue: (r) => (r.eta == null ? Infinity : r.eta), render: (r) => <span title={r.eta ? fmtDateTime(r.eta) : ''} className={r.eta == null ? 'hint' : ''}>{etaLabel(r.eta)}</span> },
            ]}
            rows={shown}
          />
        </div>
      </div>

      {showRunning && (
        <div className="card">
          <div className="card-title">Running now <span className="th-unit">{runShown.length} job{runShown.length === 1 ? '' : 's'}{mineOnly ? ' of yours' : ''} · {fmt(runShown.reduce((s, j) => s + j.gpus, 0))} GPUs</span></div>
          <div className="tbl-scroll">
            <DataTable
              initialSort={{ key: 'gpus', dir: 'desc' }}
              rowClassName={(j) => (me && j.personId === me.id ? 'row-sel' : '')}
              columns={[
                { key: 'project', label: 'Project', sortValue: (j) => projectById(j.projectId)?.name || '', render: (j) => projectById(j.projectId)?.name || j.projectId },
                { key: 'team', label: 'Team', sortValue: (j) => teamOf(projectById(j.projectId)) || '', render: (j) => teamOf(projectById(j.projectId)) },
                { key: 'person', label: 'Person', sortValue: (j) => personById(j.personId)?.name || '', render: (j) => personById(j.personId)?.name || '—' },
                { key: 'gpus', label: 'GPUs', num: true, sortValue: (j) => j.gpus, render: (j) => fmt(j.gpus) },
                { key: 'lane', label: 'Lane', sortValue: (j) => j.lane, render: (j) => laneTag(j.lane) },
                { key: 'ends', label: 'Ends', sortValue: (j) => j.end, render: (j) => fmtDateTime(j.end) },
              ]}
              rows={runShown.map((j) => ({ ...j, id: j.id }))}
            />
          </div>
        </div>
      )}
    </section>
  )
}

function Tile({ label, value, note }) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
      <div className="tile-note">{note}</div>
    </div>
  )
}
