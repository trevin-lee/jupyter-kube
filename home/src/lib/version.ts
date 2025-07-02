// This file contains version information
// The version is synchronized from the root version.json during build

// This will be replaced by sync-versions.js script
export const APP_VERSION = '1.0.15';
export const GITHUB_REPO = "trevin-lee/jupyter-kube";

// GitHub API endpoint for latest release
export const LATEST_RELEASE_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

// Types for GitHub API responses
interface GitHubAsset {
  name: string;
  browser_download_url: string;
}

interface GitHubRelease {
  assets: GitHubAsset[];
  tag_name: string;
}

// Function to get direct download links for the latest release
export async function getLatestDownloadLinks(): Promise<DownloadLinks> {
  try {
    const response = await fetch(LATEST_RELEASE_API);
    const release: GitHubRelease = await response.json();
    
    if (!release.assets || release.assets.length === 0) {
      throw new Error('No assets found in latest release');
    }

    const assets = release.assets;
    
    // Helper function to find asset by pattern and return direct download URL
    const findAsset = (pattern: RegExp) => {
      const asset = assets.find((asset: GitHubAsset) => pattern.test(asset.name));
      return asset ? asset.browser_download_url : null;
    };
    
    const fallbackLinks = getDownloadLinks();
    const version = release.tag_name?.replace('v', '') || APP_VERSION;
    
    return {
      windows: findAsset(/\.exe$/) || fallbackLinks.windows,
      mac: findAsset(/-arm64\.dmg$/) || fallbackLinks.mac,
      macIntel: assets.find((asset: GitHubAsset) => /\.dmg$/.test(asset.name) && !/-arm64\.dmg$/.test(asset.name))?.browser_download_url || fallbackLinks.macIntel,
      linux: findAsset(/\.AppImage$/) || fallbackLinks.linux,
      linuxDeb: findAsset(/\.deb$/) || fallbackLinks.linuxDeb,
      version
    };
  } catch (error) {
    console.warn('Failed to fetch latest release, falling back to current version links:', error);
    // Fallback to current version direct links
    return getDownloadLinks();
  }
}

// Download links type
export interface DownloadLinks {
  windows: string;
  mac: string;
  macIntel: string;
  linux: string;
  linuxDeb: string;
  version?: string;
}

// Static download links (fallback)
export const getDownloadLinks = (version: string = APP_VERSION): DownloadLinks => ({
  windows: `https://github.com/${GITHUB_REPO}/releases/download/v${version}/NRP.Jupyter.Launcher.Setup.${version}.exe`,
  mac: `https://github.com/${GITHUB_REPO}/releases/download/v${version}/NRP.Jupyter.Launcher-${version}-arm64.dmg`,
  macIntel: `https://github.com/${GITHUB_REPO}/releases/download/v${version}/NRP.Jupyter.Launcher-${version}.dmg`,
  linux: `https://github.com/${GITHUB_REPO}/releases/download/v${version}/NRP.Jupyter.Launcher-${version}.AppImage`,
  linuxDeb: `https://github.com/${GITHUB_REPO}/releases/download/v${version}/jupyter-kube_${version}_amd64.deb`
}); 