#!/usr/bin/env node

/**
 * Postinstall script to ensure platform-specific binaries are installed
 * This is needed for CI/CD environments where the build platform differs from development
 */

const { execSync } = require('child_process');
const os = require('os');
const path = require('path');

console.log('Running postinstall script to ensure platform binaries...');

// Only install additional binaries in CI/CD environments
if (process.env.CI || process.env.VERCEL || process.env.GITHUB_ACTIONS) {
  console.log('CI/CD environment detected, installing platform-specific binaries...');
  
  try {
    // For Vercel (Linux environment)
    if (process.env.VERCEL) {
      console.log('Installing lightningcss Linux binaries for Vercel...');
      execSync('npm install lightningcss-linux-x64-gnu lightningcss-linux-arm64-gnu --no-save --force', {
        stdio: 'inherit',
        cwd: path.join(__dirname, '..', 'home')
      });
    }
    
    // For GitHub Actions Windows build
    if (process.env.GITHUB_ACTIONS && process.platform === 'win32') {
      console.log('Installing rollup Windows binaries for GitHub Actions...');
      execSync('npm install @rollup/rollup-win32-x64-msvc --no-save --force', {
        stdio: 'inherit',
        cwd: path.join(__dirname, '..', 'app')
      });
    }
    
    // For GitHub Actions Linux build
    if (process.env.GITHUB_ACTIONS && process.platform === 'linux') {
      console.log('Installing rollup Linux binaries for GitHub Actions...');
      execSync('npm install @rollup/rollup-linux-x64-gnu --no-save --force', {
        stdio: 'inherit',
        cwd: path.join(__dirname, '..', 'app')
      });
    }
    
    console.log('Platform-specific binaries installed successfully!');
  } catch (error) {
    console.error('Error installing platform binaries:', error.message);
    console.error('Continuing anyway - the build might still work...');
  }
} else {
  console.log('Local development environment - skipping additional binary installation');
} 