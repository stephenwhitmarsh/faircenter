// Team tab: per-team roll-out phase, mechanisms, and distribution of the team pool across projects.
import { useState, useEffect } from 'react'
import { fmt } from '../format.js'
import {
  teams, teamById, teamHue, teamPhase, teamPhaseInfo, teamEnforcement, teamProjectsOf,
  GOV_PHASES, governance, priorityTier, projectState,
} from '../data/mockData.js'
import { useSession, RoleChip } from '../session.jsx'
import Mechanisms from '../components/Mechanisms.jsx'

const pct = (v, total) => (total ? Math.round((v / total) * 100) : 0)

function PriorityTag({ p }) {
  const t = priorityTier(p)
  if (!t) return <span className="hint">n/a</span>
  return <span className={'tag prio-' + t}>{t}</span>
}

export default function Team({ onNav }) {
  const { session, can } = useSession()
  const isOps = session.role === 'ops'
  const [teamId, setTeamId] = useState(session.teamId || teams[0]?.id)
  const [rev, setRev] = useState(0)
  const team = teamById(teamId)

  const canPolicy = can('editTeamPolicy')
  const canDist = can('editTeam', teamId)

  const [phaseSel, setPhaseSel] = useState(() => teamPhase(team))
  useEffect(() => { setPhaseSel(teamPhase(team)) }, [teamId]) // eslint-disable-line react-hooks/exhaustive-deps

  // distribution covers only active projects; finished ones no longer draw, planned ones are
  // funded through a new-project request when approved
  const projs = teamProjectsOf(teamId).filter((p) => projectState(p) === 'active')
  const [draft, setDraft] = useState({})
  useEffect(() => {
    const d = {}; for (const p of teamProjectsOf(teamId).filter((q) => projectState(q) === 'active')) d[p.id] = p.budget
    setDraft(d)
  }, [teamId, rev])

  if (!team) return <section><div className="card"><p className="hint" style={{ margin: 0 }}>No team selected.</p></div></section>

  const info = teamPhaseInfo(team)
  // the phase whose mechanisms the toggles show: the staged selection for ops, the team's own otherwise
  const selPhase = GOV_PHASES.find((g) => g.n === phaseSel) || info
  const enf = teamEnforcement(team) // mechanisms actually in force for the team
  const teamPoolActive = !!enf.enfTeam
  const applyPhase = () => { team.phaseOverride = phaseSel === governance.phase ? null : phaseSel; setRev((v) => v + 1) }
  const resetPhase = () => { team.phaseOverride = null; setPhaseSel(governance.phase); setRev((v) => v + 1) }
  const phaseDirty = phaseSel !== teamPhase(team)

  const pool = team.budget || 0
  const allocated = projs.reduce((s, p) => s + (draft[p.id] ?? p.budget), 0)
  const remaining = Math.max(0, pool - allocated)
  const distDirty = projs.some((p) => (draft[p.id] ?? p.budget) !== p.budget)
  // an allocation can never push the running total past the pool
  const setBudget = (id, raw) => setDraft((d) => {
    const others = projs.reduce((s, p) => s + (p.id === id ? 0 : (d[p.id] ?? p.budget)), 0)
    const maxV = Math.max(0, pool - others)
    return { ...d, [id]: Math.min(maxV, Math.max(0, Math.round(Number(raw) || 0))) }
  })
  const applyDist = () => { for (const p of projs) if (draft[p.id] != null) p.budget = draft[p.id]; setRev((v) => v + 1) }
  const discardDist = () => { const d = {}; for (const p of projs) d[p.id] = p.budget; setDraft(d) }
  const evenSplit = () => { const each = Math.floor(pool / (projs.length || 1)); const d = {}; projs.forEach((p) => { d[p.id] = each }); setDraft(d) }

  return (
    <section>
      <div className="controls" style={{ marginBottom: 12 }}>
        <label>Team</label>
        <select value={teamId} onChange={(e) => setTeamId(e.target.value)} disabled={session.role === 'lead'}>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {/* Policy for the team: mechanisms show for team leads and ops; only ops stage a phase */}
      <div className="card">
        <div className="card-title">
          Policy — {team.name}
          {canPolicy && <RoleChip role="ops" label="ops" />}
          <span className="th-unit" style={{ marginLeft: 8 }}>{selPhase.name}</span>
        </div>
        {canPolicy && (<>
          <div className="gov-steps">
            {GOV_PHASES.map((g) => (
              <button key={g.key} type="button" className={'gov-step' + (g.n === phaseSel ? ' cur' : g.n < phaseSel ? ' done' : '')} onClick={() => setPhaseSel(g.n)}>
                <span className="gov-n">{g.n}</span>
                <span className="gov-name">{g.name}</span>
                <span className="gov-short">{g.short}</span>
              </button>
            ))}
          </div>
          <div className="apply-bar" style={{ marginTop: 8, marginBottom: 8 }}>
            <button className="btn primary" disabled={!phaseDirty} onClick={applyPhase}>Apply to team</button>
            <button className="btn" disabled={team.phaseOverride == null} onClick={resetPhase}>Reset to default</button>
            <span className="hint">{phaseDirty ? 'Staged, not yet applied.' : team.phaseOverride != null ? 'Set for this team.' : 'Following the org default.'}</span>
          </div>
        </>)}
        <Mechanisms flags={selPhase.on} editable={false} />
      </div>

      {/* Distribution of the team pool across projects (team lead) */}
      <div className="card">
        <div className="card-title">Distribution across projects <span className="th-unit">pool {fmt(pool)} GPU-h</span></div>
        {canPolicy && <p className="hint" style={{ margin: '0 0 8px' }}>Size this team's pool on the Budgets tab.</p>}
        {!teamPoolActive ? (
          <p className="hint" style={{ marginBottom: 0 }}>
            The team pool is distributed by the team lead once operations turn on team budgets for this team.
            {canPolicy && ' Set the phase to Team budgets above.'}
          </p>
        ) : (<>
          {canDist && (
            <div className="controls" style={{ marginTop: 0, marginBottom: 8 }}>
              <button className="btn" onClick={evenSplit}>Even split</button>
              
            </div>
          )}
          <div className="tbl-scroll">
            <table className="data" style={{ tableLayout: 'fixed' }}>
              <colgroup><col /><col style={{ width: '90px' }} /><col style={{ width: '110px' }} /><col style={{ width: '140px' }} /><col style={{ width: '160px' }} /></colgroup>
              <thead><tr><th>Project</th><th>Priority</th><th className="num">Used</th><th className="num">Allocated</th><th>Share of pool</th></tr></thead>
              <tbody>
                {projs.map((p) => {
                  const b = draft[p.id] ?? p.budget
                  const share = pct(b, pool)
                  return (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td><PriorityTag p={p} /></td>
                      <td className="num">{fmt(p.used)}</td>
                      <td className="num">
                        {canDist
                          ? <span className="numin"><input type="number" min="0" max={pool} step="1000" value={b} onChange={(e) => setBudget(p.id, e.target.value)} style={{ width: 110 }} /></span>
                          : fmt(b)}
                      </td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, width: 140 }}>
                          <span className="meter" style={{ flex: 1 }}><span style={{ width: Math.min(100, share) + '%', background: teamHue[team.id] }} /></span>
                          <span style={{ width: 38, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{share}%</span>
                        </span>
                      </td>
                    </tr>
                  )
                })}
                {projs.length === 0 && <tr><td colSpan={5} className="hint">No active projects.</td></tr>}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}><b>Allocated</b></td>
                  <td className="num"><b>{fmt(allocated)}</b></td>
                  <td><b>{pct(allocated, pool)}%</b> of pool</td>
                </tr>
                <tr>
                  <td colSpan={3}>Remaining</td>
                  <td className="num">{fmt(remaining)}</td>
                  <td>{pct(remaining, pool)}% of pool</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {canDist && (
            <div className="apply-bar">
              <button className="btn primary" disabled={!distDirty} onClick={applyDist}>Apply distribution</button>
              <button className="btn" disabled={!distDirty} onClick={discardDist}>Discard</button>
              <span className="hint">{distDirty ? 'Staged.' : 'No staged changes.'} Capped by the team pool.</span>
            </div>
          )}
          
        </>)}
      </div>
    </section>
  )
}
