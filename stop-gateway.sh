#!/bin/zsh
# Stop the gateway listening on this project's port.
pid=$(lsof -nP -tiTCP:19789 -sTCP:LISTEN | head -1)
[ -n "$pid" ] && kill "$pid" && echo "stopped $pid" || echo "not running"
