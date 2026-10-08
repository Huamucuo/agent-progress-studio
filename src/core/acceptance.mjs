const safePath = p => typeof p === 'string' && p.length > 0 && p.length < 300 && !/^(?:[a-z]:|[\\/])/i.test(p) && !p.split(/[\\/]/).includes('..') && !p.includes('\0');
export function validateManifest(m) {
  if (!m || m.version !== 1 || typeof m.taskId !== 'string' || !m.taskId || !Array.isArray(m.criteria) || m.criteria.length > 100) throw new Error('Invalid acceptance manifest');
  const ids = new Set();
  for (const c of m.criteria) {
    if (!c || !/^[a-zA-Z0-9_.-]{1,80}$/.test(c.id) || ids.has(c.id) || typeof c.title !== 'string' || !c.title.trim()) throw new Error('Invalid or duplicate criterion ID/title');
    ids.add(c.id);
    if (c.weight !== undefined && (!Number.isFinite(c.weight) || c.weight <= 0 || c.weight > 100)) throw new Error('Weight must be in (0, 100]');
    if (c.files !== undefined && (!Array.isArray(c.files) || c.files.length > 100 || !c.files.every(safePath))) throw new Error('Invalid criterion file path');
    if (c.checks !== undefined && (!Array.isArray(c.checks) || c.checks.length > 100 || !c.checks.every(x => typeof x === 'string' && x.length > 0 && x.length < 200))) throw new Error('Invalid test check IDs');
    if (c.requiresHuman !== undefined && typeof c.requiresHuman !== 'boolean') throw new Error('requiresHuman must be boolean');
  }
  return m;
}

/** Coverage is acceptance weight only. It is deliberately independent of agent events. */
export function evaluateAcceptance(manifest, evidence = {}, reviews = {}) {
  const counts = { implemented: 0, auto_verified: 0, awaiting_human: 0, failed: 0, unknown: 0, accepted: 0 };
  if (!manifest) return { criteria: [], counts, percent: null, earnedWeight: 0, totalWeight: 0, met: 0, total: 0 };
  validateManifest(manifest);
  const criteria = manifest.criteria.map(c => {
    const checks = c.checks || [];
    const results = checks.map(id => evidence.report?.tests?.find(t => t.id === id));
    const implemented = (c.files || []).length > 0 && c.files.every(p => evidence.files?.includes(p));
    const automated = checks.length > 0 && (!(c.files || []).length || implemented) && evidence.report?.current === true && results.every(r => r?.status === 'passed');
    const failed = evidence.report?.current === true && results.some(r => r?.status === 'failed');
    const review = reviews[c.id];
    const currentReview = review && review.fingerprint === evidence.fingerprint && review.manifestHash === evidence.manifestHash ? review : null;
    let status = 'unknown';
    if (implemented) status = 'implemented';
    if (automated) status = 'auto_verified';
    if (c.requiresHuman && (automated || (checks.length === 0 && implemented))) status = 'awaiting_human';
    if (status === 'awaiting_human' && currentReview?.decision === 'accept') status = 'accepted';
    if (failed || currentReview?.decision === 'reject') status = 'failed';
    counts[status]++;
    return { ...c, weight: c.weight ?? 1, status, implemented, automated, results, review: currentReview, reviewStale: !!review && !currentReview };
  });
  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
  const met = criteria.filter(c => ['auto_verified', 'accepted'].includes(c.status));
  const earnedWeight = met.reduce((sum, c) => sum + c.weight, 0);
  return { taskId: manifest.taskId, title: manifest.title, criteria, counts, total: criteria.length, met: met.length, earnedWeight, totalWeight,
    percent: totalWeight ? Math.floor(earnedWeight / totalWeight * 1000) / 10 : null };
}
