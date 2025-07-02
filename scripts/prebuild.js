#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read version from root version.json
const versionFile = path.join(__dirname, '..', 'version.json');
const versionData = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
const version = versionData.version;

console.log(`📋 Syncing version ${version} from version.json...`);

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

// Update home/src/app/page.tsx
const pagePath = path.join(__dirname, '..', 'home', 'src', 'app', 'page.tsx');
if (fs.existsSync(pagePath)) {
  let pageContent = fs.readFileSync(pagePath, 'utf8');
  
  // Update VERSION constant
  pageContent = pageContent.replace(/const VERSION = "[^"]*"/, `const VERSION = "${version}"`);
  
  // Update Version badge
  pageContent = pageContent.replace(/Version \d+\.\d+\.\d+/, `Version ${version}`);
  
  // Update footer version
  pageContent = pageContent.replace(/>v\d+\.\d+\.\d+</, `>v${version}<`);
  
  fs.writeFileSync(pagePath, pageContent);
  console.log('✅ Updated home/src/app/page.tsx');
}

console.log('\n🎉 Version sync complete!');
console.log(`   All files now using version: ${version}\n`); 