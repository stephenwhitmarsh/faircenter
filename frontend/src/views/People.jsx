import { useState } from 'react'
import {
  people, teams, projects, projectOwner, projectsForPerson, peopleForProject, teamsForPerson,
} from '../data/mockData.js'

const teamNames = (p) => teamsForPerson(p).map((t) => t.name).join(', ')

export default function People() {
  const [q, setQ] = useState('')
  const [by, setBy] = useState('team')
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
      <div className="view-head">
        <h2 className="view-title">People</h2>
        <p className="view-intro">
          Who sits on which team and which projects they are allocated to, imported
          from Notion and checked here. Group by team, project or person, and search
          for any of them. Assignments are the staffing link, separate from the GPU
          budgets in the Budgets tab.
        </p>
      </div>

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
        <button className="btn" onClick={expandAll}>Expand all</button>
        <button className="btn" onClick={collapseAll}>Collapse all</button>
      </div>

      {by === 'person' && <ByPerson query={query} match={match} isOpen={isOpen} toggle={toggle} />}
      {by === 'team' && <ByTeam query={query} match={match} isOpen={isOpen} toggle={toggle} />}
      {by === 'project' && <ByProject query={query} match={match} isOpen={isOpen} toggle={toggle} />}
    </section>
  )
}

function ByPerson({ query, match, isOpen, toggle }) {
  const visible = people.filter((p) => !query
    || match(p.name) || teamsForPerson(p).some((t) => match(t.name))
    || projectsForPerson(p).some((pr) => match(pr.name)))
  return (
    <>
      {visible.map((p) => {
        const list = projectsForPerson(p)
        return (
          <Acc key={p.id} id={p.id} title={p.name} meta={`${teamNames(p)} · ${list.length} projects`} open={isOpen(p.id)} onToggle={() => toggle(p.id)}>
            {list.length === 0 ? <p className="hint">No projects.</p> : (
              <table className="data" style={{ tableLayout: 'fixed' }}>
                <colgroup><col style={{ width: '55%' }} /><col /></colgroup>
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

function ByTeam({ query, match, isOpen, toggle }) {
  const groups = teams.map((t) => ({ team: t, members: people.filter((p) => (p.teamIds ?? []).includes(t.id)) }))
  const visible = groups.filter((g) => !query
    || match(g.team.name)
    || g.members.some((m) => match(m.name) || projectsForPerson(m).some((pr) => match(pr.name))))
  return (
    <>
      {visible.map(({ team, members }) => (
        <Acc key={team.id} id={team.id} title={team.name} meta={`${members.length} people`} open={isOpen(team.id)} onToggle={() => toggle(team.id)}>
          <table className="data" style={{ tableLayout: 'fixed' }}>
            <colgroup><col style={{ width: '32%' }} /><col /><col style={{ width: '60px' }} /></colgroup>
            <thead><tr><th>Person</th><th>Projects</th><th className="num">On</th></tr></thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td>{projectList(projectsForPerson(m))}</td>
                  <td className="num">{projectsForPerson(m).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Acc>
      ))}
      {visible.length === 0 && <p className="hint">No matches.</p>}
    </>
  )
}

function ByProject({ query, match, isOpen, toggle }) {
  const groups = projects.map((p) => ({ project: p, assigned: peopleForProject(p.id) }))
  const visible = groups.filter((g) => !query
    || match(g.project.name) || match(projectOwner(g.project))
    || g.assigned.some((m) => match(m.name)))
  return (
    <>
      {visible.map(({ project, assigned }) => (
        <Acc key={project.id} id={project.id} title={project.name} meta={`${projectOwner(project)} · ${assigned.length} people`} open={isOpen(project.id)} onToggle={() => toggle(project.id)}>
          {assigned.length === 0 ? <p className="hint">No one assigned.</p> : (
            <table className="data" style={{ tableLayout: 'fixed' }}>
              <colgroup><col style={{ width: '45%' }} /><col /></colgroup>
              <thead><tr><th>Person</th><th>Team</th></tr></thead>
              <tbody>
                {assigned.map((m) => (
                  <tr key={m.id}>
                    <td>{m.name}</td>
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

function projectList(list) {
  if (!list.length) return <span className="hint">—</span>
  return list.map((pr, i) => <span key={pr.id}>{i > 0 && ', '}{pr.name}</span>)
}
