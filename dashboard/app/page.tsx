import { supabase } from '@/lib/supabase';

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
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <header className="mb-8 flex items-center justify-between border-b border-slate-800 pb-5">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-emerald-400">Monitoring</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Autonomous pricing monitor</h1>
          </div>
          <div className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-sm text-slate-300">
            Mock target: SunPeak Solar
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-sm text-slate-400">Total runs</p>
            <p className="mt-3 text-3xl font-semibold text-white">{data.stats.totalRuns}</p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-sm text-slate-400">Success rate</p>
            <p className="mt-3 text-3xl font-semibold text-emerald-400">{data.stats.successRate}%</p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-sm text-slate-400">Changes detected</p>
            <p className="mt-3 text-3xl font-semibold text-amber-300">{data.stats.totalChanges}</p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-sm text-slate-400">Blocks / failures</p>
            <p className="mt-3 text-3xl font-semibold text-rose-400">{data.stats.blockedRuns + data.stats.failedRuns}</p>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Resilience test</p>
              <h2 className="mt-2 text-xl font-semibold text-white">v1 → v2 layout-change validation</h2>
            </div>
            <span className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-100">
              Proof captured
            </span>
          </div>
          <p className="mt-3 max-w-4xl text-sm text-emerald-100/90">
            The mock target was redesigned from the original card-based v1 layout to a new v2 structure without changing the pricing content or agent code. The proof artifact is stored in the project docs and demonstrates that extraction still resolves the same company, pricing tiers, and last-updated values after the redesign.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a href="/proof/resilience-proof.md" className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-2 text-sm font-medium text-emerald-100">
              Open proof doc
            </a>
            <a href="/proof/before-snapshot.json" className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm font-medium text-slate-200">
              Before snapshot
            </a>
            <a href="/proof/after-snapshot.json" className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm font-medium text-slate-200">
              After snapshot
            </a>
          </div>
        </section>

        <section className="mt-8 grid gap-8 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <h2 className="text-lg font-semibold text-white">Run history</h2>
              <span className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-300">
                Live from Supabase
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-950 text-slate-400">
                  <tr>
                    <th className="px-5 py-3 font-medium">Timestamp</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Duration</th>
                    <th className="px-5 py-3 font-medium">What happened</th>
                  </tr>
                </thead>
                <tbody>
                  {data.runs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-8 text-slate-400">
                        No run data yet. The scheduled action has not produced a snapshot.
                      </td>
                    </tr>
                  ) : (
                    data.runs.map((run) => (
                      <tr key={run.id} className="border-t border-slate-800">
                        <td className="px-5 py-3 text-slate-200">{formatTimestamp(run.run_timestamp)}</td>
                        <td className="px-5 py-3">
                          <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                            run.status === 'success'
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : run.status === 'blocked'
                                ? 'bg-amber-500/15 text-amber-300'
                                : run.status === 'failure'
                                  ? 'bg-rose-500/15 text-rose-300'
                                  : 'bg-sky-500/15 text-sky-300'
                          }`}>
                            {run.status}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-slate-300">{run.duration_ms ? `${run.duration_ms} ms` : '—'}</td>
                        <td className="px-5 py-3 text-slate-300">{run.error_message || 'Monitoring run completed normally.'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900">
            <div className="border-b border-slate-800 px-5 py-4">
              <h2 className="text-lg font-semibold text-white">Change log</h2>
            </div>

            <div className="space-y-3 p-4">
              {data.changes.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950 p-4 text-sm text-slate-400">
                  No changes detected yet.
                </div>
              ) : (
                data.changes.map((change) => (
                  <div key={change.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="text-xs uppercase tracking-[0.2em] text-slate-400">{change.field_changed}</span>
                      <span className="text-xs text-slate-500">{formatTimestamp(change.detected_at)}</span>
                    </div>
                    <p className="text-sm text-slate-300">
                      <span className="text-slate-500">Old:</span> {compactSummary(change.old_value)}
                    </p>
                    <p className="mt-2 text-sm text-slate-300">
                      <span className="text-slate-500">New:</span> {compactSummary(change.new_value)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
