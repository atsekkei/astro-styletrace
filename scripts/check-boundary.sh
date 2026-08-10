#!/bin/sh
# §3 の境界検証: core / ui は astro を import しない。
# 該当行が 1 つでもあれば失敗する。
set -e

hits=$(grep -rn "from 'astro" src/core src/ui || true)

if [ -n "$hits" ]; then
  echo "境界違反: src/core, src/ui から astro を import しています" >&2
  echo "$hits" >&2
  exit 1
fi

echo "boundary ok: src/core, src/ui は astro に依存していません"
