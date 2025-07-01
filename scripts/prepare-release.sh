#!/bin/bash

# Script to prepare a new release by updating version numbers

if [ $# -eq 0 ]; then
    echo "Usage: ./scripts/prepare-release.sh <version>"
    echo "Example: ./scripts/prepare-release.sh 1.0.1"
    exit 1
fi

VERSION=$1

echo "Preparing release v$VERSION..."

# Update version in app/package.json
echo "Updating app/package.json..."
sed -i.bak "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" app/package.json
rm app/package.json.bak

# Update version in home/src/app/page.tsx
echo "Updating home/src/app/page.tsx..."
sed -i.bak "s/const VERSION = \"[^\"]*\"/const VERSION = \"$VERSION\"/" home/src/app/page.tsx
rm home/src/app/page.tsx.bak

# Update version badge in home/src/app/page.tsx
sed -i.bak "s/Version [0-9]\+\.[0-9]\+\.[0-9]\+/Version $VERSION/" home/src/app/page.tsx
rm home/src/app/page.tsx.bak

# Update version in footer
sed -i.bak "s/>v[0-9]\+\.[0-9]\+\.[0-9]\+</>v$VERSION</" home/src/app/page.tsx
rm home/src/app/page.tsx.bak

echo "Version updated to $VERSION in all files."
echo ""
echo "Next steps:"
echo "1. Review the changes: git diff"
echo "2. Commit the changes: git commit -am \"Release v$VERSION\""
echo "3. Create and push the tag: git tag v$VERSION && git push origin v$VERSION"
echo "4. Push the commits: git push"
echo ""
echo "The GitHub Actions workflow will automatically build and create the release." 