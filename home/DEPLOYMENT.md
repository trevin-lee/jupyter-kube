# Deployment Instructions

## Setting Up Download Links

Before deploying, you'll need to update the download links in `src/app/page.tsx`:

```typescript
const downloadLinks = {
  windows: "https://github.com/your-repo/releases/download/v1.0.0/NRP-Jupyter-Launcher-Setup-1.0.0.exe", // Example
  mac: "https://github.com/your-repo/releases/download/v1.0.0/NRP-Jupyter-Launcher-1.0.0.dmg", // Example
  linux: "https://github.com/your-repo/releases/download/v1.0.0/NRP-Jupyter-Launcher-1.0.0.AppImage" // Example
}
```

Replace the `#` placeholders with your actual download links from GitHub releases or your preferred hosting solution.

## Deploy to Vercel

The repository includes configuration files (`.vercelignore` and `vercel.json`) to properly deploy the website from the `home/` directory while ignoring the main app.

### Option 1: Vercel Dashboard (Recommended)
1. **Import Repository**: Go to [vercel.com](https://vercel.com) and import your repository
2. **Auto-detected**: Vercel will automatically detect the Next.js project in the `home/` directory
3. **Deploy**: Click deploy - the configuration files will handle the rest

### Option 2: Vercel CLI
1. **Install CLI**:
   ```bash
   npm install -g vercel
   vercel login
   ```

2. **Deploy from project root**:
   ```bash
   # From the project root (not the home directory)
   vercel --prod
   ```

The `vercel.json` configuration ensures Vercel builds from the correct directory automatically.

## Deploy to Netlify

1. **Build the site**:
   ```bash
   npm run build
   ```

2. **Deploy to Netlify**:
   - Drag the `out/` folder to Netlify deploy
   - Or connect your repository for automatic deployments

## Custom Domain

Once deployed, you can add a custom domain like `jupyter-launcher.com` through your hosting provider's dashboard.

## Environment Variables

If you need to add analytics, monitoring, or other services, you can add environment variables:

- `NEXT_PUBLIC_GA_ID` - Google Analytics ID
- `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` - Plausible Analytics domain
- etc.

## SSL Certificate

Both Vercel and Netlify provide automatic SSL certificates for HTTPS. 