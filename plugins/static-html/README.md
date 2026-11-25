# Static HTML

The local `static-html` emitter publishes standalone HTML files from `content/` under `/static/`, preserving their names and folders. For example, `content/software/radicle/identity-lookup-map.html` becomes `/static/software/radicle/identity-lookup-map.html`. The files are served unchanged, without Quartz's page layout.

The plugin respects Quartz's `ignorePatterns` and Git ignore rules. Like other assets, these files are public even if they are not linked from a published note. Keep any referenced CSS, JavaScript, and other assets at URLs that work from the published location.

Do not use the same path under `content/` and `quartz/static/`; the build reports that conflict rather than overwriting either file.
