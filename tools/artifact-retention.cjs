// Temporary Actions files are disposable; release assets and the live site are durable.
const DAY = 24 * 60 * 60 * 1000;
const releaseFiles = ['slot.sp-System.zip', 'slot.sp-SD2.zip', 'SHA256SUMS', 'build-info.json'];
function completeRelease(release) {
  return release && !release.draft && releaseFiles.every(name => release.assets?.some(a => a.name === name && a.size > 0));
}
function planArtifacts(artifacts, runs, releases, now = Date.now(), activePaths = null) {
  const completed = artifacts.filter(a => runs.get(a.workflow_run?.id)?.status === 'completed');
  const newest = new Map();
  const newestSet = new Map();
  const pathOf = run => run.path?.split('@')[0];
  for (const a of completed) {
    const run = runs.get(a.workflow_run.id), path = pathOf(run);
    if (path && run.conclusion === 'success' && (!newestSet.has(path) || run.id > newestSet.get(path))) newestSet.set(path, run.id);
  }
  for (const a of completed) {
    if (!newest.has(a.name) || a.created_at > newest.get(a.name).created_at) newest.set(a.name, a);
  }
  return completed.flatMap(a => {
    const run = runs.get(a.workflow_run.id);
    const age = now - Date.parse(a.created_at);
    if (!Number.isFinite(age) || age < 0) return [];
    const published = a.name === 'release-downloads' && run.head_branch === 'main' && releases.some(r => completeRelease(r)
      && (r.target_commitish === run.head_sha || r.tag_name.endsWith('-' + run.head_sha.slice(0, 7))));
    const deployed = a.name === 'github-pages' && run.conclusion === 'success';
    const path = pathOf(run);
    const superseded = path ? newestSet.has(path) && newestSet.get(path) !== run.id : newest.get(a.name).id !== a.id;
    const obsolete = path && activePaths && !activePaths.has(path);
    const reason = published ? 'copied to release assets' : deployed ? 'completed Pages bundle'
      : age >= DAY ? 'older than 24 hours' : obsolete ? 'retired workflow' : superseded ? 'superseded workflow set' : null;
    return reason ? [{...a, reason}] : [];
  });
}
async function run({github, context, core, dryRun = true}) {
  const {owner, repo} = context.repo;
  if (owner !== 'jgraving' || !['slot.sp', 'slot-cart-studio'].includes(repo)) throw new Error('Unexpected repository');
  const releases = repo === 'slot.sp' ? await github.paginate(github.rest.repos.listReleases, {owner, repo, per_page: 100}) : [];
  // Never clean historical build files until a complete durable download is available.
  if (repo === 'slot.sp') {
    const {data: latest} = await github.rest.repos.getLatestRelease({owner, repo});
    if (!completeRelease(latest)) throw new Error('Latest release is incomplete; leave artifacts untouched');
    core.info(`Durable downloads verified: ${latest.html_url}`);
  }
  const artifacts = await github.paginate(github.rest.actions.listArtifactsForRepo, {owner, repo, per_page: 100});
  const ids = [...new Set(artifacts.map(a => a.workflow_run?.id).filter(Boolean))];
  const runs = new Map();
  for (let i = 0; i < ids.length; i += 5) {
    await Promise.all(ids.slice(i, i + 5).map(async run_id => {
      try { runs.set(run_id, (await github.rest.actions.getWorkflowRun({owner, repo, run_id})).data); }
      catch (error) { core.warning(`Cannot verify run ${run_id}; retain its artifacts (${error.status || 'request failed'})`); }
    }));
  }
  const {data: directory} = await github.rest.repos.getContent({owner, repo, path: '.github/workflows'});
  if (!Array.isArray(directory)) throw new Error('Cannot verify current workflows');
  const activePaths = new Set(directory.filter(f => f.type === 'file' && /\.ya?ml$/.test(f.name)).map(f => f.path));
  const selected = planArtifacts(artifacts, runs, releases, Date.now(), activePaths);
  let deleted = 0, bytes = 0;
  for (const a of selected) {
    // Recheck immediately before deletion: a rerun may have started during the audit.
    const {data: current} = await github.rest.actions.getWorkflowRun({owner, repo, run_id: a.workflow_run.id});
    if (current.status !== 'completed') continue;
    core.info(`${dryRun ? 'Would delete' : 'Delete'} ${a.id} ${a.name}: ${a.reason} (${a.size_in_bytes} bytes)`);
    if (!dryRun) {
      try { await github.rest.actions.deleteArtifact({owner, repo, artifact_id: a.id}); }
      catch (error) { if (error.status !== 404) throw error; }
    }
    deleted++; bytes += a.size_in_bytes;
  }
  await core.summary.addHeading('Generated artifact retention')
    .addRaw(`${dryRun ? 'Dry run' : 'Cleanup'}: ${deleted} artifacts, ${(bytes / 2**30).toFixed(3)} GiB. Active runs are protected. Latest temporary copies expire after 24 hours; release assets and the deployed website are untouched.\n`)
    .write();
}
module.exports = {DAY, completeRelease, planArtifacts, run};
