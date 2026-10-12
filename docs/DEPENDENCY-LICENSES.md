# Dependency and asset license inventory

Checked on 2026-10-12 for the unchanged third-party dependency graph of `0.1.1-rc.4`. The runtime range is corrected to `^22.17.0 || ^24.2.0`; package/lockfile dependency versions and notices are retained. Project implementation retains its existing MIT license. Recommendation: **keep MIT** for the implementation already covered by that license; do not relicense third-party components or erase their notices.

## Locked package graph

| Component | Version | License and primary source | Distribution boundary |
| --- | --- | --- | --- |
| Agent Progress Studio implementation, UI and authored fixtures | 0.1.1-rc.4 | Existing [MIT](../LICENSE); [OSI MIT text](https://opensource.org/license/mit) | Included as project source. The original license bytes are retained. |
| playwright | 1.56.1 | [Apache-2.0 license](https://github.com/microsoft/playwright/blob/v1.56.1/LICENSE); [Microsoft NOTICE](https://github.com/microsoft/playwright/blob/v1.56.1/NOTICE) | Optional development tool; installed files and binaries are excluded from this source preview. |
| playwright-core | 1.56.1 | Same upstream [Apache-2.0 license](https://github.com/microsoft/playwright/blob/v1.56.1/LICENSE) and NOTICE | Transitive development tool; excluded from source preview. |
| fsevents | 2.3.2 | [MIT license at its tag](https://github.com/fsevents/fsevents/blob/v2.3.2/LICENSE) | Optional macOS-only dependency from the lockfile; not installed or run on this Windows host. |
| Node.js, Git, Edge/other browsers | Independently installed | Respective upstream tool licenses | Referenced execution tools, not bundled or relicensed. |
| Fonts | System fallbacks | No font files included | CSS family names use locally available fonts; no copied Windows fonts, font URLs or font-face assets. |
| Logo | Source SVG | Existing project MIT scope | Included unchanged; no external image or competitor asset is imported by preparation. |
| GitHub checkout/setup-node action definitions | Full commit pins in the workflow | Upstream action repositories; execution supplied by GitHub | Workflow references only; no action implementation or binaries included. |

The application has **zero runtime npm dependencies**. The lockfile has three external development-package entries. Installed development dependencies are not part of the proposed public file set, and CI's Node fixture checks do not install them.

## Embedded notices are separate licenses

Microsoft's Playwright NOTICE attributes Puppeteer-derived code. The installed packages also have their own `ThirdPartyNotices.txt`, which lists **266 component entries**: 222 in playwright and 44 in playwright-core. Each is recorded with its notice line and complete notice-file SHA256 in [DEPENDENCY-COMPONENTS.csv](DEPENDENCY-COMPONENTS.csv).

| Detected notice license | Component entries |
| --- | ---: |
| MIT | 235 |
| ISC | 22 |
| BSD-3-Clause | 5 |
| BSD-2-Clause | 2 |
| Apache-2.0 | 1 |
| CC-BY-4.0 | 1 |

These are upstream notice entries, not 266 runtime dependencies of this application. Counts include separately named/versioned entries and should not be described as unique projects. The component inventory is derived from the installed notice sections, whose LICENSE, NOTICE and ThirdPartyNotices bytes were freshly compared with the prior independently reviewed fixed package artifacts: all six notice files matched. That prior audit verified npm tarball integrity; this preparation does not claim a new full dependency-source or vulnerability audit.

## Notice-preservation rule

If any development dependency or derived part is later redistributed, retain its applicable LICENSE, NOTICE, copyright and attribution material and review the exact modified/distributed files. Apache-2.0 requires its license and relevant notices; MIT/ISC/BSD notices remain applicable to their components, and the attributed CC-BY component has separate conditions. The project's MIT text cannot replace them. Source preview publication alone does not bundle these installed tools.

No competitor implementation, package tarball, generated protocol schema, installed package, font or browser binary was added to the preview. Prior competitor provenance comparisons found no obvious direct-copying evidence in their inspected scope. This is a bounded review result, not a universal originality or legal-clearance guarantee.

Full locked distribution references: [playwright npm artifact](https://registry.npmjs.org/playwright/-/playwright-1.56.1.tgz), [playwright-core npm artifact](https://registry.npmjs.org/playwright-core/-/playwright-core-1.56.1.tgz), [fsevents npm artifact](https://registry.npmjs.org/fsevents/-/fsevents-2.3.2.tgz). Those links identify the optional upstream artifacts; no package archive is published by this source preview.
