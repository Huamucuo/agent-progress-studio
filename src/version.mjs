import { readFileSync } from 'node:fs';
// Static build metadata; never a session/evidence I/O entry point.
export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
