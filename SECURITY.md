# Security and privacy reporting

`0.1.1-rc.4` is a development preview with reviewed-scope remediation status and unverified real-host compatibility. See [KNOWN-ISSUES.md](docs/KNOWN-ISSUES.md). There is no stable supported-version promise or response-time SLA in this preview.

Keep reports minimal and synthetic. Do not attach real sessions, private task text, permissions, authentication data, exports or screenshots with local paths/account details. If the maintainer provides a private reporting channel or enables GitHub private vulnerability reporting, use it. No private reporting channel has been configured by this local preparation. Otherwise ask for one using only a brief non-sensitive description.

Permission, subprocess, Git input, file alias, Hook revocation and RPC exception changes require focused regressions and independent review. A passing test suite cannot override a known reproducible finding. The application is not an operating-system sandbox and cannot retract bytes or exports already saved elsewhere.
