import { useState } from 'react'
import {
  teams, people, projects, pctOfOrg, orgPool,
} from '../data/mockData.js'

const fmt = (n) => n.toLocaleString('en-GB')
const budgetCell = (v) => `${fmt(v)} (${pctOfOrg(v)}%)`
const FUND_ORDER = { team: 0, org: 1, person: 2 }

function PoolTag({ funding }) {
  if (funding === 'org') return <span className="tag org" style={{ marginLeft: 6 }}>org pool</span>
  if (funding === 'person') return <span className="tag" style={{ marginLeft: 6 }}>personal</span>
  return null
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
          GPU budgets by team and project. Projects sit under their team, and the pool
          that funds each one shows as a tag (team by default, or org pool or personal).
          Org-level projects with no owning team are grouped under Organisation. Budgets
          show in GPU-hours and as a share of the org pool ({fmt(orgPool)}). Who works on
          each project is in the People tab.
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
            <span className="acc-title">Organisation</span>
            <span className="acc-meta"><span>{teamlessVisible.length} projects</span></span>
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
          <span>{budgetCell(team.budget)}</span>
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
        <col style={{ width: '150px' }} />
        <col style={{ width: '90px' }} />
        <col style={{ width: '210px' }} />
      </colgroup>
      <thead>
        <tr>
          <th>Project</th>
          <th className="num">Budget</th>
          <th className="num">Priority</th>
          <th>Dates</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.id}>
            <td>{p.name}<PoolTag funding={p.funding} /></td>
            <td className="num">{budgetCell(p.budget)}</td>
            <td className="num">{p.priority}</td>
            <td>{p.funding === 'person' ? <span className="hint">n/a</span> : `${p.start} to ${p.end}`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
