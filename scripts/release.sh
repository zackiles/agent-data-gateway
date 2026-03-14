#!/usr/bin/env bash
set -euo pipefail

VERSION=${1:?"Usage: ./scripts/release.sh <version> (e.g. 0.1.0)"}
TAG="v${VERSION}"

echo "Tagging release ${TAG}..."
git tag -a "${TAG}" -m "Release ${TAG}"
git push origin "${TAG}"
echo "Release ${TAG} pushed. GitHub Actions will handle the rest."
