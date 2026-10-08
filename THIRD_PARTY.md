# Third-party notices

Production npm dependencies: **none**. The application uses Node.js built-in modules and the browser platform. Node.js, Git and browsers are independently installed tools and are not bundled in the release ZIP.

Optional development dependencies (locked in package-lock.json):

| Package | Version | License | Purpose |
| --- | --- | --- | --- |
| playwright | 1.56.1 | Apache-2.0 | Real-browser UI tests |
| playwright-core | 1.56.1 | Apache-2.0 | Playwright implementation |
| fsevents | 2.3.2 | MIT (lockfile metadata) | Optional macOS-only Playwright dependency; not installed on Windows |

Playwright licenses were checked in the installed packages; fsevents is recorded from the lockfile and was not installed or executed. Original package LICENSE and NOTICE files remain in node_modules when installed. node_modules and browser binaries are excluded from the release ZIP.

Competitor code, assets and documentation are not incorporated into this source distribution. Public research links and license findings are recorded separately in docs/COMPETITORS.md. Official schemas were generated for inspection with the local CLI and are not distributed as project implementation.
