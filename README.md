# Jupyter Kube Launcher

A desktop application for deploying JupyterLab environments to Kubernetes clusters.

## Overview

Jupyter Kube Launcher is an Electron-based desktop application that simplifies the deployment of JupyterLab environments to Kubernetes clusters. It features:

- 🚀 One-click deployment to Kubernetes
- 🔧 Hardware configuration (CPU, Memory, GPU)
- 🐍 Custom conda environment management
- 🔐 Git integration with SSH key support
- 🌐 OIDC authentication support
- 📊 Real-time deployment monitoring

## Project Structure

```
jupyter-kube/
├── app/                    # Electron desktop application
│   ├── src/               # React frontend
│   ├── electron/          # Electron main process
│   └── release/           # Built applications
├── home/                  # Marketing website (Next.js)
├── docker/                # Docker configurations for JupyterLab
└── scripts/               # Utility scripts
```

## Development

### Desktop Application

```bash
cd app

# Install dependencies
npm install

# Run in development mode
npm run dev:all

# Build for all platforms
npm run build:all

# Build for specific platform
npm run build:mac
npm run build:win
npm run build:linux
```

### Website

```bash
cd home

# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## Building & Releasing

### Automated Release Process

1. Update version numbers:
   ```bash
   ./scripts/prepare-release.sh 1.0.1
   ```

2. Commit and push changes:
   ```bash
   git commit -am "Release v1.0.1"
   git push
   ```

3. Create and push tag:
   ```bash
   git tag v1.0.1
   git push origin v1.0.1
   ```

The GitHub Actions workflow will automatically:
- Build the application for all platforms
- Create a GitHub release
- Upload the built files

### Manual Build

To build manually for all platforms:

```bash
cd app
npm run build:all
```

Built files will be in `app/release/`:
- macOS: `Jupyter Kube Launcher-1.0.0-arm64.dmg` (Apple Silicon)
- macOS: `Jupyter Kube Launcher-1.0.0.dmg` (Intel)
- Windows: `Jupyter Kube Launcher Setup 1.0.0.exe`
- Linux: `Jupyter Kube Launcher-1.0.0.AppImage`
- Linux: `jupyter-kube_1.0.0_amd64.deb`

## Deployment

### Website Deployment

The website is automatically deployed to Vercel when pushing to the main branch. Configuration is in `vercel.json`.

### Download Links

After creating a GitHub release, update the download links:

1. Edit `home/src/app/page.tsx`
2. Update the `GITHUB_REPO` constant with your repository
3. The version is automatically updated by the release script

## OIDC Authentication

The application supports OIDC authentication for Kubernetes clusters. For OIDC to work, users need:

1. `kubectl` installed
2. `kubectl-oidc_login` plugin installed:
   ```bash
   # Using krew
   kubectl krew install oidc-login
   
   # Using Homebrew (macOS)
   brew install int128/kubelogin/kubelogin
   ```

The application automatically searches for these tools in common locations.

## Features

### Kubernetes Integration
- Auto-detects kubeconfig files
- Supports multiple namespaces
- OIDC authentication support
- Real-time pod status monitoring

### Container Image
- Bring your own image — no image is bundled, since it must be pullable from your cluster
- `docker/` builds a compatible reference image you can host yourself
- See [docker/README.md](docker/README.md) for the image requirements

### Hardware Configuration
- CPU and memory allocation
- GPU support via any extended resource (`nvidia.com/gpu`, `amd.com/gpu`, ...)
- Optional node-label targeting to pin a specific GPU model
- Persistent volume claims

### Environment Management
- Create custom conda environments
- Upload environment.yml files
- Pre-configured data science packages

### Git Integration
- Configure git username/email
- SSH key deployment
- Repository cloning on startup

## Requirements

### For Users
- macOS 10.15+, Windows 10+, or Ubuntu 18.04+
- Access to a Kubernetes cluster, with a kubeconfig on your machine
- A JupyterLab container image your cluster can pull (see [docker/README.md](docker/README.md))
- kubectl installed (for OIDC authentication)

### For Development
- Node.js 20+
- npm or yarn
- Git

## Troubleshooting

### macOS Security Warning ("App is damaged")
If you see **"Jupyter Kube Launcher.app" is damaged and can't be opened"** on macOS:

**Quick Fix Options:**
1. Right-click the app and select "Open" (instead of double-clicking)
2. Or run this Terminal command: `xattr -cr /Applications/Jupyter\ Kube\ Launcher.app`

This happens because the app isn't code-signed with an Apple Developer certificate. The app is safe - this is macOS Gatekeeper protecting you from unsigned apps.

### OIDC Authentication Issues
If you see "unknown command 'oidc-login'", install the kubectl-oidc_login plugin as described above.

### Build Issues
- Ensure Node.js 20+ is installed
- Clear node_modules and reinstall: `rm -rf node_modules && npm install`
- For Windows builds on Mac/Linux, you may need Wine installed

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues specific to your Kubernetes cluster (access, quotas, node labels), contact your cluster administrator.
For application issues, please open a GitHub issue.
