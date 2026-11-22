#!/bin/zsh
# Prints the Control UI URL (with this project's gateway token in the URL fragment).
source "${0:A:h}/env.sh"
echo "http://127.0.0.1:19789/#token=${OPENCLAW_GATEWAY_TOKEN}"
