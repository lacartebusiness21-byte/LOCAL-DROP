#!/usr/bin/env bash
set -e
echo "Build LocalDrop pour Linux (AppImage + .deb)..."
npm run build -- --target linux
