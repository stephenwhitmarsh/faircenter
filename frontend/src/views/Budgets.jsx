import { useState } from 'react'
import {
  teams, people, projects, pctOfOrg, projectOwner, priorityTier,
} from '../data/mockData.js'

const fmt = (n) => n.toLocaleString('en-GB')
const budgetCell = (v) => `${fmt(v)} (${pctOfOrg(v)}%)`
const FUND_ORDER = { team: 0, org: 1, person: 2 }

// The name to show for a project: personal projects carry their owner in the
// [personal] tag, so the cell just needs the plain word.
function ProjectName({ p }) {
  const personal = p.funding === 'person'
  return (
    <>
      {personal ? projectOwner(p) : p.name}
      {personal && <span className="tag" style={{ marginLeft: 6 }}>personal</span>}
      {p.funding === 'org' && <span className="tag org" style={{ marginLeft: 6 }}>org pool</span>}
      {!p.teamId && p.funding !== 'person' && <span className="tag amber" style={{ marginLeft: 6 }}>no team</span>}
    </>
  )
}

function PriorityTag({ p }) {
  const t = priorityTier(p)
  if (!t) return <span className="hint">n/a</span>
  return <span className={'tag prio-' + t}>{t}</span>
}

export default function Budgets() {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(() => new Set())
  const query = q.trim().toLowerCase()
  const match = (s) => s.toLowerCase().includes(query)

  const groups = teams.map((t) => {
    const members = people.filter((p) => (p.teamIds ?? []).includes(t.id))
    const teamProjects = projects.filter((p) => p.teamId === t.id && p.funding !== 'person')
    const personalProjects = projects.filter((p) => p.funding === 'person' && members.some((m) => m.id === p.personId))
    const rows = [...teamProjects, ...personalProjects].sort((a, b) => FUND_ORDER[a.funding] - FUND_ORDER[b.funding])
    return { team: t, members, rows }
  })
  const teamless = projects.filter((p) => !p.teamId && p.funding !== 'person')

  const visible = query
    ? groups.filter((g) => match(g.team.name) || g.rows.some((p) => match(p.name)))
    : groups
  const teamlessVisible = teamless.filter((p) => !query || match(p.name) || match('organisation'))

  const isOpen = (id) => (query ? true : open.has(id))
  const toggle = (id) => setOpen((s) => {
    const n = new Set(s)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })
  const expandAll = () => setOpen(new Set([...teams.map((t) => t.id), 'noteam']))
  const collapseAll = () => setOpen(new Set())

  return (
    <section>
      <div className="view-head">
        <h2 className="view-title">Budgets</h2>
        <p className="view-intro">
          GPU budgets by team and project, in GPU-hours and as a share of the org pool.
          Each project sits under its owning team, or under “No owning team” when it has
          none. Priority is a tie-break, not the arbiter between pools: that follows
          budget share through fair-tree. Who works on each project is in the People tab.
        </p>
        <div className="legend-tags">
          <span><span className="tag org">org pool</span> draws on the org pool by design</span>
          <span><span className="tag amber">no team</span> no owning team yet</span>
          <span><span className="tag">personal</span> a person’s own budget</span>
          <span><span className="tag prio-high">high</span> <span className="tag prio-low">low</span> priority tie-break</span>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          Priority order for a job: reservation (held GPUs) → account standing from budget
          share → project tier as tie-break → the lane the engineer picks → age while it waits.
        </p>
      </div>

      <div className="controls">
        <input
          type="search"
          placeholder="Search team or project"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ minWidth: 260 }}
        />
        <button className="btn" onClick={expandAll}>Expand all</button>
        <button className="btn" onClick={collapseAll}>Collapse all</button>
      </div>

      {visible.map((g) => (
        <TeamGroup key={g.team.id} g={g} open={isOpen(g.team.id)} onToggle={() => toggle(g.team.id)} />
      ))}

      {teamlessVisible.length > 0 && (
        <div className="acc">
          <button className="acc-head" onClick={() => toggle('noteam')}>
            <span className="acc-chev">{isOpen('noteam') ? '▾' : '▸'}</span>
            <span className="acc-title">No owning team</span>
            <span className="acc-meta"><span>org-level &amp; unassigned</span><span>{teamlessVisible.length} projects</span></span>
          </button>
          {isOpen('noteam') && (
            <div className="acc-body">
              <ProjectTable rows={teamlessVisible} />
            </div>
          )}
        </div>
      )}

      {visible.length === 0 && teamlessVisible.length === 0 && <p className="hint">No matches.</p>}
    </section>
  )
}

function TeamGroup({ g, open, onToggle }) {
  const { team, members, rows } = g
  return (
    <div className="acc">
      <button className="acc-head" onClick={onToggle}>
        <span className="acc-chev">{open ? '▾' : '▸'}</span>
        <span className="acc-title">{team.name}</span>
        <span className="acc-meta">
          <span>{budgetCell(team.budget)} <span className="th-unit">GPU-h (% of pool)</span></span>
          <span>{members.length} people</span>
          <span>{rows.length} projects</span>
        </span>
      </button>
      {open && (
        <div className="acc-body">
          <div className="subhead">Projects</div>
          <ProjectTable rows={rows} />
        </div>
      )}
    </div>
  )
}

function ProjectTable({ rows }) {
  return (
    <table className="data" style={{ tableLayout: 'fixed' }}>
      <colgroup>
        <col />
        <col style={{ width: '170px' }} />
        <col style={{ width: '90px' }} />
        <col style={{ width: '210px' }} />
      </colgroup>
      <thead>
        <tr>
          <th>Name</th>
          <th className="num">Budget<br /><span className="th-unit">GPU-h (% of pool)</span></th>
          <th>Priority</th>
          <th>Dates</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.id}>
            <td><ProjectName p={p} /></td>
            <td className="num">{budgetCell(p.budget)}</td>
            <td><PriorityTag p={p} /></td>
            <td>{p.funding === 'person' ? <span className="hint">n/a</span> : `${p.start} to ${p.end}`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
