# Third-party notices

Production npm dependencies: **none**. The application uses Node.js built-in modules and the browser platform. Node.js, Git and browsers are independently installed tools and are not bundled in the release ZIP.

## Fonts / 字体

The UI's CSS names `Inter`, `Segoe UI`, `Microsoft YaHei`, `system-ui`, `sans-serif`, `Cascadia Code`, `Consolas` and `monospace` as locally available font families/fallbacks. There are no `@font-face` declarations, font URLs or embedded font data in the application's CSS. Naming a family does not install or bundle it; if absent, the browser uses the next available fallback.

本项目未包含或再分发 TTF、OTF、TTC、WOFF、WOFF2 或 EOT 字体文件，也没有复制 Windows 字体。显示使用用户电脑已有的字体或浏览器回退。本轮候选包的文件清单和字体二进制检查会记录在包外的审计附件中；开发依赖及其资源不进入发布 ZIP。此说明是分发内容核查，不是对用户电脑上已安装字体来源的审计。

Optional development dependencies (locked in package-lock.json):

| Package | Version | License | Purpose |
| --- | --- | --- | --- |
| playwright | 1.56.1 | Apache-2.0 | Real-browser UI tests |
| playwright-core | 1.56.1 | Apache-2.0 | Playwright implementation |
| fsevents | 2.3.2 | MIT (lockfile metadata) | Optional macOS-only Playwright dependency; not installed on Windows |

Playwright licenses were checked in the installed packages; fsevents is recorded from the lockfile and was not installed or executed. Original package LICENSE and NOTICE files remain in node_modules when installed. node_modules and browser binaries are excluded from the release ZIP.

Competitor code, assets and documentation are not incorporated into this source distribution. Public research links and license findings are recorded separately in docs/COMPETITORS.md. Official schemas were generated for inspection with the local CLI and are not distributed as project implementation.


## Public-preview license review — 2026-10-12

The existing project MIT text is retained without relicensing application files. Upstream locked-version texts were checked from primary sources: [Playwright v1.56.1 LICENSE](https://github.com/microsoft/playwright/blob/v1.56.1/LICENSE), [its NOTICE](https://github.com/microsoft/playwright/blob/v1.56.1/NOTICE), and [fsevents v2.3.2 LICENSE](https://github.com/fsevents/fsevents/blob/v2.3.2/LICENSE). Microsoft's NOTICE attributes derived Puppeteer code; installed Playwright packages also contain extensive ThirdPartyNotices.txt entries. These licenses are not all Apache-2.0. See [the complete component inventory and distribution boundary](docs/DEPENDENCY-LICENSES.md).

The proposed source contains no installed dependencies, package tarballs, fonts, browser binaries or generated protocol schemas. License notices stay with any separately installed or redistributed development dependency; MIT for this project cannot replace them. The previous independent provenance review found no obvious direct competitor copying within its inspected scope, which does not prove every possible origin or universal originality. Current runtime defects and release gates are described separately in [known issues](docs/KNOWN-ISSUES.md).
