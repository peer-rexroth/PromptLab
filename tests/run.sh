#!/bin/bash
# Runs the promptlab.html test suite. No install step: uses osascript -l
# JavaScript (JavaScriptCore), so there's nothing to `npm install` before
# this works.
#
# Usage:
#   ./tests/run.sh              # run everything
#   ./tests/run.sh presets      # only run tests whose name includes "presets"
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"
osascript -l JavaScript tests/harness.js "$@"
