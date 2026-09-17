// Directory tab: people, teams and projects as imported from Notion.
import { useState } from 'react'
import {
  people, teams, projects, projectOwner, projectsForPerson, peopleForProject, teamsForPerson, projectState, personById,
} from '../data/mockData.js'

const leadName = (pr) => (pr.leadPersonId ? (personById(pr.leadPersonId)?.name || '—') : '—')
// shared column widths so tables line up within and across the team, project and person groupings
const PW = { a: 340, b: 210, c: 74, total: 624 }

// all members as a comma-separated list, with chips for team lead and project lead
function memberList(members, teamProjects) {
  if (!members.length) return <span className="hint">none</span>
  const leadIds = new Set(teamProjects.map((p) => p.leadPersonId).filter(Boolean))
  return members.map((m, i) => (
    <span key={m.id} className="member">
      {i > 0 && ', '}
      {m.name}
      {m.role === 'lead' && <span className="tag org chip">team lead</span>}
      {leadIds.has(m.id) && <span className="tag chip">project lead</span>}
    </span>
  ))
}

const teamNames = (p) => teamsForPerson(p).map((t) => t.name).join(', ')
const isActive = (pr) => projectState(pr) === 'active'
const activeProjectsOf = (p, activeOnly) => { const l = projectsForPerson(p); return activeOnly ? l.filter(isActive) : l }

function RoleBadge({ person }) {
  if (person.role === 'lead') return <span className="tag org" style={{ marginLeft: 6 }}>team lead</span>
  if (person.role === 'ops') return <span className="tag amber" style={{ marginLeft: 6 }}>operations</span>
  return null
}

export default function People() {
  const [q, setQ] = useState('')
  const [by, setBy] = useState('team')
  const [activeOnly, setActiveOnly] = useState(true)
  const [open, setOpen] = useState(() => new Set())
  const query = q.trim().toLowerCase()
  const match = (s) => (s || '').toLowerCase().includes(query)

  const isOpen = (id) => (query ? true : open.has(id))
  const toggle = (id) => setOpen((s) => {
    const n = new Set(s)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })
  const ids = by === 'team' ? teams.map((t) => t.id) : by === 'project' ? projects.map((p) => p.id) : people.map((p) => p.id)
  const expandAll = () => setOpen(new Set(ids))
  const collapseAll = () => setOpen(new Set())

  return (
    <section>
      <div className="controls">
        <label>Group by</label>
        <div className="seg">
          <button className={by === 'team' ? 'active' : ''} onClick={() => setBy('team')}>Team</button>
          <button className={by === 'project' ? 'active' : ''} onClick={() => setBy('project')}>Project</button>
          <button className={by === 'person' ? 'active' : ''} onClick={() => setBy('person')}>Person</button>
        </div>
        <input
          type="search"
          placeholder="Search person, team or project"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ minWidth: 240 }}
        />
        <label className="chk" style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} /> Active only
        </label>
        <button className="btn" onClick={expandAll}>Expand all</button>
        <button className="btn" onClick={collapseAll}>Collapse all</button>
      </div>

      {by === 'person' && <ByPerson query={query} match={match} isOpen={isOpen} toggle={toggle} activeOnly={activeOnly} />}
      {by === 'team' && <ByTeam query={query} match={match} isOpen={isOpen} toggle={toggle} activeOnly={activeOnly} />}
      {by === 'project' && <ByProject query={query} match={match} isOpen={isOpen} toggle={toggle} activeOnly={activeOnly} />}
    </section>
  )
}

function ByPerson({ query, match, isOpen, toggle, activeOnly }) {
  const visible = people.filter((p) => {
    if (activeOnly && activeProjectsOf(p, true).length === 0) return false
    return !query || match(p.name) || teamsForPerson(p).some((t) => match(t.name))
      || activeProjectsOf(p, activeOnly).some((pr) => match(pr.name))
  })
  return (
    <>
      {visible.map((p) => {
        const list = activeProjectsOf(p, activeOnly)
        return (
          <Acc key={p.id} id={p.id} title={<>{p.name}<RoleBadge person={p} /></>} meta={`${teamNames(p) || 'no team'} · ${list.length} projects`} open={isOpen(p.id)} onToggle={() => toggle(p.id)}>
            {list.length === 0 ? <p className="hint">No projects.</p> : (
              <table className="data data-fixed" style={{ tableLayout: 'fixed', width: PW.total }}>
                <colgroup><col style={{ width: PW.a }} /><col style={{ width: PW.b + PW.c }} /></colgroup>
                <thead><tr><th>Project</th><th>Owner</th></tr></thead>
                <tbody>
                  {list.map((pr) => (
                    <tr key={pr.id}>
                      <td>{pr.name}</td>
                      <td>{projectOwner(pr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Acc>
        )
      })}
      {visible.length === 0 && <p className="hint">No matches.</p>}
    </>
  )
}

function ByTeam({ query, match, isOpen, toggle, activeOnly }) {
  let groups = teams.map((t) => {
    let members = people.filter((p) => (p.teamIds ?? []).includes(t.id))
    if (activeOnly) members = members.filter((m) => activeProjectsOf(m, true).length > 0)
    return { team: t, members }
  })
  if (activeOnly) groups = groups.filter((g) => g.members.length > 0)
  const visible = groups.filter((g) => !query
    || match(g.team.name)
    || g.members.some((m) => match(m.name) || activeProjectsOf(m, activeOnly).some((pr) => match(pr.name))))
  return (
    <>
      {visible.map(({ team, members }) => {
        const tp = projects.filter((p) => p.teamId === team.id)
        const teamProjects = activeOnly ? tp.filter(isActive) : tp
        return (
        <Acc key={team.id} id={team.id} title={team.name} meta={`${members.length} people · ${teamProjects.length} projects`} open={isOpen(team.id)} onToggle={() => toggle(team.id)}>
          <div className="subhead">Projects</div>
          <table className="data data-fixed" style={{ tableLayout: 'fixed', width: PW.total }}>
            <colgroup><col style={{ width: PW.a }} /><col style={{ width: PW.b }} /><col style={{ width: PW.c }} /></colgroup>
            <thead><tr><th>Project</th><th>Lead</th><th className="num">People</th></tr></thead>
            <tbody>
              {teamProjects.map((pr) => (
                <tr key={pr.id}>
                  <td>{pr.name}</td>
                  <td>{leadName(pr)}</td>
                  <td className="num">{peopleForProject(pr.id).length}</td>
                </tr>
              ))}
              {teamProjects.length === 0 && <tr><td colSpan={3} className="hint">No{activeOnly ? ' active' : ''} projects.</td></tr>}
            </tbody>
          </table>
          <div className="subhead" style={{ marginTop: 12 }}>People <span className="th-unit">{members.length}</span></div>
          <p className="member-list">{memberList(members, teamProjects)}</p>
        </Acc>
        )
      })}
      {visible.length === 0 && <p className="hint">No matches.</p>}
    </>
  )
}

function ByProject({ query, match, isOpen, toggle, activeOnly }) {
  // personal work is individual, not a team or org project; it belongs under a person, not here
  let groups = projects.filter((p) => p.funding !== 'person').map((p) => ({ project: p, assigned: peopleForProject(p.id) }))
  if (activeOnly) groups = groups.filter((g) => isActive(g.project))
  const visible = groups.filter((g) => !query
    || match(g.project.name) || match(projectOwner(g.project))
    || g.assigned.some((m) => match(m.name)))
  return (
    <>
      {visible.map(({ project, assigned }) => (
        <Acc key={project.id} id={project.id} title={project.name} meta={`${projectOwner(project)} · ${assigned.length} people`} open={isOpen(project.id)} onToggle={() => toggle(project.id)}>
          {assigned.length === 0 ? <p className="hint">No one assigned.</p> : (
            <table className="data data-fixed" style={{ tableLayout: 'fixed', width: PW.total }}>
              <colgroup><col style={{ width: PW.a }} /><col style={{ width: PW.b + PW.c }} /></colgroup>
              <thead><tr><th>Person</th><th>Team</th></tr></thead>
              <tbody>
                {assigned.map((m) => (
                  <tr key={m.id}>
                    <td>{m.name}<RoleBadge person={m} /></td>
                    <td>{teamNames(m)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Acc>
      ))}
      {visible.length === 0 && <p className="hint">No matches.</p>}
    </>
  )
}

function Acc({ title, meta, open, onToggle, children }) {
  return (
    <div className="acc">
      <button className="acc-head" onClick={onToggle}>
        <span className="acc-chev">{open ? '▾' : '▸'}</span>
        <span className="acc-title">{title}</span>
        <span className="acc-meta"><span>{meta}</span></span>
      </button>
      {open && <div className="acc-body">{children}</div>}
    </div>
  )
}

