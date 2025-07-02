#!/bin/bash

# Script to sync version numbers across all files from version.json (single source of truth)

# Get version from root version.json
VERSION=$(node -p "require('./version.json').version")

if [ -z "$VERSION" ]; then
  echo "Error: Could not read version from version.json"
  exit 1
fi

echo "Syncing version $VERSION across all files..."

# Update app/package.json
echo "Updating app/package.json..."
if [ -f "app/package.json" ]; then
  sed -i.bak "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" app/package.json
  rm -f app/package.json.bak
  echo "✓ Updated app/package.json"
else
  echo "⚠ app/package.json not found"
fi

# Update home/package.json
echo "Updating home/package.json..."
if [ -f "home/package.json" ]; then
  sed -i.bak "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" home/package.json
  rm -f home/package.json.bak
  echo "✓ Updated home/package.json"
else
  echo "⚠ home/package.json not found"
fi

# The home page now automatically reads from version.json via the version.ts utility
# No need to manually update hardcoded values anymore!
echo "✓ Home page will automatically use version $VERSION via version.ts"

echo ""
echo "✅ Version sync complete!"
echo "All components now use version: $VERSION"
echo ""
echo "Note: The home website automatically reads from version.json"
echo "      No manual updates needed for download links or version badges" 