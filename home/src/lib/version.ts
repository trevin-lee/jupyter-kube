// This file automatically imports version information from the root version.json
// This ensures all version numbers stay in sync across the monorepo

import versionData from '../../../version.json';

export const APP_VERSION = versionData.version;
export const GITHUB_REPO = "trevin-lee/jupyter-kube";

// Generate download links dynamically
export const getDownloadLinks = (version: string = APP_VERSION) => ({
  windows: `https://github.com/${GITHUB_REPO}/releases/download/v${version}/NRP.Jupyter.Launcher.Setup.${version}.exe`,
  mac: `https://github.com/${GITHUB_REPO}/releases/download/v${version}/NRP.Jupyter.Launcher-${version}-arm64.dmg`,
  macIntel: `https://github.com/${GITHUB_REPO}/releases/download/v${version}/NRP.Jupyter.Launcher-${version}.dmg`,
  linux: `https://github.com/${GITHUB_REPO}/releases/download/v${version}/NRP.Jupyter.Launcher-${version}.AppImage`,
  linuxDeb: `https://github.com/${GITHUB_REPO}/releases/download/v${version}/jupyter-kube_${version}_amd64.deb`
}); 