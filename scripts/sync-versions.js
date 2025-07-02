#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔄 Syncing versions from version.json...\n');

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

  console.log(`📝 Syncing version ${version} across all files...\n`);

  // Files to update
  const filesToUpdate = [
    { path: 'package.json', name: 'Root package.json' },
    { path: 'app/package.json', name: 'App package.json' },
    { path: 'home/package.json', name: 'Home package.json' }
  ];

  let updated = 0;

  for (const file of filesToUpdate) {
    const fullPath = path.join(__dirname, '..', file.path);
    
    if (fs.existsSync(fullPath)) {
      try {
        // Read, update, and write JSON properly
        const packageData = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        const oldVersion = packageData.version;
        
        packageData.version = version;
        
        // Write with proper formatting (2 space indentation + newline)
        fs.writeFileSync(fullPath, JSON.stringify(packageData, null, 2) + '\n');
        
        if (oldVersion !== version) {
          console.log(`✅ Updated ${file.name}: ${oldVersion} → ${version}`);
          updated++;
        } else {
          console.log(`✓ ${file.name}: already ${version}`);
        }
      } catch (error) {
        console.error(`❌ Error updating ${file.name}:`, error.message);
      }
    } else {
      console.log(`⚠️  ${file.name}: file not found, skipping`);
    }
  }

  // Update version.ts file
  const versionTsPath = path.join(__dirname, '..', 'home', 'src', 'lib', 'version.ts');
  if (fs.existsSync(versionTsPath)) {
    try {
      let content = fs.readFileSync(versionTsPath, 'utf8');
      const oldVersionMatch = content.match(/export const APP_VERSION = '([^']+)';/);
      const oldVersion = oldVersionMatch ? oldVersionMatch[1] : 'unknown';
      
      content = content.replace(
        /export const APP_VERSION = '[^']+';/,
        `export const APP_VERSION = '${version}';`
      );
      
      fs.writeFileSync(versionTsPath, content);
      
      if (oldVersion !== version) {
        console.log(`✅ Updated home/src/lib/version.ts: ${oldVersion} → ${version}`);
        updated++;
      } else {
        console.log(`✓ home/src/lib/version.ts: already ${version}`);
      }
    } catch (error) {
      console.error(`❌ Error updating version.ts:`, error.message);
    }
  }

  console.log(`\n✅ Version sync complete!`);
  console.log(`📊 Updated ${updated} file(s) to version ${version}`);
  console.log(`📄 Home website automatically reads from version.json`);
  console.log(`🔗 Download links automatically point to latest release`);

} catch (error) {
  console.error('❌ Version sync failed:', error.message);
  process.exit(1);
} 