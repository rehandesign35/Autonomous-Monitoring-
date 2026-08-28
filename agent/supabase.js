const { createClient } = require('@supabase/supabase-js');

function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_KEY in your local .env file.');
  }

  return createClient(supabaseUrl, supabaseKey);
}

async function saveSnapshot({ sourceUrl, rawJson }) {
  const supabase = getSupabaseClient();

  const payload = {
    run_timestamp: new Date().toISOString(),
    raw: rawJson,
    source_url: sourceUrl,
  };

  const { data, error } = await supabase
    .from('snapshots')
    .insert(payload)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function getLastSnapshot() {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('snapshots')
    .select('*')
    .order('run_timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return data || null;
}

async function logChange({ snapshotId, fieldChanged, oldValue, newValue }) {
  const supabase = getSupabaseClient();

  const payload = {
    snapshot_id: snapshotId,
    field_changed: fieldChanged,
    old_value: oldValue,
    new_value: newValue,
    detected_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('changes').insert(payload);

  if (error) {
    throw error;
  }
}

async function logRun({ status, errorMessage, durationMs }) {
  const supabase = getSupabaseClient();

  const payload = {
    run_timestamp: new Date().toISOString(),
    status,
    error_message: errorMessage || null,
    duration_ms: Number(durationMs || 0),
  };

  const { error } = await supabase.from('run_log').insert(payload);

  if (error) {
    throw error;
  }
}

module.exports = {
  getSupabaseClient,
  saveSnapshot,
  getLastSnapshot,
  logChange,
  logRun,
};
