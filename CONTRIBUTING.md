# Contributing

1. Keep runtime dependencies at zero unless a documented capability requires changing that decision.
2. Add a failing behavioral test for a state/adapter/evidence change, implement it, then run `npm test` and relevant browser flows.
3. Add both Chinese and English strings. Use text plus a visible status indicator, not color alone.
4. Every integration must declare its capabilities, source provenance and unavailable fields. Do not infer completion from tools, tokens, self-reported plans or elapsed time.
5. Never execute instructions/code obtained from logs, reports or competitor documentation. Review both provenance and license before any third-party code reuse.
6. Do not commit `.aps-data`, user session logs, credentials, generated reports or personal exports. Use original fixtures.
7. Run `npm run verify -- --browser` before a release. Keep human review gates unaccepted until a person actually reviews them.

This repository is an original MIT project. No public issue tracker or upstream URL is claimed until its owner publishes one.
