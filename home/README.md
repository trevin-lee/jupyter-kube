# Jupyter Kube Launcher Website

This is the official website for the Jupyter Kube Launcher application, built with Next.js and deployed to Vercel.

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Run production server
npm start
```

## Deployment

The website is automatically deployed to Vercel when you push to the main branch. The `vercel.json` file in the root directory configures the build settings.

## Updating Download Links

The download links are configured in `src/app/page.tsx`. To update them:

1. Update the `GITHUB_REPO` constant with your GitHub repository (format: `username/repo`)
2. Update the `VERSION` constant when releasing a new version

## Release Process

To release a new version of the application:

1. Update the version in `app/package.json`
2. Update the version in `home/src/app/page.tsx`
3. Commit and push your changes
4. Create a new tag:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
5. The GitHub Actions workflow will automatically:
   - Build the Electron app for all platforms
   - Create a GitHub release
   - Upload the built files to the release

6. The website download links will automatically work once the release is published

## File Naming Convention

The built files follow this naming pattern:
- macOS ARM: `Jupyter.Kube.Launcher-{version}-arm64.dmg`
- macOS Intel: `Jupyter.Kube.Launcher-{version}.dmg`
- Windows: `Jupyter.Kube.Launcher.Setup.{version}.exe`
- Linux AppImage: `Jupyter.Kube.Launcher-{version}.AppImage`
- Linux Deb: `jupyter-kube_{version}_amd64.deb`

## Environment Variables

No environment variables are required for the website. All configuration is done through the code.

## Tech Stack

- Next.js 15
- React 19
- Tailwind CSS
- shadcn/ui components
- Deployed on Vercel

## About

Jupyter Kube Launcher provides:
- **Kubernetes-Native**: Deploy JupyterLab directly to your Kubernetes cluster as a managed StatefulSet
- **Auto Configuration**: Automatically detects your kubeconfig, contexts, and namespaces
- **One-Click Deploy**: Launch fully configured environments in seconds
- **Environment Management**: Custom conda environments and packages for data science and research computing
- **Git Integration**: Seamless repository cloning and SSH key configuration
- **Real-time Monitoring**: Live deployment progress and resource monitoring

**⚠️ Requirements**: You need access to a Kubernetes cluster and a working kubeconfig. Clusters using OIDC exec authentication also require `kubectl` and the `kubectl-oidc_login` plugin.

## macOS Security Warning

If you see **"Jupyter Kube Launcher.app" is damaged and can't be opened** on macOS:

### Quick Fix:
1. **Option 1**: Right-click the app and select "Open" instead of double-clicking
2. **Option 2**: Run this command in Terminal:
   ```bash
   xattr -cr /Applications/Jupyter\ Kube\ Launcher.app
   ```

This happens because the app isn't code-signed with an Apple Developer certificate. The app is safe to use - this is just macOS's security system (Gatekeeper) being cautious with unsigned apps.
