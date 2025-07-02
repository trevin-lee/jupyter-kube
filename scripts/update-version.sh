#!/bin/bash

# Script to update version numbers across all files

if [ -z "$1" ]; then
  echo "Usage: ./scripts/update-version.sh <version>"
  echo "Example: ./scripts/update-version.sh 1.0.5"
  exit 1
fi

VERSION=$1

echo "Updating version to $VERSION..."

# Update root version.json (single source of truth)
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" version.json

echo "Version updated to $VERSION in version.json!"
echo ""
echo "Run './scripts/sync-versions.sh' to sync all files with the new version"
echo "Don't forget to:"
echo "1. Commit the changes: git commit -am 'Update version to $VERSION'"
echo "2. Create and push tag: git tag v$VERSION && git push origin v$VERSION" 