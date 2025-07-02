#!/bin/bash

# Script to update version numbers across all files

if [ -z "$1" ]; then
  echo "Usage: ./scripts/update-version.sh <version>"
  echo "Example: ./scripts/update-version.sh 1.0.7"
  exit 1
fi

VERSION=$1

echo "Updating version to $VERSION..."

# Update root version.json (single source of truth)
echo "Updating version.json..."
cat > version.json << EOF
{
  "version": "$VERSION",
  "description": "Single source of truth for version numbers across the jupyter-kube monorepo"
}
EOF

echo "✓ Updated version.json to $VERSION"
echo ""

# Now sync all other files from this single source
echo "Syncing version across all files..."
./scripts/sync-versions.sh

echo ""
echo "✅ Version update complete!"
echo ""
echo "Next steps:"
echo "1. Review the changes: git diff"
echo "2. Test the website: cd home && npm run dev"
echo "3. Commit the changes: git commit -am 'Update version to $VERSION'"
echo "4. Create and push tag: git tag v$VERSION && git push origin v$VERSION" 