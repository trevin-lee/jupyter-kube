# Version Management

This monorepo uses a centralized version management system with `version.json` as the single source of truth.

## Single Source of Truth

The version number for the entire project is stored in `/version.json`:

```json
{
  "version": "1.0.4",
  "description": "Single source of truth for version numbers across the jupyter-kube monorepo"
}
```

## Files That Use Version

The version from `version.json` is synced to:
- `app/package.json` - Electron app version
- `home/package.json` - Website version
- `home/src/app/page.tsx` - VERSION constant and UI displays

## Updating Version

### Method 1: Update and Sync (Recommended)
```bash
# Update version in version.json
./scripts/update-version.sh 1.0.5

# Sync to all files
./scripts/sync-versions.sh

# Commit and tag
git commit -am "Update version to 1.0.5"
git tag v1.0.5
git push origin v1.0.5
```

### Method 2: Direct Edit
1. Edit `version.json` manually
2. Run `./scripts/sync-versions.sh`
3. Commit and tag

## Automatic Sync

The GitHub Actions workflow automatically syncs versions before building:
- Runs `scripts/prebuild.js` before each build
- Ensures build artifacts always use the correct version from `version.json`

## Scripts

### `scripts/update-version.sh <version>`
Updates the version in `version.json`

### `scripts/sync-versions.sh`
Syncs the version from `version.json` to all other files

### `scripts/prebuild.js`
Node.js script that syncs versions (used by CI/CD)

## Best Practices

1. **Always update `version.json` first** - It's the single source of truth
2. **Run sync before building** - Ensures consistency
3. **Use semantic versioning** - MAJOR.MINOR.PATCH
4. **Tag releases** - Always create a git tag matching the version

## Troubleshooting

If versions are out of sync:
```bash
# Check current version
cat version.json

# Force sync all files
./scripts/sync-versions.sh

# Verify sync
grep -n "version" app/package.json home/package.json
grep -n "VERSION" home/src/app/page.tsx
``` 