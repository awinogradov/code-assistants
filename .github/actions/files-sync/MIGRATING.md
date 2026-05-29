# MIGRATING

## 1.0.0

### Breaking changes

- Consumers must now pass an explicit `token` input (PAT or GitHub App installation token) to both files-sync and agents-rules-sync. Pinning to an existing tag retains the old default behavior until upgrade.

## From 1.0.0 to 2.0.0

### Breaking changes

- inputs token and github_token are renamed to bot_token; consumers must
