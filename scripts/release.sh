#!/bin/bash

# Simple release script for diff-native
# Usage: ./scripts/release.sh [patch|minor|major]

set -e

VERSION_TYPE=${1:-patch}

echo "🚀 Starting release process..."

# Ensure working directory is clean
if [[ -n $(git status -s) ]]; then
  echo "❌ Working directory is not clean. Please commit or stash changes."
  exit 1
fi

# Pull latest changes
echo "📥 Pulling latest changes..."
git pull origin main

# Run tests
echo "🧪 Running tests..."
bun install
bun run build
bun test
bun run test:rust

# Bump version
echo "📝 Bumping version..."
npm version $VERSION_TYPE --no-git-tag-version

# Get new version
NEW_VERSION=$(node -p "require('./package.json').version")

# Commit version bump
git add package.json
git commit -m "chore: release v${NEW_VERSION}"

# Create tag
git tag -a "v${NEW_VERSION}" -m "Release v${NEW_VERSION}"

# Push changes
echo "📤 Pushing to GitHub..."
git push origin main
git push origin "v${NEW_VERSION}"

echo "✅ Release v${NEW_VERSION} created!"
echo "The GitHub Action will now build and publish to npm automatically."
echo "Check the progress at: https://github.com/denispanov/diff-native/actions"