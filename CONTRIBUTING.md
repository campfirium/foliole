# Contributing to Foliole

Thanks for helping improve Foliole.

## Where to Start

- Report bugs with the GitHub bug report template.
- Share feature ideas in GitHub Discussions so people can compare workflows and upvote.
- Ask setup and usage questions in the Q&A discussion category.

## Local Development

Install dependencies:

```bash
npm ci
```

Use the focused validation command that matches your change. For broad desktop, Android, or shared changes, use the repository quality scripts documented in `AGENTS.md`.

## Feature Previews

Register new user-facing features in `src/shared/config/featurePreviews.json` with `"visibility": "internal"`. Set `labelKey` to the localized feature name. Use `useFeaturePreviewVisible` in reactive entry points and `isFeaturePreviewVisible` in synchronous routing. Development and internal builds can access features at every stage.

- `internal` keeps the feature in development and internal builds.
- `experimental` offers an off-by-default switch in Experimental features on public builds. Each device remembers its own choice.
- `public` enables the feature for everyone and removes the switch.

Review all three groups from `npm run check:release-candidate` during release confirmation. Rebuild and verify the release candidate after changing a feature's visibility.

## Pull Requests

- Keep changes focused on one user-visible behavior, data contract, or maintenance task.
- Include validation notes in the pull request template.
- Do not edit generated build output directly.
- Keep user-facing copy intentional and consistent with the existing product language.

## Security

Do not open public issues for suspected vulnerabilities. Please follow `SECURITY.md`.
