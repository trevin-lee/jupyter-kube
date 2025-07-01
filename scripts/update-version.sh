#!/bin/bash

# Script to update version numbers across all files

if [ -z "$1" ]; then
  echo "Usage: ./scripts/update-version.sh <version>"
  echo "Example: ./scripts/update-version.sh 1.0.5"
  exit 1
fi

VERSION=$1

echo "Updating version to $VERSION..."

# Update app/package.json
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" app/package.json

# Update home/package.json
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" home/package.json

# Update home/src/app/page.tsx
sed -i '' "s/const VERSION = \"[^\"]*\"/const VERSION = \"$VERSION\"/" home/src/app/page.tsx
sed -i '' "s/Version [0-9]\+\.[0-9]\+\.[0-9]\+/Version $VERSION/" home/src/app/page.tsx
sed -i '' "s/>v[0-9]\+\.[0-9]\+\.[0-9]\+</>v$VERSION</" home/src/app/page.tsx

echo "Version updated to $VERSION in all files!"
echo "Don't forget to:"
echo "1. Commit the changes: git commit -am 'Update version to $VERSION'"
echo "2. Create and push tag: git tag v$VERSION && git push origin v$VERSION" 