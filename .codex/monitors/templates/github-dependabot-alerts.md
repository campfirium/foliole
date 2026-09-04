# Foliole Dependabot health: {{alertCount}} open alerts

Source: {{source}}
Repository: {{repository}}
Alert numbers: {{alertNumbers}}
High severity: {{highCount}}
Workspace: {{workspace}}

Alerts (`number | severity | package | scope | manifest | first patched version | URL`):
{{alerts}}

Treat this handoff as standing authorization to inspect and apply the narrowest local dependency repair for these alerts on the current `dev` checkout. Start by reading each current alert through the GitHub Dependabot alerts API, then confirm the resolved dependency paths with `npm ls <package> --all` and the local audit result before editing.

Only update the named vulnerable packages and necessary transitive lockfile resolutions. Security fixes may bypass the seven-day release-age window only for those named packages. Preserve unrelated dirty changes. Do not run broad `npm audit fix`, merge or adopt a remote PR branch, close or dismiss alerts, or change GitHub security settings. Stop if the repair requires a major, Electron/native, or packaging-root upgrade, unexplained lockfile churn, new dependencies, or additional GitHub permissions.

Validate the resolved trees and the repository's existing security checks. After the scoped repair is green, use `$commit-note`, push the current local `dev` normally, and verify the adoption commit exists on `origin/dev`. Never merge a Dependabot PR; GitHub should resolve matching alerts after the patched lockfile reaches the default branch.
