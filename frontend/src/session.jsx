import { createContext, useContext, useState } from 'react'
import { personById, teamById } from './data/mockData.js'

// POC stand-in for real identity. In production the signed-in user and their
// roles come from the org's SSO / identity provider through the backend; here
// a header switcher lets us act as different roles to demonstrate what each can
// do. Nothing here is a security boundary.
//
// Roles:
//   viewer  everyone, read-only
//   lead    a team lead: edits their own team (priorities, reservations), submits requests
//   ops     operations: edits global policy, headroom, capacity; approves; writes to SLURM

const ROLES = {
  viewer: { role: 'viewer', label: 'Viewer', personId: null, teamId: null },
}

const SessionContext = createContext(null)

export function SessionProvider({ children }) {
  const [session, setSession] = useState(ROLES.viewer)

  const can = (action, arg) => {
    const { role, teamId } = session
    switch (action) {
      case 'editPolicy':
      case 'editHeadroom':
      case 'editCapacity':
      case 'writeSlurm':
        return role === 'ops'
      case 'editTeam': // arg: teamId
        return role === 'ops' || (role === 'lead' && teamId === arg)
      case 'submitRequest':
        return role !== 'viewer'
      case 'approve': // arg: request (routedTo)
        return role === 'ops' || (role === 'lead' && arg && teamById(teamId)?.name === arg.routedTo)
      default:
        return false
    }
  }

  return (
    <SessionContext.Provider value={{ session, setSession, can }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession outside provider')
  return ctx
}

// Build the actor a switcher option maps to.
export function actorFor(kind, person) {
  if (kind === 'viewer') return ROLES.viewer
  if (kind === 'lead') return { role: 'lead', label: `${person.name} · ${teamById(person.teamIds[0])?.name} lead`, personId: person.id, teamId: person.teamIds[0] }
  if (kind === 'ops') return { role: 'ops', label: `${person.name} · operations`, personId: person.id, teamId: null }
  return ROLES.viewer
}

export function currentPerson(session) {
  return session.personId ? personById(session.personId) : null
}
