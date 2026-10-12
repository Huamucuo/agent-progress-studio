# Roadmap

This sequence is a development plan, not a release promise.

| State | Work | Required evidence |
| --- | --- | --- |
| Implemented; statically reviewed | Git signature execution, Hook alias/revocation reads, RPC exception handling and experimental capability gating | 23 baseline reproductions plus successful repair cases; 133 local Node checks; exact immutable independent fix review. |
| Next | Run proposed Windows/Ubuntu × Node 22.17.0/24.17.0 CI | Actual hosted results for the approved public source; do not infer portability from a proposed matrix. |
| Next | Renew real Codex and Work manual acceptance | Separately authorized synthetic/new host sessions, host versions and sanitized observations; never private sessions in public CI. |
| Next | Confirm UI and source-selection behavior against reviewed host contracts | Supported log/protocol shapes, explicit experimental opt-in and missing-field behavior. |
| Later | Broader host adapters or MCP integration | A supported contract, privacy design, independent review and a tested prototype. |
| Later | Immutable distributable candidates and stable releases | Reviewed commit, license/file manifest, generated package hashes, host/manual acceptance and explicit release approval. |

Use narrow feature branches, Pull Requests, independent review and required CI. Continue recording known limitations. Source publication and a green synthetic suite do not establish a stable integration. See [development procedure](docs/DEVELOPMENT.md).
