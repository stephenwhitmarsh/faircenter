// Team tab: per-team roll-out phase, pool sizing, and distribution across projects.
import { useState, useEffect } from 'react'
import { fmt } from '../format.js'
import {
  teams, teamById, teamHue, teamPhase, teamPhaseInfo, teamEnforcement, teamProjectsOf,
  GOV_PHASES, governance, priorityTier, projectState, projectsPoolHours,
} from '../data/mockData.js'
import { useSession, RoleChip } from '../session.jsx'

const pct = (v, total) => (total ? Math.round((v / total) * 100) : 0)

function PriorityTag({ p }) {
  const t = priorityTier(p)
  if (!t) return <span className="hint">n/a</span>
  return <span className={'tag prio-' + t}>{t}</span>
}

// the mechanisms in force, as factual tags
function mechTags(on = {}) {
  const items = [
    ['person budgets', on.enfPerson],
    ['project budgets', on.enfProject],
    ['team pool', on.enfTeam],
    ['lanes', on.lanes],
    ['cross-team standing', on.teamStanding],
  ]
  return items.filter(([, v]) => v).map(([label]) => label)
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

  // ops-only: the size of this team's pool, staged until Apply
  const [poolDraft, setPoolDraft] = useState(() => team?.budget || 0)
  useEffect(() => { setPoolDraft(team?.budget || 0) }, [teamId, rev]) // eslint-disable-line react-hooks/exhaustive-deps

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
  const enf = teamEnforcement(team) // mechanisms actually in force for the team
  const teamPoolActive = !!enf.enfTeam
  const applyPhase = () => { team.phaseOverride = phaseSel === governance.phase ? null : phaseSel; setRev((v) => v + 1) }
  const resetPhase = () => { team.phaseOverride = null; setPhaseSel(governance.phase); setRev((v) => v + 1) }
  const phaseDirty = phaseSel !== teamPhase(team)

  // ops distribute the whole teams pool one team at a time; the split into person vs teams is set in Policy
  const teamsPool = projectsPoolHours()
  const otherTeamsPool = teams.reduce((s, t) => s + (t.id === teamId ? 0 : (t.budget || 0)), 0)
  const maxPool = Math.max(0, teamsPool - otherTeamsPool)
  const poolClamped = Math.min(maxPool, Math.max(0, Math.round(Number(poolDraft) || 0)))
  const poolUnallocated = Math.max(0, teamsPool - otherTeamsPool - poolClamped)
  const poolDirty = poolClamped !== (team.budget || 0)
  const applyPool = () => { team.budget = poolClamped; setRev((v) => v + 1) }

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

      {/* Policy in force for the team — operations only */}
      {canPolicy && (
        <div className="card">
          <div className="card-title">
            Policy — {team.name} <RoleChip role="ops" label="ops" />
            <span className="th-unit" style={{ marginLeft: 8 }}>{info.name}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, margin: '2px 0 4px' }}>
            <span className="hint" style={{ marginRight: 2 }}>In force</span>
            {mechTags(enf).map((m) => <span key={m} className="tag">{m}</span>)}
            {mechTags(enf).length === 0 && <span className="hint">nothing enforced — transparency only.</span>}
          </div>
          <div className="gov-steps" style={{ marginTop: 8 }}>
            {GOV_PHASES.map((g) => (
              <button key={g.key} type="button" className={'gov-step' + (g.n === phaseSel ? ' cur' : g.n < phaseSel ? ' done' : '')} onClick={() => setPhaseSel(g.n)}>
                <span className="gov-n">{g.n}</span>
                <span className="gov-name">{g.name}</span>
                <span className="gov-short">{g.short}</span>
              </button>
            ))}
          </div>
          <div className="apply-bar" style={{ marginTop: 8 }}>
            <button className="btn primary" disabled={!phaseDirty} onClick={applyPhase}>Apply to team</button>
            <button className="btn" disabled={team.phaseOverride == null} onClick={resetPhase}>Reset to default</button>
            <span className="hint">{phaseDirty ? 'Staged.' : team.phaseOverride != null ? 'Set for this team.' : 'Following the org default.'}</span>
          </div>
        </div>
      )}

      {/* Size of this team's pool — operations only. The person vs teams split stays in Policy. */}
      {canPolicy && (
        <div className="card">
          <div className="card-title">Team pool — {team.name} <RoleChip role="ops" label="ops" /></div>
          <div className="controls" style={{ marginTop: 0, marginBottom: 8 }}>
            <label>Pool</label>
            <span className="numin">
              <input type="number" min="0" max={maxPool} step="1000" value={poolDraft} onChange={(e) => setPoolDraft(e.target.value)} style={{ width: 130 }} />
              <span className="numin-suffix">GPU-h</span>
            </span>
            <button className="btn" onClick={() => setPoolDraft(maxPool)}>Take the rest</button>
            
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: 420, marginBottom: 4 }}>
            <span className="meter" style={{ flex: 1 }}><span style={{ width: pct(poolClamped, teamsPool) + '%', background: teamHue[team.id] }} /></span>
            <span style={{ width: 44, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{pct(poolClamped, teamsPool)}%</span>
          </div>
          <div className="apply-bar">
            <button className="btn primary" disabled={!poolDirty} onClick={applyPool}>Apply pool</button>
            <button className="btn" disabled={!poolDirty} onClick={() => setPoolDraft(team.budget || 0)}>Discard</button>
            <span className="hint">{poolDirty ? 'Staged.' : 'No staged changes.'} Allocations across projects are capped by the pool.</span>
          </div>
        </div>
      )}

      {/* Distribution of the team pool across projects (team lead) */}
      <div className="card">
        <div className="card-title">Distribution across projects</div>
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
              <span className="hint">{distDirty ? 'Staged.' : 'No staged changes.'}</span>
            </div>
          )}
          
        </>)}
      </div>
    </section>
  )
}
