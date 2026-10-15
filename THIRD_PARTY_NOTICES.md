# Third-party software — Desktop Edition

Application code is covered by the repository MIT LICENSE. The RC4-derived collector and the project-owned boundary repair retain their Git authorship and history. The original desktop icon is maintained in desktop/assets/icon.svg and rasterized during development; no third-party font files are bundled.

| Component | Version | Role | License |
| --- | --- | --- | --- |
| Electron | 44.7.0 | Bundled Chromium/Node desktop runtime | MIT; underlying Chromium, Node, FFmpeg and other components retain their upstream notices |
| electron-builder | 26.15.3 | Development-only Windows packaging | MIT |
| @electron/fuses | 2.1.3 | Development-only executable hardening | MIT |
| Playwright | 1.56.1 | Development-only automated UI testing | Apache-2.0 |
| NSIS | As pinned by electron-builder | Installer/uninstaller engine | zlib/libpng license with component-specific upstream notices |

The portable directory and installer retain Electron's LICENSE and licenses.chromium.html. A generated dependency-license inventory and package file manifest accompany the audit handoff. Runtime application code has no npm production dependencies. The build dependency tree currently reports a moderate sprintf-js formatting denial-of-service advisory propagated through development packaging modules; the latest published sprintf-js is affected. It is not included in the application ASAR. Do not treat a zero-production-dependency count as a complete binary security audit.

Sources: https://www.electronjs.org/ ; https://github.com/electron-userland/electron-builder ; https://github.com/electron/fuses ; https://github.com/microsoft/playwright ; https://nsis.sourceforge.io/License . No private code, logs, settings, credentials or Hook event spool belongs in a distribution.

Desktop Pet Mode adds no npm/runtime dependencies or redistributed fonts. Its four pixel atlases are AI-assisted project-created artwork, not downloaded game assets. Generation prompts, unmodified source hashes, compiled hashes, build method and rights-review limitations are documented in docs/PET_RESOURCE_LICENSES.md and docs/PET_STYLE_RESEARCH.md. Raw originals ship separately in ArtSources, never with user profiles. This record is not an originality or third-party-rights certification. Imported packs retain their user's origin/license declaration locally and are not silently republished.
