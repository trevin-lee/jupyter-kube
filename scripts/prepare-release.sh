#!/bin/bash

# Script to prepare a new release using centralized version management

if [ $# -eq 0 ]; then
    echo "Usage: ./scripts/prepare-release.sh <version>"
    echo "Example: ./scripts/prepare-release.sh 1.0.7"
    exit 1
fi

VERSION=$1

echo "🚀 Preparing release v$VERSION..."
echo ""

# Update the centralized version.json (single source of truth)
echo "📝 Updating version.json to $VERSION..."
cat > version.json << EOF
{
  "version": "$VERSION",
  "description": "Single source of truth for version numbers across the jupyter-kube monorepo"
}
EOF

echo "✅ Updated version.json"
echo ""

# Sync all files from the central version
echo "🔄 Syncing version across all files..."
./scripts/sync-versions.sh

echo ""
echo "✅ Release v$VERSION prepared successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Review the changes:"
echo "   git diff"
echo ""
echo "2. Test the website locally:"
echo "   cd home && npm run dev"
echo ""
echo "3. Test the electron app:"
echo "   cd app && npm run dev:all"
echo ""
echo "4. Commit and create release:"
echo "   git add ."
echo "   git commit -m \"Release v$VERSION\""
echo "   git tag v$VERSION"
echo "   git push origin main"
echo "   git push origin v$VERSION"
echo ""
echo "🤖 The CI/CD pipeline will automatically:"
echo "   • Mirror to GitHub"
echo "   • Build releases for all platforms"
echo "   • Deploy the website to Vercel"
echo "   • Create GitHub release with binaries" 