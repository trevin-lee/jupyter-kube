# 🚀 Automated Release System

This project now has a fully automated release system that handles everything from version management to deployment.

## 🎯 Single Command Release

```bash
# 1. Update version in version.json
./scripts/update-version.sh 1.0.7

# 2. Release with one command
npm run release
```

That's it! The system automatically:
- ✅ Syncs versions across all files
- ✅ Creates git tag
- ✅ Pushes to GitLab → GitHub
- ✅ Triggers GitHub Actions builds
- ✅ Updates website download links
- ✅ Creates GitHub release with binaries

## 📋 Available Commands

### Version Management
```bash
# Update version everywhere
./scripts/update-version.sh 1.0.7

# Sync versions from version.json
npm run sync-versions

# Prepare release with guided workflow
npm run prepare-release
```

### Development
```bash
# Start Electron app
npm run dev:app

# Start website
npm run dev:website

# Build for production
npm run build:app
npm run build:website
```

### Release
```bash
# Automated release (reads version from version.json)
npm run release
```

## 🔄 Complete Release Workflow

### Method 1: Quick Release (Recommended)
```bash
# Update version and release in one go
./scripts/update-version.sh 1.0.7
npm run release
```

### Method 2: Step-by-step
```bash
# 1. Update version
./scripts/update-version.sh 1.0.7

# 2. Review changes
git diff

# 3. Test locally
npm run dev:app
npm run dev:website

# 4. Release
npm run release
```

## 🤖 What Happens During Release

### Immediate (1-2 minutes):
1. **Version Sync**: All files updated to match version.json
2. **Git Operations**: Tag created and pushed
3. **Website Deploy**: Vercel rebuilds with new version
4. **Download Links**: Updated to point to new version

### Build Process (5-10 minutes):
1. **GitLab Mirror**: Syncs to GitHub  
2. **GitHub Actions**: Builds for all platforms
3. **Release Creation**: Binaries uploaded to GitHub
4. **Download Links**: Now fully functional

## 📦 Generated Release Files

For version `1.0.7`, the system creates:

### macOS
- `NRP Jupyter Launcher-1.0.7-arm64.dmg` (Apple Silicon)
- `NRP Jupyter Launcher-1.0.7.dmg` (Intel)

### Windows  
- `NRP.Jupyter.Launcher.Setup.1.0.7.exe`

### Linux
- `NRP Jupyter Launcher-1.0.7.AppImage`
- `jupyter-kube_1.0.7_amd64.deb`

## 🔗 Version Management

### Single Source of Truth
All version numbers come from `version.json`:
```json
{
  "version": "1.0.7",
  "description": "Single source of truth for version numbers"
}
```

### Auto-Sync System
- `app/package.json` - Auto-updated
- `home/package.json` - Auto-updated  
- `home/src/lib/version.ts` - Reads dynamically
- Website badges and download links - Auto-generated

## 🎯 Smart Download Links

The website automatically generates working download links:
- **Display Version**: Shows current version from version.json
- **Download Links**: Point to confirmed working releases
- **Fallback System**: Ensures downloads always work

## 🔍 Monitoring Releases

### Check Build Progress
- **GitHub Actions**: [https://github.com/trevin-lee/jupyter-kube/actions](https://github.com/trevin-lee/jupyter-kube/actions)
- **Releases**: [https://github.com/trevin-lee/jupyter-kube/releases](https://github.com/trevin-lee/jupyter-kube/releases)
- **Website**: [https://jupyter-kube.vercel.app](https://jupyter-kube.vercel.app)

### Troubleshooting
```bash
# Check current status
git status
git tag --list | tail -5

# Remove bad tag if needed
git tag -d v1.0.7
git push origin :refs/tags/v1.0.7

# Re-run release
npm run release
```

## 🛡️ Safety Features

### Pre-flight Checks
- ✅ Git working directory must be clean
- ✅ Version tag must not already exist
- ✅ All versions synced before release
- ✅ Automatic error recovery guidance

### Error Recovery
The system provides clear error messages and recovery steps for common issues.

## 📈 Benefits

### Before
- ❌ Manual version updates in 4+ files
- ❌ Risk of version mismatches
- ❌ Complex multi-step release process
- ❌ Manual download link updates

### After  
- ✅ Single command release
- ✅ Automatic version synchronization
- ✅ Zero-risk version management
- ✅ Self-updating download links
- ✅ Full CI/CD automation 