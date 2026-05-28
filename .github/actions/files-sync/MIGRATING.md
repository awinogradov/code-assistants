# MIGRATING

## 1.0.0

### Breaking changes

- Consumers must now pass an explicit `token` input (PAT or GitHub App installation token) to both files-sync and agents-rules-sync. Pinning to an existing tag retains the old default behavior until upgrade.
