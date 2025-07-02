// This file automatically imports version information from the root version.json
// This ensures all version numbers stay in sync across the monorepo

import versionData from '../../../version.json';

export const APP_VERSION = versionData.version;
export const GITHUB_REPO = "trevin-lee/jupyter-kube";

// Download version - automatically updated by release script to ensure working links
export const DOWNLOAD_VERSION = "1.0.6-hotfix"; // Auto-updated by npm run release

// Generate download links dynamically
export const getDownloadLinks = (version: string = DOWNLOAD_VERSION) => ({
  windows: `https://github.com/${GITHUB_REPO}/releases/download/v${version}/NRP.Jupyter.Launcher.Setup.${version}.exe`,
  mac: `https://github.com/${GITHUB_REPO}/releases/download/v${version}/NRP.Jupyter.Launcher-${version}-arm64.dmg`,
  macIntel: `https://github.com/${GITHUB_REPO}/releases/download/v${version}/NRP.Jupyter.Launcher-${version}.dmg`,
  linux: `https://github.com/${GITHUB_REPO}/releases/download/v${version}/NRP.Jupyter.Launcher-${version}.AppImage`,
  linuxDeb: `https://github.com/${GITHUB_REPO}/releases/download/v${version}/jupyter-kube_${version}_amd64.deb`
}); 