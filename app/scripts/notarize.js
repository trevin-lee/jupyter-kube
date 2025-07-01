const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  
  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log('Performing ad-hoc signing for macOS app...');
  
  try {
    // Ad-hoc sign the app
    execSync(`codesign --force --deep --sign - "${appPath}"`, {
      stdio: 'inherit'
    });
    console.log('Ad-hoc signing completed successfully');
    
    // Remove quarantine xattr if present (won't affect downloaded files)
    execSync(`xattr -cr "${appPath}"`, {
      stdio: 'inherit'
    });
  } catch (error) {
    console.warn('Ad-hoc signing failed:', error.message);
    console.warn('App will still work but may show security warnings on first launch');
  }
}; 