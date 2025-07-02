// This file automatically imports version information from the root version.json
// This ensures all version numbers stay in sync across the monorepo

import versionData from '../../../version.json';

export const APP_VERSION = versionData.version;
export const GITHUB_REPO = "trevin-lee/jupyter-kube";

// Download links that automatically point to the latest release
export const getDownloadLinks = () => ({
  windows: `https://github.com/${GITHUB_REPO}/releases/latest`,
  mac: `https://github.com/${GITHUB_REPO}/releases/latest`,
  macIntel: `https://github.com/${GITHUB_REPO}/releases/latest`,
  linux: `https://github.com/${GITHUB_REPO}/releases/latest`,
  linuxDeb: `https://github.com/${GITHUB_REPO}/releases/latest`
}); 