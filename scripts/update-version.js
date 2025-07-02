#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Get version from command line argument
const newVersion = process.argv[2];

if (!newVersion) {
  console.log('Usage: node scripts/update-version.js <version>');
  console.log('Example: node scripts/update-version.js 1.0.8');
  process.exit(1);
}

// Validate version format (basic semantic versioning)
if (!/^\d+\.\d+\.\d+(-\w+)?$/.test(newVersion)) {
  console.error('❌ Error: Invalid version format. Use semantic versioning (e.g., 1.0.8 or 1.0.8-beta)');
  process.exit(1);
}

console.log(`🚀 Updating version to ${newVersion}...\n`);

try {
  // Update root version.json (single source of truth)
  const versionPath = path.join(__dirname, '..', 'version.json');
  const versionData = {
    version: newVersion,
    description: "Single source of truth for version numbers across the jupyter-kube monorepo"
  };
  
  fs.writeFileSync(versionPath, JSON.stringify(versionData, null, 2) + '\n');
  console.log('✅ Updated version.json');

  // Sync all other files
  console.log('\n🔄 Syncing version across all files...');
  require('./sync-versions.js');

  console.log('\n🎉 Version update complete!');
  console.log('\n📋 Next steps:');
  console.log('1. Review the changes: git diff');
  console.log('2. Test locally: npm run dev:app && npm run dev:website');
  console.log('3. Commit: git add . && git commit -m "Release v' + newVersion + '"');
  console.log('4. Push: git push origin main');
  console.log('5. Release: npm run release');

} catch (error) {
  console.error('❌ Version update failed:', error.message);
  process.exit(1);
} 