#!/bin/zsh
# Prints the web chat URL. With token auth the local access token is in the URL fragment.
source "${0:A:h}/env.sh"
if [ -n "$OPENCLAW_GATEWAY_TOKEN" ]; then
  echo "http://127.0.0.1:19789/#token=${OPENCLAW_GATEWAY_TOKEN}"
else
  echo "http://127.0.0.1:19789/"
fi
