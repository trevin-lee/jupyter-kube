#!/bin/bash

# Script to sync version from version.json to all files

# Read version from version.json
VERSION=$(grep -o '"version": *"[^"]*"' version.json | grep -o '"[^"]*"$' | tr -d '"')

if [ -z "$VERSION" ]; then
  echo "Error: Could not read version from version.json"
  exit 1
fi

echo "Syncing version $VERSION to all files..."

# Update app/package.json
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" app/package.json

# Update home/package.json
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" home/package.json

# Update home/src/app/page.tsx
sed -i '' "s/const VERSION = \"[^\"]*\"/const VERSION = \"$VERSION\"/" home/src/app/page.tsx
sed -i '' "s/Version [0-9]\+\.[0-9]\+\.[0-9]\+/Version $VERSION/" home/src/app/page.tsx
sed -i '' "s/>v[0-9]\+\.[0-9]\+\.[0-9]\+</>v$VERSION</" home/src/app/page.tsx

echo "✅ All files synced to version $VERSION!"
echo ""
echo "Files updated:"
echo "  - app/package.json"
echo "  - home/package.json"
echo "  - home/src/app/page.tsx" 