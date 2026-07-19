#!/bin/bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$DIR/.promptlab-server.pid"

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  kill "$(cat "$PID_FILE")"
  echo "Stopped PromptLab server (pid $(cat "$PID_FILE"))"
else
  echo "PromptLab server isn't running."
fi
rm -f "$PID_FILE"
