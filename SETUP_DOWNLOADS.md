# Setting Up Download Links

## Quick Setup

1. **Update the GitHub repository in the website code:**
   
   Edit `home/src/app/page.tsx` and change this line:
   ```javascript
   const GITHUB_REPO = "your-username/jupyter-kube"; // Update this!
   ```
   
   Replace `your-username` with your GitHub username or organization name.

2. **Create your first release:**
   
   ```bash
   # Make sure all changes are committed
   git add .
   git commit -m "Initial release"
   git push
   
   # Create and push a tag
   git tag v1.0.0
   git push origin v1.0.0
   ```

3. **Wait for the build:**
   
   The GitHub Actions workflow will automatically:
   - Build the app for all platforms
   - Create a GitHub release
   - Upload all the built files

4. **Deploy the website:**
   
   Push to main branch and Vercel will automatically deploy:
   ```bash
   git push origin main
   ```

## Manual Release Upload (Alternative)

If you prefer to upload releases manually:

1. Build the applications locally:
   ```bash
   cd app
   npm run build:all
   ```

2. Go to your GitHub repository's Releases page
3. Click "Create a new release"
4. Choose the tag (e.g., v1.0.0)
5. Upload these files from `app/release/`:
   - `NRP Jupyter Launcher-1.0.0-arm64.dmg`
   - `NRP Jupyter Launcher-1.0.0.dmg`
   - `NRP Jupyter Launcher Setup 1.0.0.exe`
   - `NRP Jupyter Launcher-1.0.0.AppImage`
   - `jupyter-kube_1.0.0_amd64.deb`

## Vercel Deployment

1. Go to [vercel.com](https://vercel.com)
2. Import your GitHub repository
3. Vercel will automatically detect the configuration from `vercel.json`
4. Deploy!

The website will automatically update when you push to the main branch.

## Testing Downloads

After setting everything up:

1. Visit your deployed website
2. Try downloading each platform version
3. The links should point to your GitHub releases

## Troubleshooting

### Downloads return 404
- Make sure the GitHub release is published (not draft)
- Check that file names match exactly
- Ensure the version number in `home/src/app/page.tsx` matches your release tag

### GitHub Actions build fails
- Check the Actions tab in your GitHub repository
- Common issues:
  - Missing dependencies
  - Code signing issues (can be ignored for open source)
  - Out of disk space

### Website doesn't update
- Check Vercel dashboard for deployment status
- Make sure you pushed to the main branch
- Clear your browser cache 