# Windows preflight adapter

The public remote quality entry does not select a maintainer machine. For the Windows preflight, set `FOLIOLE_WINDOWS_PREFLIGHT_ADAPTER` to an explicit local `.mjs` module path (absolute or relative to the checkout).

The module exports `createWindowsPreflightControl({ cwd })`, returning an async function that accepts the registered action arguments:

```js
['remote-preflight', '--revision', target, '--preflight-base', base]
```

The function returns `{ receipt, receiptPath }`. The public entry checks the pushed target before invoking the adapter, then verifies the receipt's exact revision, base, test cap, selected test coverage and success status. Missing configuration, adapter errors and invalid receipts stop the run without selecting another host or dispatching hosted quality.

Keep machine addresses, authentication references and personal orchestration in an ignored local module. Public source builds and Mac preflight do not need it. The registered `check` QA workspace continues to use its existing Mac preflight.
