import {
  projects, reservations, parameters, period, effectiveGpus, runningAt, activeProjects,
  projRate, queueSnapshot, requests as changeRequests, poolRealisation,
} from '../data/mockData.js'
import { useSession } from '../session.jsx'

const DAY = 24 * 3600 * 1000
const fmt = (n) => Math.round(n).toLocaleString('en-GB')
const medLabel = (m) => (m == null ? '—' : m < 60 ? Math.round(m) + ' min' : m < 60 * 48 ? (m / 60).toFixed(1) + ' h' : (m / 1440).toFixed(1) + ' d')

export default function Overview({ onNav }) {
  useSession()

  const capNow = effectiveGpus(period.nowMs)
  const inUse = runningAt(projects.map((p) => p.id), period.nowMs)
  const util = Math.round((inUse / capNow) * 100)
  const active = activeProjects()
  const q = queueSnapshot()
  const longWaits = q.filter((r) => r.waited > DAY).length
  // median time already waited by jobs still in the queue: the live congestion, not the
  // all-jobs median (which is ~0 because most jobs over the ramp started immediately)
  const qw = q.map((r) => r.waited).sort((a, b) => a - b)
  const qMedMin = qw.length ? qw[Math.floor(qw.length / 2)] / 60000 : 0
  const pending = changeRequests.filter((r) => r.status === 'pending')
  const activeTeam = active.filter((p) => p.funding !== 'person')
  const realis = poolRealisation()
  const pctLabel = (v) => (v == null ? '—' : Math.round(v * 100) + '%')

  const daysToEnd = (p) => Math.max(0, (Math.min(p.endMs, period.endMs) - period.nowMs) / DAY)
  const overrun = (p) => Math.round(p.used + projRate(p, 'recent') * daysToEnd(p) - p.budget)
  const over = active.filter((p) => p.funding !== 'person' && overrun(p) > 0).map((p) => ({ p, o: overrun(p) })).sort((a, b) => b.o - a.o)
  const upcomingResv = reservations.filter((r) => r.endMs >= period.nowMs && r.startMs <= period.nowMs + 30 * DAY)

  const items = []
  if (over.length) items.push({ level: 'warn', tab: 'review', text: `${over.length} project${over.length === 1 ? '' : 's'} forecast to exceed budget before their end`, detail: over.slice(0, 3).map((x) => `${x.p.name} (+${fmt(x.o)} GPU-h)`).join(', ') })
  if (longWaits) items.push({ level: 'warn', tab: 'queue', text: `${longWaits} job${longWaits === 1 ? '' : 's'} have waited over 24 hours`, detail: 'The cluster is oversubscribed at the busy hours.' })
  if (pending.length) items.push({ level: 'info', tab: 'requests', text: `${pending.length} request${pending.length === 1 ? '' : 's'} awaiting approval`, detail: pending.slice(0, 3).map((r) => r.subject).join('; ') })
  if (util >= 90) items.push({ level: 'warn', tab: 'consumption', text: `Cluster is running at ${util}% of capacity`, detail: `${fmt(capNow - inUse)} GPUs free right now.` })
  if (upcomingResv.length) items.push({ level: 'info', tab: 'consumption', text: `${upcomingResv.length} reservation${upcomingResv.length === 1 ? '' : 's'} in the next 30 days`, detail: `${fmt(upcomingResv.reduce((s, r) => s + r.gpus, 0))} GPUs held across them.` })

  return (
    <section>
      <div className="tiles">
        <Tile label="Utilisation now" value={util + '%'} note={`${fmt(inUse)} of ${fmt(capNow)} GPUs`} onClick={() => onNav && onNav('consumption')} />
        <Tile label="In queue" value={fmt(q.length)} note={`${fmt(q.reduce((s, r) => s + r.gpus, 0))} GPUs waiting`} onClick={() => onNav && onNav('queue')} />
        <Tile label="Queue wait" value={q.length ? medLabel(qMedMin) : '—'} note="median, jobs waiting now" onClick={() => onNav && onNav('queue')} />
        <Tile label="Project budget realisation" value={pctLabel(realis.project)} note="used vs allocated, to date" onClick={() => onNav && onNav('review')} />
        <Tile label="Person budget realisation" value={pctLabel(realis.person)} note="used vs allocated, to date" onClick={() => onNav && onNav('budgets')} />
        <Tile label="Active projects" value={fmt(activeTeam.length)} note="team projects running now" onClick={() => onNav && onNav('review')} />
      </div>

      <div className="card">
        <div className="card-title">Needs attention <span className="th-unit">{items.length} item{items.length === 1 ? '' : 's'}</span></div>
        {items.length === 0 ? <p className="hint">Nothing needs a decision right now.</p> : (
          <ul className="attn">
            {items.map((it, i) => (
              <li key={i} className={'attn-row attn-' + it.level} onClick={() => onNav && onNav(it.tab)}>
                <span className={'attn-dot attn-' + it.level} />
                <span className="attn-text"><b>{it.text}</b>{it.detail && <span className="hint"> — {it.detail}</span>}</span>
                <span className="attn-go">›</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function Tile({ label, value, note, onClick }) {
  return (
    <div className={'tile' + (onClick ? ' tile-click' : '')} onClick={onClick}>
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
      {note && <div className="tile-note">{note}</div>}
    </div>
  )
}
