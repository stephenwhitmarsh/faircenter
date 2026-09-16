import { useState, useMemo, useEffect, Fragment } from 'react'
import { requests as seedRequests, projects, teams, teamById, teamsForPerson, projectState, fmtDay, effectiveGpus, resourceOutlook } from '../data/mockData.js'
import { useSession, currentPerson, RoleChip } from '../session.jsx'

const TYPES = [
  { key: 'new project', label: 'New project' },
  { key: 'budget change', label: 'Budget change' },
  { key: 'priority change', label: 'Priority change' },
  { key: 'extension', label: 'Extension' },
  { key: 'reservation', label: 'Reservation' },
]
const DAY = 24 * 3600 * 1000
const fmt = (n) => Number(n || 0).toLocaleString('en-GB')
const projName = (id) => projects.find((p) => p.id === id)?.name ?? id
const parseMs = (s) => { const t = Date.parse(s); return isNaN(t) ? null : t }

function routeFor(type, ctx) {
  if (type === 'priority change') return 'Direction'
  if (type === 'new project' || type === 'reservation') return 'Operations'
  if (type === 'budget change' && ctx.scope === 'team') return 'Operations'
  const p = projects.find((pp) => pp.id === ctx.projectId)
  const t = p && p.teamId ? teamById(p.teamId) : null
  return t ? `${t.name} lead` : 'Operations'
}

const fmtN = (n) => Number(Math.round(n) || 0).toLocaleString('en-GB')
// GPUs a reservation request holds (numeric field, else parsed from its amount string)
function resvGpus(r) { if (r.type !== 'reservation') return 0; if (typeof r.gpus === 'number') return r.gpus; const m = String(r.amount || '').match(/(\d[\d,]*)/); return m ? Number(m[1].replace(/,/g, '')) : 0 }

// horizontal timeline of the requests that occupy a window, so an approver can see when
// resources are being asked for and whether windows overlap. Reservation requests also drive
// a concurrent-GPUs-vs-capacity strip, so an approver can see whether they fit.
function RequestsTimeline({ list, selId, onSelect }) {
  const dated = list.filter((r) => r.startMs && r.endMs && r.endMs > r.startMs)
  if (!dated.length) return <p className="hint">No requests with a start and end date yet.</p>
  const t0 = Math.min(...dated.map((r) => r.startMs))
  const t1 = Math.max(...dated.map((r) => r.endMs))
  const span = (t1 - t0) || 1
  const pc = (t) => ((t - t0) / span) * 100
  // month gridlines
  const ticks = []
  const d = new Date(t0); d.setUTCDate(1); d.setUTCHours(0, 0, 0, 0)
  for (let ms = d.getTime(); ms <= t1; ) { if (ms >= t0) ticks.push(ms); const n = new Date(ms); n.setUTCMonth(n.getUTCMonth() + 1); ms = n.getTime() }
  const colour = (s) => (s === 'approved' ? 'var(--good)' : s === 'declined' ? 'var(--warning)' : 'var(--accent)')
  const order = [...dated].sort((a, b) => a.startMs - b.startMs)

  // Projected demand vs capacity: the forecast baseline load (with its low–high band, from the
  // Analytics resource outlook) plus the load these requests would add if granted, against capacity.
  const HOUR = 3600 * 1000
  const parseNum = (s) => { const m = String(s || '').match(/(\d[\d,]*)/); return m ? Number(m[1].replace(/,/g, '')) : 0 }
  const baseRows = resourceOutlook('month').rows
  const baselineAt = (t) => {
    let r = baseRows[0]
    for (const x of baseRows) { if (x.t0 <= t) r = x; else break }
    if (!r) return { mid: 0, lo: 0, hi: 0 }
    const mid = r.useFc != null ? r.useFc : (r.use || 0)
    return { mid, lo: r.useLo != null ? r.useLo : mid, hi: r.useHi != null ? r.useHi : mid }
  }
  // concurrent GPUs a request would add while active: reservations exact; project/extension
  // budgets spread evenly over their window as an average draw
  const addAt = (r, t) => {
    if (r.startMs == null || r.endMs == null || t < r.startMs || t >= r.endMs) return 0
    if (r.type === 'reservation') return resvGpus(r)
    if (r.type === 'new project') { const gpuh = r.gpuh != null ? r.gpuh : parseNum(r.amount); const h = (r.endMs - r.startMs) / HOUR; return h > 0 ? gpuh / h : 0 }
    if (r.type === 'extension') { const p = projects.find((pp) => pp.id === r.projectId); if (!p) return 0; const h = (p.endMs - p.startMs) / HOUR; return h > 0 ? p.budget / h : 0 }
    return 0
  }
  const active = dated.filter((r) => r.status !== 'declined' && addAt(r, (r.startMs + r.endMs) / 2) > 0)
  const monthly = []
  { const d0 = new Date(t0); d0.setUTCDate(1); d0.setUTCHours(0, 0, 0, 0); for (let ms = d0.getTime(); ms <= t1;) { if (ms > t0) monthly.push(ms); const n = new Date(ms); n.setUTCMonth(n.getUTCMonth() + 1); ms = n.getTime() } }
  const bounds = [...new Set([t0, t1, ...monthly, ...active.flatMap((r) => [r.startMs, r.endMs])])].filter((x) => x >= t0 && x <= t1).sort((a, b) => a - b)
  const segs = []
  for (let i = 0; i < bounds.length - 1; i++) {
    const a = bounds[i], b = bounds[i + 1], mid = (a + b) / 2
    const base = baselineAt(mid)
    const add = active.reduce((s, r) => s + addAt(r, mid), 0)
    segs.push({ a, b, base: base.mid, baseLo: base.lo, baseHi: base.hi, add, proj: base.mid + add, projLo: base.lo + add, projHi: base.hi + add, cap: effectiveGpus(mid) })
  }
  const capMax = Math.max(...segs.map((s) => s.cap), 1)
  // frame the region of interest (lowest line to highest, padded) so the lines fill the height
  const loV = segs.length ? Math.min(...segs.map((s) => Math.min(s.baseLo, s.projLo, s.cap))) : 0
  const hiV = segs.length ? Math.max(...segs.map((s) => Math.max(s.projHi, s.cap))) : 1
  const padV = Math.max(1, (hiV - loV) * 0.18)
  const yMin = Math.max(0, loV - padV), yMax = hiV + padV
  const H = 150
  const yG = (v) => H - ((v - yMin) / ((yMax - yMin) || 1)) * H
  const step = (get) => { let d = ''; segs.forEach((s, i) => { const x0 = pc(s.a), x1 = pc(s.b), y = yG(get(s)); d += (i === 0 ? `M ${x0} ${y}` : ` L ${x0} ${y}`) + ` L ${x1} ${y}` }); return d }
  const bandPath = (() => { if (!segs.length) return ''; let d = ''; segs.forEach((s, i) => { const y = yG(s.projHi); d += (i === 0 ? `M ${pc(s.a)} ${y}` : ` L ${pc(s.a)} ${y}`) + ` L ${pc(s.b)} ${y}` }); for (let i = segs.length - 1; i >= 0; i--) { const s = segs[i], y = yG(s.projLo); d += ` L ${pc(s.b)} ${y} L ${pc(s.a)} ${y}` } return d + ' Z' })()
  const projPath = step((s) => s.proj), basePath = step((s) => s.base), capPath = step((s) => s.cap)
  const overSegs = segs.filter((s) => s.proj > s.cap)
  const hasReq = active.length > 0

  return (
    <div>
      <div style={{ position: 'relative', height: 18, marginBottom: 2 }}>
        {ticks.map((ms) => (
          <span key={ms} style={{ position: 'absolute', left: pc(ms) + '%', fontSize: 10, color: 'var(--ink-2)', transform: 'translateX(-50%)' }}>{new Date(ms).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}</span>
        ))}
      </div>
      {hasReq && (
        <div style={{ position: 'relative', marginBottom: 6 }}>
          <svg width="100%" height={H} viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
            {ticks.map((ms) => (<line key={'sg' + ms} x1={pc(ms)} x2={pc(ms)} y1="0" y2={H} stroke="var(--grid)" strokeWidth="1" vectorEffect="non-scaling-stroke" />))}
            {bandPath && <path d={bandPath} fill="#eb6834" fillOpacity="0.13" />}
            {overSegs.map((s, i) => <rect key={'o' + i} x={pc(s.a)} width={Math.max(0.3, pc(s.b) - pc(s.a))} y={yG(s.proj)} height={Math.max(0, yG(s.cap) - yG(s.proj))} fill="var(--critical)" fillOpacity="0.5" />)}
            <path d={capPath} stroke="var(--ink)" strokeWidth="1.25" strokeDasharray="5 3" fill="none" vectorEffect="non-scaling-stroke" />
            <path d={basePath} stroke="var(--ink-2)" strokeOpacity="0.5" strokeWidth="1.25" fill="none" vectorEffect="non-scaling-stroke" />
            <path d={projPath} stroke="#eb6834" strokeWidth="2" fill="none" vectorEffect="non-scaling-stroke" />
          </svg>
          <span style={{ position: 'absolute', right: 4, top: Math.max(0, yG(capMax) - 14), fontSize: 10, color: 'var(--ink-2)' }}>capacity {fmtN(capMax)}</span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, position: 'relative' }}>
        {ticks.map((ms) => (<span key={'g' + ms} style={{ position: 'absolute', top: 0, bottom: 0, left: pc(ms) + '%', width: 1, background: 'var(--grid)' }} />))}
        {order.map((r) => {
          const on = selId === r.id
          const lbl = r.type === 'extension' ? 'extension' : `${r.type}${r.amount ? ' · ' + r.amount : ''}`
          return (
            <div key={r.id} style={{ position: 'relative', height: 22 }}>
              <div title={`${r.type} — ${r.subject} · ${fmtDay(r.startMs)} to ${fmtDay(r.endMs)}`} onClick={() => onSelect && onSelect(r.id)}
                style={{ position: 'absolute', left: pc(r.startMs) + '%', width: Math.max(1.5, pc(r.endMs) - pc(r.startMs)) + '%', top: 2, height: 18, background: colour(r.status), opacity: on ? 1 : r.status === 'pending' ? 0.85 : 0.55, borderRadius: 4, border: (on ? '2px solid var(--ink)' : '1px solid ' + colour(r.status)), boxShadow: on ? '0 0 0 2px color-mix(in srgb, var(--ink) 25%, transparent)' : 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: 10, color: '#fff', padding: '0 5px', textShadow: '0 1px 1px rgba(0,0,0,.4)' }}>{lbl}</span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="evt-legend" style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 8, fontSize: 12, color: 'var(--ink-2)' }}>
        {hasReq && <><span><i style={{ display: 'inline-block', width: 12, height: 3, background: '#eb6834', verticalAlign: 'middle', marginRight: 5 }} />projected demand</span>
        <span><i style={{ display: 'inline-block', width: 12, height: 8, background: '#eb6834', opacity: 0.25, verticalAlign: 'middle', marginRight: 5 }} />forecast range</span>
        <span><i style={{ display: 'inline-block', width: 12, height: 3, background: 'var(--ink-2)', opacity: 0.5, verticalAlign: 'middle', marginRight: 5 }} />baseline forecast</span>
        <span><i style={{ display: 'inline-block', width: 12, height: 0, borderTop: '2px dashed var(--ink)', verticalAlign: 'middle', marginRight: 5 }} />capacity</span>
        <span style={{ opacity: 0.4 }}>|</span></>}
        <span><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--accent)', marginRight: 5, verticalAlign: 'middle' }} />pending</span>
        <span><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--good)', marginRight: 5, verticalAlign: 'middle' }} />approved</span>
        <span><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--warning)', marginRight: 5, verticalAlign: 'middle' }} />declined</span>
      </div>
    </div>
  )
}

export default function Requests() {
  const { session, can } = useSession()
  const me = currentPerson(session)
  const [list, setList] = useState(seedRequests)
  const [type, setType] = useState('new project')
  const [f, setF] = useState({ name: '', teamId: teams[0].id, budget: 20000, priority: 'medium', projectId: projects[0].id, scope: 'project', bTeamId: teams[0].id, delta: 10000, tier: 'high', start: '2026-10-01', end: '2026-12-31', gpus: 32, resStart: '2026-10-01', resEnd: '2026-10-03', note: '' })
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const [dec, setDec] = useState(null) // { id, choice, comment } while an approver is deciding
  const [selId, setSelId] = useState(null) // request highlighted from the timeline

  // the request board is scoped to the people involved: the requester, ops, and any approver a
  // request routes to. Nothing is a shared public board.
  const visibleList = useMemo(() => {
    if (session.role === 'ops') return list
    return list.filter((r) => (me && r.requestedBy === me.name) || can('approve', r))
  }, [list, session.role, me]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selId) return
    const el = document.querySelector(`[data-req="${selId}"]`)
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [selId])

  const myProjects = useMemo(() => {
    if (!me) return []
    const open = projects.filter((p) => projectState(p) !== 'finished')
    if (session.role === 'ops') return open
    if (session.role === 'projlead') return open.filter((p) => p.leadPersonId === me.id)
    const mine = new Set(me.projectIds || [])
    return open.filter((p) => mine.has(p.id) || (session.role === 'lead' && p.teamId && p.teamId === session.teamId))
  }, [me, session.role, session.teamId])
  const myTeams = useMemo(() => {
    if (!me) return []
    if (session.role === 'ops') return teams
    if (session.role === 'projlead') return []
    return teamsForPerson(me)
  }, [me, session.role])

  useEffect(() => {
    setF((s) => ({
      ...s,
      projectId: myProjects.some((p) => p.id === s.projectId) ? s.projectId : (myProjects[0]?.id ?? ''),
      teamId: myTeams.some((t) => t.id === s.teamId) ? s.teamId : (myTeams[0]?.id ?? ''),
      bTeamId: myTeams.some((t) => t.id === s.bTeamId) ? s.bTeamId : (myTeams[0]?.id ?? ''),
    }))
  }, [myProjects, myTeams])

  const needsProject = type === 'priority change' || type === 'extension' || type === 'reservation' || (type === 'budget change' && f.scope === 'project')
  const needsTeam = type === 'new project' || (type === 'budget change' && f.scope === 'team')
  const canSubmitAny = can('submitRequest') // may raise some request type (not necessarily the current one)
  const canSubmit = canSubmitAny && (!needsProject || myProjects.length > 0) && (!needsTeam || myTeams.length > 0)
  const noteLabel = type === 'new project' ? 'Description' : 'Justification'

  function build() {
    if (type === 'new project') return { subject: `${f.name || 'Untitled'} — new project on ${teamById(f.teamId)?.name}, ${fmt(f.budget)} GPU-h, ${f.priority} priority`, warning: Number(f.budget) > 200000 ? 'Large allocation; would need capacity review.' : null, startMs: parseMs(f.start), endMs: parseMs(f.end), amount: `${fmt(f.budget)} GPU-h` }
    if (type === 'budget change') {
      const sign = Number(f.delta) >= 0 ? '+' : ''
      if (f.scope === 'team') return { subject: `${teamById(f.bTeamId)?.name} team pool ${sign}${fmt(f.delta)} GPU-h`, warning: Number(f.delta) > 120000 ? 'Large pool change; would need a capacity review.' : null, scope: 'team', teamId: f.bTeamId }
      return { subject: `${projName(f.projectId)} ${sign}${fmt(f.delta)} GPU-h`, warning: Number(f.delta) > 40000 ? 'Would take the team budget past its limit.' : null, scope: 'project', projectId: f.projectId }
    }
    if (type === 'priority change') return { subject: `Raise ${projName(f.projectId)} to ${f.tier}`, warning: null, projectId: f.projectId }
    if (type === 'extension') { const p = projects.find((pp) => pp.id === f.projectId); return { subject: `Extend ${projName(f.projectId)} to ${f.end}`, warning: null, projectId: f.projectId, startMs: p?.endMs ?? null, endMs: parseMs(f.end), amount: 'extend' } }
    return { subject: `Reserve ${f.gpus} GPUs for ${projName(f.projectId)}, ${f.resStart} to ${f.resEnd}`, warning: Number(f.gpus) >= 256 ? 'Large reservation; check against free capacity.' : null, projectId: f.projectId, startMs: parseMs(f.resStart), endMs: parseMs(f.resEnd), amount: `${f.gpus} GPU` }
  }

  function submit(e) {
    e.preventDefault()
    const b = build()
    const req = { id: 'req-' + Date.now(), type, subject: b.subject, note: f.note.trim(), requestedBy: me?.name || 'You', routedTo: routeFor(type, b), status: 'pending', warning: b.warning, startMs: b.startMs || null, endMs: b.endMs || null, amount: b.amount || null, gpus: type === 'reservation' ? Number(f.gpus) || 0 : undefined, gpuh: type === 'new project' ? Number(f.budget) || 0 : undefined }
    setList((l) => [req, ...l])
    setF((s) => ({ ...s, note: '' }))
  }

  const applyDecision = () => {
    if (!dec) return
    if (dec.choice === 'declined' && !dec.comment.trim()) return
    setList((l) => l.map((r) => (r.id === dec.id ? { ...r, status: dec.choice, decisionComment: dec.comment.trim(), decidedBy: me?.name || 'approver' } : r)))
    setDec(null)
  }
  const retract = (id) => setList((l) => l.map((r) => (r.id === id ? { ...r, status: 'pending', decisionComment: undefined, decidedBy: undefined } : r)))
  const pendingCount = visibleList.filter((r) => r.status === 'pending').length

  return (
    <section>
      <div className="card">
        <div className="card-title">Raise a request {me
          ? <><RoleChip role={session.role} /> <span className="hint" style={{ fontWeight: 400 }}>{canSubmit ? `as ${me.name}` : 'pick a request type you can raise'}</span></>
          : <span className="perm-note">sign in to submit</span>}</div>
        <form className="reqform" onSubmit={submit}>
          <div className="reqrow">
            <label>Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)} disabled={!canSubmitAny}>
              {TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>

          {type === 'new project' && (<>
            <div className="reqrow"><label>Name</label><input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Project name" disabled={!canSubmit} /></div>
            <div className="reqrow"><label>Team</label><select value={f.teamId} onChange={(e) => set('teamId', e.target.value)} disabled={!canSubmit}>{myTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
            <div className="reqrow"><label>Budget</label><span className="numin"><input type="number" step="1000" value={f.budget} onChange={(e) => set('budget', e.target.value)} style={{ width: 120 }} disabled={!canSubmit} /><span className="numin-suffix">GPU-h</span></span></div>
            <div className="reqrow"><label>Priority</label><select value={f.priority} onChange={(e) => set('priority', e.target.value)} disabled={!canSubmit}><option>high</option><option>medium</option><option>low</option></select></div>
            <div className="reqrow"><label>Window</label><input type="date" value={f.start} onChange={(e) => set('start', e.target.value)} disabled={!canSubmit} /><span className="hint">to</span><input type="date" value={f.end} onChange={(e) => set('end', e.target.value)} disabled={!canSubmit} /></div>
          </>)}

          {type === 'budget change' && (
            <div className="reqrow"><label>For</label>
              <div className="seg">
                <button type="button" className={f.scope === 'project' ? 'active' : ''} onClick={() => set('scope', 'project')} disabled={!canSubmit}>A project</button>
                <button type="button" className={f.scope === 'team' ? 'active' : ''} onClick={() => set('scope', 'team')} disabled={!canSubmit}>A team pool</button>
              </div>
            </div>
          )}
          {type === 'budget change' && f.scope === 'team' && (
            <div className="reqrow"><label>Team</label><select value={f.bTeamId} onChange={(e) => set('bTeamId', e.target.value)} disabled={!canSubmit} style={{ minWidth: 220 }}>{myTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
          )}
          {((type === 'budget change' && f.scope === 'project') || type === 'priority change' || type === 'extension' || type === 'reservation') && (
            <div className="reqrow"><label>Project</label><select value={f.projectId} onChange={(e) => set('projectId', e.target.value)} disabled={!canSubmit} style={{ minWidth: 220 }}>{myProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          )}
          {type === 'budget change' && (
            <div className="reqrow"><label>Change</label><span className="numin"><input type="number" step="1000" value={f.delta} onChange={(e) => set('delta', e.target.value)} style={{ width: 120 }} disabled={!canSubmit} /><span className="numin-suffix">GPU-h (±)</span></span></div>
          )}
          {type === 'priority change' && (
            <div className="reqrow"><label>New priority</label><select value={f.tier} onChange={(e) => set('tier', e.target.value)} disabled={!canSubmit}><option>high</option><option>medium</option><option>low</option></select></div>
          )}
          {type === 'extension' && (
            <div className="reqrow"><label>New end</label><input type="date" value={f.end} onChange={(e) => set('end', e.target.value)} disabled={!canSubmit} /></div>
          )}
          {type === 'reservation' && (<>
            <div className="reqrow"><label>GPUs</label><span className="numin"><input type="number" step="8" value={f.gpus} onChange={(e) => set('gpus', e.target.value)} style={{ width: 90 }} disabled={!canSubmit} /></span></div>
            <div className="reqrow"><label>Window</label><input type="date" value={f.resStart} onChange={(e) => set('resStart', e.target.value)} disabled={!canSubmit} /><span className="hint">to</span><input type="date" value={f.resEnd} onChange={(e) => set('resEnd', e.target.value)} disabled={!canSubmit} /></div>
          </>)}

          <div className="reqrow" style={{ alignItems: 'flex-start' }}>
            <label style={{ paddingTop: 6 }}>{noteLabel}</label>
            <textarea value={f.note} onChange={(e) => set('note', e.target.value)} disabled={!canSubmit} rows={3}
              placeholder={type === 'new project' ? 'What the project is, what it needs the GPUs for, rough timeline.' : 'Why this change is needed — the reason an approver would want.'}
              style={{ flex: 1, minWidth: 280, resize: 'vertical', background: 'var(--bg)', color: 'var(--ink)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', font: 'inherit' }} />
          </div>
          <div className="reqrow">
            <span className="hint">Routes to <b>{routeFor(type, build())}</b>.{build().warning && <> <span className="tag warn">warning</span> {build().warning}</>}</span>
          </div>
          <div className="reqrow"><button className="btn primary" type="submit" disabled={!canSubmit || !f.note.trim()}>Submit request</button>{canSubmit && !f.note.trim() && <span className="hint">A description is required.</span>}</div>
        </form>
      </div>

      <div className="card">
        <div className="card-title">Requested windows</div>
        <RequestsTimeline list={visibleList} selId={selId} onSelect={(id) => setSelId((s) => (s === id ? null : id))} />
      </div>

      <div className="card">
        <div className="card-title">Open and recent requests <span className="th-unit">{pendingCount} pending</span></div>
        <table className="data">
          <thead>
            <tr><th>Request</th><th>Type</th><th>Window</th><th>Requested by</th><th>Routed to</th><th>Status</th></tr>
          </thead>
          <tbody>
            {visibleList.map((r) => {
              const canAct = can('approve', r)
              const editing = dec && dec.id === r.id
              return (
                <Fragment key={r.id}>
                  <tr data-req={r.id} className={selId === r.id ? 'row-sel' : ''}>
                    <td>{r.subject}{r.note && (<div style={{ marginTop: 3, color: 'var(--ink-2)', fontSize: 12, maxWidth: 380 }}>{r.note}</div>)}{r.warning && (<div style={{ marginTop: 4 }}><span className="tag warn">warning</span>{' '}<span style={{ color: 'var(--ink-2)', fontSize: 12 }}>{r.warning}</span></div>)}{r.decisionComment && (<div style={{ marginTop: 4, color: 'var(--ink-2)', fontSize: 12 }}><b>{r.status === 'approved' ? 'Approved' : 'Declined'}{r.decidedBy ? ` by ${r.decidedBy}` : ''}:</b> {r.decisionComment}</div>)}</td>
                    <td>{r.type}</td>
                    <td style={{ fontSize: 12, color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>{r.startMs && r.endMs ? `${fmtDay(r.startMs)} – ${fmtDay(r.endMs)}` : '—'}</td>
                    <td>{r.requestedBy}</td>
                    <td>{r.routedTo}</td>
                    <td>
                      {r.status === 'pending' && canAct ? (
                        <span style={{ display: 'inline-flex', gap: 6 }}>
                          <button className="btn primary" style={{ padding: '2px 8px' }} onClick={() => setDec({ id: r.id, choice: 'approved', comment: '' })}>Approve</button>
                          <button className="btn" style={{ padding: '2px 8px' }} onClick={() => setDec({ id: r.id, choice: 'declined', comment: '' })}>Decline</button>
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          <span className={'tag ' + (r.status === 'approved' ? 'ok' : r.status === 'declined' ? 'warn' : '')}>{r.status}</span>
                          {r.status !== 'pending' && canAct && (<>
                            <button className="btn" style={{ padding: '2px 8px' }} onClick={() => setDec({ id: r.id, choice: r.status, comment: r.decisionComment || '' })}>Change</button>
                            <button className="btn" style={{ padding: '2px 8px' }} onClick={() => retract(r.id)}>Retract</button>
                          </>)}
                        </span>
                      )}
                    </td>
                  </tr>
                  {editing && (
                    <tr className="row-expand">
                      <td colSpan={6}>
                        <div style={{ padding: '4px 2px' }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                            <span className="hint">Decision</span>
                            <div className="seg">
                              <button className={dec.choice === 'approved' ? 'active' : ''} onClick={() => setDec((d) => ({ ...d, choice: 'approved' }))}>Approve</button>
                              <button className={dec.choice === 'declined' ? 'active' : ''} onClick={() => setDec((d) => ({ ...d, choice: 'declined' }))}>Decline</button>
                            </div>
                            <span className="hint">{dec.choice === 'declined' ? 'A comment is required to decline.' : 'A comment is optional.'}</span>
                          </div>
                          <textarea value={dec.comment} onChange={(e) => setDec((d) => ({ ...d, comment: e.target.value }))} rows={2}
                            placeholder={dec.choice === 'declined' ? 'Why this is declined — the requester will see this.' : 'Optional note to the requester.'}
                            style={{ width: '100%', maxWidth: 640, resize: 'vertical', background: 'var(--bg)', color: 'var(--ink)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', font: 'inherit' }} />
                          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                            <button className="btn primary" style={{ padding: '3px 10px' }} disabled={dec.choice === 'declined' && !dec.comment.trim()} onClick={applyDecision}>Confirm {dec.choice === 'approved' ? 'approval' : 'decline'}</button>
                            <button className="btn" style={{ padding: '3px 10px' }} onClick={() => setDec(null)}>Cancel</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
