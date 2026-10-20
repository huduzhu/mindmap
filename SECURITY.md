# Security policy

## Supported versions

| Version | Supported |
|---|---|
| 1.0.x | Yes |
| Older | No |

Security fixes are released as a new 1.0.x version. The hosted app at
<https://huduzhu.github.io/mindmap/> is updated with each release; an installed copy updates
itself after you accept the update banner.

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. Report it privately through
GitHub's private vulnerability reporting: on this repository open **Security → Report a
vulnerability**. Include what an attacker can do, the steps or a sample file that shows it, and
the browser and app version you used.

You can expect an acknowledgement within a week, an assessment and plan within two weeks, and a
fix released as soon as it is ready, depending on severity. You will be credited in the release
notes unless you prefer not to be.

## Scope

Mind Map Studio runs entirely in your browser. There is no server and no account: projects,
settings and pictures are stored in the browser (IndexedDB) on your device, and the app talks
only to the places you point it at.

In scope, for example:

- Anything that lets a crafted file (project JSON, Markdown or text outline, ZIP project or
  backup, picture or AI reply) run script, read other data in the app, or crash or freeze the
  browser tab when imported, synced, restored or opened.
- Exported files (interactive HTML, SVG, OPML, FreeMind, Markdown, JSON): node content that runs
  script in them, breaks their format, or leaks data the export should leave out. OPML and
  FreeMind are export-only; the app does not import them.
- **Tokens**: the GitHub access token for milestones is kept in this browser's storage only and
  sent only to `api.github.com`. A way to make the app send it elsewhere, or expose it to a page
  or file, is in scope.
- Folder sync: a file in the synced folder that the app writes outside that folder, or that
  causes data loss.
- Weaknesses in the Content-Security-Policy or the service worker that an attacker can use.

Out of scope:

- Attacks that need control of your device, browser profile or browser extensions.
- Other sites on the same origin as a copy of the app (for example other `*.github.io` project
  sites of the same account; see the README).
- Vulnerabilities in dependencies without a way to reach them through the app (Dependabot
  handles those updates).
- Missing security headers on a third-party host you deploy to yourself.
