import { requests } from '../data/mockData.js'

export default function Requests() {
  return (
    <section>
      <div className="view-head">
        <h2 className="view-title">Requests for changes</h2>
        <p className="view-intro">
          A new project, or a change to a project's budget or priority. Each request
          is routed to the next person up for approval. If a change would take a pool
          past its limits, the app warns before it is submitted.
        </p>
      </div>

      <div className="card">
        <div className="card-title">Open and recent requests</div>
        <table className="data">
          <thead>
            <tr>
              <th>Request</th>
              <th>Type</th>
              <th>Requested by</th>
              <th>Routed to</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.subject}
                  {r.warning && (
                    <div style={{ marginTop: 4 }}>
                      <span className="tag warn">warning</span>{' '}
                      <span style={{ color: 'var(--ink-2)', fontSize: 12 }}>{r.warning}</span>
                    </div>
                  )}
                </td>
                <td>{r.type}</td>
                <td>{r.requestedBy}</td>
                <td>{r.routedTo}</td>
                <td>
                  <span className={'tag ' + (r.status === 'approved' ? 'ok' : '')}>{r.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-title">Raise a request</div>
        <p className="stub" style={{ marginTop: 0 }}>
          The form for new requests goes here: pick a type, fill the fields, and see
          the effect on the relevant pool before submitting. Wired to the mock data
          for now; this becomes a real form once the backend exists.
        </p>
      </div>
    </section>
  )
}
