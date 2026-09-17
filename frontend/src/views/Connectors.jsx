// Connectors tab: the external systems the app reads from and writes to (operations only).
import { useState } from 'react'
import { connectors as seed } from '../data/mockData.js'
import { useSession } from '../session.jsx'

const clone = (list) => list.map((c) => ({ ...c, fields: c.fields.map((f) => ({ ...f })) }))

function StatusPill({ status }) {
  const ok = status === 'connected'
  return <span className={'tag ' + (ok ? 'ok' : '')} style={ok ? undefined : { color: 'var(--ink-2)' }}>{status}</span>
}

export default function Connectors() {
  const { can } = useSession()
  const editable = can('editCapacity') // operations only
  const [list, setList] = useState(() => clone(seed))
  const [flash, setFlash] = useState({}) // id -> message

  const setField = (ci, fi, v) => setList((l) => l.map((c, i) => (i === ci ? { ...c, fields: c.fields.map((f, j) => (j === fi ? { ...f, value: v } : f)) } : c)))
  const toggle = (ci) => setList((l) => l.map((c, i) => (i === ci ? { ...c, enabled: !c.enabled } : c)))
  const note = (id, msg) => { setFlash((s) => ({ ...s, [id]: msg })); setTimeout(() => setFlash((s) => ({ ...s, [id]: '' })), 2500) }
  const save = (c) => note(c.id, 'Saved (illustrative — a real backend would store this server-side).')
  const test = (c) => note(c.id, c.enabled ? 'Connection ok (illustrative).' : 'Enable the connector first.')

  return (
    <section>
      {!editable && (
        <div className="perm-note" style={{ marginBottom: 12 }}>Operations only — sign in as operations to edit. Values are shown read-only, secrets are hidden.</div>
      )}

      {list.map((c, ci) => (
        <div className="card" key={c.id}>
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span>{c.name}</span>
            <span className="th-unit">{c.kind} · {c.role}</span>
            <StatusPill status={c.enabled ? c.status : 'disconnected'} />
            <label style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 400, fontSize: 13 }}>
              <input type="checkbox" checked={c.enabled} disabled={!editable} onChange={() => toggle(ci)} /> enabled
            </label>
          </div>
          <div className="conn-grid">
            {c.fields.map((f, fi) => (
              <label className="conn-field" key={f.key}>
                <span>{f.label}</span>
                {f.type === 'select' ? (
                  <select value={f.value} disabled={!editable} onChange={(e) => setField(ci, fi, e.target.value)}>
                    {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <span className="conn-input">
                    <input type={f.type === 'password' ? 'password' : f.type === 'number' ? 'number' : 'text'}
                      value={f.value} placeholder={f.placeholder || ''} disabled={!editable}
                      onChange={(e) => setField(ci, fi, e.target.value)} />
                    {f.suffix && <span className="conn-suffix">{f.suffix}</span>}
                  </span>
                )}
              </label>
            ))}
          </div>
          {editable && (
            <div className="apply-bar" style={{ marginTop: 8 }}>
              <button className="btn" onClick={() => test(c)}>Test connection</button>
              <button className="btn primary" onClick={() => save(c)}>Save</button>
              {flash[c.id] && <span className="hint">{flash[c.id]}</span>}
            </div>
          )}
        </div>
      ))}
    </section>
  )
}
