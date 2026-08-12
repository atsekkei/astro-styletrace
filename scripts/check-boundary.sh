#!/bin/sh
set -e

hits=$(grep -rn "from 'astro" src/core src/ui || true)

if [ -n "$hits" ]; then
  echo "boundary violation: src/core or src/ui imports astro" >&2
  echo "$hits" >&2
  exit 1
fi

echo "boundary ok: src/core and src/ui do not depend on astro"
