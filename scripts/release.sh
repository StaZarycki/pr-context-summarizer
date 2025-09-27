#!/usr/bin/env bash
set -euo pipefail

# --- config ---
VERSION=${1:-}
if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 <version>"
  echo "Example: $0 1.0.3"
  exit 1
fi

TAG="v$VERSION"
MAJOR="v${VERSION%%.*}"   # v1 from 1.0.3

echo "🔧 Cleaning & installing deps..."
npm ci

echo "🏗️ Building..."
npm run build

echo "📦 Committing build artifacts..."
git add dist
git commit -m "build: release $TAG" || echo "ℹ️ No changes to commit."

echo "🏷️ Creating tag $TAG..."
git tag -a "$TAG" -m "$TAG"

echo "🏷️ Updating major tag $MAJOR..."
git tag -fa "$MAJOR" -m "Update $MAJOR to $TAG"

echo "🚀 Pushing changes..."
git push origin main
git push origin "$TAG"
git push origin "$MAJOR" --force

echo "✅ Release $TAG pushed. $MAJOR tag now points to $TAG."
