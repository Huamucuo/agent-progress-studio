import path from 'node:path';
import { SessionAccess, sessionRef } from '../src/core/session-access.mjs';
import { ResourceRegistry, canonicalPath } from '../src/core/resource-registry.mjs';
import { DataGateway } from '../src/collectors/data-gateway.mjs';

export async function logOptions(file, id, grant = true) {
  const marker = path.sep + 'sessions' + path.sep, archived = path.sep + 'archived_sessions' + path.sep;
  const index = Math.max(file.indexOf(marker), file.indexOf(archived));
  if (index < 0) throw new Error('Fixture logs must live in a registered store');
  const home = file.slice(0, index), access = new SessionAccess(), registry = new ResourceRegistry({ codexHomes: [home] });
  const ref = sessionRef('local:' + await canonicalPath(home), id), gateway = new DataGateway(access, registry);
  if (grant) await access.change(ref, { origin: 'codex', content: true }, access.revision);
  return { gateway, ref, access };
}
export async function evidenceOptions(root, options = {}) {
  const access = new SessionAccess(), registry = new ResourceRegistry(options), canonical = await registry.workspace(root);
  const ref = sessionRef('cli:' + canonical, 'workspace'), gateway = new DataGateway(access, registry);
  await access.change(ref, { evidence: true, root: canonical }, access.revision);
  return { context: await gateway.evidence(ref, canonical), root: canonical, access, ref };
}
export const scope = app => ({ authorityInstanceId: app.service.access.instanceId, expectedPolicyRevision: app.service.access.revision, selectionRevision: app.service.selectionRevision });
