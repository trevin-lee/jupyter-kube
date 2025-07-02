#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Starting automated release process...\n');

try {
  // Read version from version.json (single source of truth)
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

  console.log(`📝 Release version: ${version}`);
  console.log(`🎯 Target: v${version}\n`);

  // Check if we're on a clean git state
  try {
    execSync('git diff --quiet && git diff --cached --quiet', { stdio: 'ignore' });
  } catch (error) {
    console.error('❌ Error: You have uncommitted changes. Please commit them first.');
    console.log('💡 Commit your changes, then run: npm run release');
    process.exit(1);
  }

  // Check if tag already exists
  try {
    execSync(`git rev-parse v${version}`, { stdio: 'ignore' });
    console.error(`❌ Error: Tag v${version} already exists. Please update version.json first.`);
    console.log(`💡 Run: ./scripts/update-version.sh <new-version>`);
    process.exit(1);
  } catch (error) {
    // Tag doesn't exist, which is good
  }

  console.log('✅ Git state is clean, proceeding with release...');

  // Create and push tag (no code commits)
  console.log(`\n🏷️  Creating tag v${version}...`);
  execSync(`git tag v${version}`, { stdio: 'inherit' });

  console.log('📤 Pushing tag to GitLab (will mirror to GitHub)...');
  execSync(`git push origin v${version}`, { stdio: 'inherit' });

  console.log('\n🎉 Release tag created successfully!');
  console.log('\n📋 What happens next:');
  console.log('• GitLab → GitHub mirror synchronization');  
  console.log('• GitHub Actions will build releases for all platforms:');
  console.log(`  - macOS: NRP Jupyter Launcher-${version}-arm64.dmg`);
  console.log(`  - macOS Intel: NRP Jupyter Launcher-${version}.dmg`);
  console.log(`  - Windows: NRP.Jupyter.Launcher.Setup.${version}.exe`);
  console.log(`  - Linux: NRP Jupyter Launcher-${version}.AppImage`);
  console.log(`  - Linux: jupyter-kube_${version}_amd64.deb`);
  console.log('\n🔗 Monitor progress:');
  console.log('• GitHub Actions: https://github.com/trevin-lee/jupyter-kube/actions');
  console.log('• Releases: https://github.com/trevin-lee/jupyter-kube/releases');
  console.log('• Website: https://jupyter-kube.vercel.app');
  
  console.log('\n💡 Note: Download links automatically point to latest release!');

} catch (error) {
  console.error('\n❌ Release process failed:', error.message);
  console.log('\n🔧 To recover:');
  console.log('• Check git status: git status');
  console.log('• Remove tag if created: git tag -d v<version>');
  console.log('• Fix issues and try again');
  process.exit(1);
} 