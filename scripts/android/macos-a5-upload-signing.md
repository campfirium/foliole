# Android upload signing

The existing `bundle-release` action accepts an explicit external signing configuration.
The configuration and keystore must be outside the source repository and private to
their owner (0600). Keep their containing directory private (0700).

For macOS Keychain storage, use this configuration shape:

```json
{
  "alias": "upload",
  "keystore": "/absolute/private/path/upload.jks",
  "keychain": {
    "service": "com.campfirium.foliole.android.upload",
    "account": "upload"
  }
}
```

Set `FOLIOLE_ANDROID_UPLOAD_SIGNING_CONFIG` to the configuration's absolute path
when invoking the existing `bundle-release` action. The macOS login Keychain
must be unlocked and accessible. A missing or inaccessible password fails signing;
the action does not generate a replacement key or fall back to another password.

Existing configurations may instead specify `passwordFile`, an absolute path to
a private external password file. Specify exactly one of `keychain` and
`passwordFile`. Passwords are passed only to the signing tools, never as command
arguments or in artifact receipts.

Keep an encrypted recovery copy of the keystore and a recoverable password before
relying on this setup for distribution. A public certificate cannot recover the
private key. Restoring on another Mac requires the keystore, its alias, and the
matching password in that Mac's Keychain. Local signing does not register an
upload certificate with Google Play or prove Play acceptance.
