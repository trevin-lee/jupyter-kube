#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Get version from command line argument
const newVersion = process.argv[2];

if (!newVersion) {
  console.log('Usage: node scripts/prepare-release.js <version>');
  console.log('Example: node scripts/prepare-release.js 1.0.8');
  process.exit(1);
}

// Validate version format (basic semantic versioning)
if (!/^\d+\.\d+\.\d+(-\w+)?$/.test(newVersion)) {
  console.error('❌ Error: Invalid version format. Use semantic versioning (e.g., 1.0.8 or 1.0.8-beta)');
  process.exit(1);
}

console.log(`🚀 Preparing release v${newVersion}...\n`);

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

  console.log('\n✅ Release v' + newVersion + ' prepared successfully!');
  console.log('\n📋 Next steps:');
  console.log('1. Review the changes:');
  console.log('   git diff');
  console.log('');
  console.log('2. Test locally:');
  console.log('   npm run dev:website');
  console.log('   npm run dev:app');
  console.log('');
  console.log('3. Commit and release:');
  console.log('   git add .');
  console.log('   git commit -m "Release v' + newVersion + '"');
  console.log('   git push origin main');
  console.log('   npm run release');
  console.log('');
  console.log('🤖 The CI/CD pipeline will automatically:');
  console.log('   • Mirror to GitHub');
  console.log('   • Build releases for all platforms');
  console.log('   • Deploy the website to Vercel');
  console.log('   • Create GitHub release with binaries');

} catch (error) {
  console.error('❌ Release preparation failed:', error.message);
  process.exit(1);
} 