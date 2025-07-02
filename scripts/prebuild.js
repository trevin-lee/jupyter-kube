#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔄 Pre-build: Syncing versions from version.json...');

try {
  // Read version from root version.json (single source of truth)
  const versionPath = path.join(__dirname, '..', 'version.json');
  if (!fs.existsSync(versionPath)) {
    console.error('❌ Error: version.json not found at project root');
    process.exit(1);
  }

  const versionData = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
  const version = versionData.version;

  if (!version) {
    console.error('❌ Error: No version found in version.json');
    process.exit(1);
  }

  console.log(`📝 Syncing version ${version} across all files...`);

  // Update app/package.json
  const appPackagePath = path.join(__dirname, '..', 'app', 'package.json');
  if (fs.existsSync(appPackagePath)) {
    const appPackage = JSON.parse(fs.readFileSync(appPackagePath, 'utf8'));
    appPackage.version = version;
    fs.writeFileSync(appPackagePath, JSON.stringify(appPackage, null, 2) + '\n');
    console.log('✅ Updated app/package.json');
  }

  // Update home/package.json
  const homePackagePath = path.join(__dirname, '..', 'home', 'package.json');
  if (fs.existsSync(homePackagePath)) {
    const homePackage = JSON.parse(fs.readFileSync(homePackagePath, 'utf8'));
    homePackage.version = version;
    fs.writeFileSync(homePackagePath, JSON.stringify(homePackage, null, 2) + '\n');
    console.log('✅ Updated home/package.json');
  }

  // Note: home/src/app/page.tsx automatically reads from version.json via version.ts
  // No manual updates needed!

  console.log(`✅ Pre-build version sync complete! All files use version ${version}`);
  console.log('📄 Note: Home website automatically reads from version.json via version.ts');
  
} catch (error) {
  console.error('❌ Pre-build version sync failed:', error.message);
  process.exit(1);
} 