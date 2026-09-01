import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function getData() {
  if (!supabase) {
    return {
      stats: {
        totalRuns: 0,
        successRate: 0,
        totalChanges: 0,
        blockedRuns: 0,
        failedRuns: 0,
      },
      runs: [],
      changes: [],
    };
  }

  const [{ data: runsData, error: runsError }, { data: changesData, error: changesError }] = await Promise.all([
    supabase.from('run_log').select('*').order('run_timestamp', { ascending: false }),
    supabase.from('changes').select('*').order('detected_at', { ascending: false }),
  ]);

  if (runsError) {
    throw new Error(runsError.message);
  }

  if (changesError) {
    throw new Error(changesError.message);
  }

  const runs = runsData || [];
  const changes = changesData || [];

  const totalRuns = runs.length;
  const successfulRuns = runs.filter((run) => run.status === 'success').length;
  const blockedRuns = runs.filter((run) => run.status === 'blocked').length;
  const failedRuns = runs.filter((run) => run.status === 'failure').length;
  const totalChanges = changes.length;

  return {
    stats: {
      totalRuns,
      successRate: totalRuns ? Math.round((successfulRuns / totalRuns) * 100) : 0,
      totalChanges,
      blockedRuns,
      failedRuns,
    },
    runs,
    changes,
  };
}

function formatTimestamp(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function compactSummary(value: unknown) {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default async function Home() {
  const data = await getData();

  return (
    <main className="monitor-shell"><div className="monitor-layout">
      <aside className="monitor-rail"><div className="rail-brand"><span className="rail-mark">A</span><span>Autonomous<br />Monitoring</span></div><nav className="rail-nav" aria-label="Dashboard navigation"><span className="rail-nav-label">Workspace</span><a className="rail-link active" href="#overview"><span>01</span>Overview</a><a className="rail-link" href="#runs"><span>02</span>Run history</a><a className="rail-link" href="#changes"><span>03</span>Change log</a></nav><div className="rail-footer"><span className="status-dot" />Agent online<div className="rail-version">v0.8.4 / production</div></div></aside>
      <div className="monitor-content"><header className="monitor-header" id="overview"><div><p className="kicker">Control room / 01</p><h1>Autonomous pricing monitor</h1></div><div className="target-chip"><span className="target-dot" />SunPeak Solar <span className="chip-divider" /> target active</div></header>
        <section className="metric-grid"><div className="metric"><p>Total runs</p><strong>{data.stats.totalRuns}</strong><span className="metric-note">all time</span></div><div className="metric"><p>Success rate</p><strong className="accent">{data.stats.successRate}%</strong><span className="metric-note">completed cleanly</span></div><div className="metric"><p>Changes detected</p><strong>{data.stats.totalChanges}</strong><span className="metric-note">across snapshots</span></div><div className="metric"><p>Blocks / failures</p><strong className="warning">{data.stats.blockedRuns + data.stats.failedRuns}</strong><span className="metric-note">needs attention</span></div></section>
        <section className="proof-banner"><div className="proof-heading"><div><p className="kicker amber">Resilience test / passed</p><h2>v1 <span>→</span> v2 layout-change validation</h2></div><span className="proof-state">Proof captured</span></div><p className="proof-copy">The mock target was redesigned from the original card-based v1 layout to a new v2 structure without changing the pricing content or agent code. The proof artifact is stored in the project docs and demonstrates that extraction still resolves the same company, pricing tiers, and last-updated values after the redesign.</p><div className="proof-links"><a href="/proof/resilience-proof.md">Open proof doc <span>↗</span></a><a href="/proof/before-snapshot.json">Before snapshot <span>↗</span></a><a href="/proof/after-snapshot.json">After snapshot <span>↗</span></a></div></section>
        <section className="data-grid"><div className="data-panel" id="runs"><div className="panel-header"><div><p className="kicker">Activity / 24h</p><h2>Run history</h2></div><span className="live-label"><span />Live from Supabase</span></div><div className="table-wrap"><table><thead><tr><th>Timestamp</th><th>Status</th><th>Duration</th><th>What happened</th></tr></thead><tbody>{data.runs.length === 0 ? <tr><td colSpan={4} className="empty-row">No run data yet. The scheduled action has not produced a snapshot.</td></tr> : data.runs.map((run) => <tr key={run.id}><td>{formatTimestamp(run.run_timestamp)}</td><td><span className={`run-status ${run.status}`}>{run.status}</span></td><td>{run.duration_ms ? `${run.duration_ms} ms` : '—'}</td><td>{run.error_message || 'Monitoring run completed normally.'}</td></tr>)}</tbody></table></div></div><div className="data-panel" id="changes"><div className="panel-header"><div><p className="kicker">Diff stream</p><h2>Change log</h2></div></div><div className="change-list">{data.changes.length === 0 ? <div className="empty-change">No changes detected yet.</div> : data.changes.map((change) => <div key={change.id} className="change-item"><div className="change-top"><span>{change.field_changed}</span><time>{formatTimestamp(change.detected_at)}</time></div><p><b>Old</b>{compactSummary(change.old_value)}</p><p><b>New</b>{compactSummary(change.new_value)}</p></div>)}</div></div></section>
      </div>
    </div></main>
  );
}
