#!/usr/bin/env bash
# collect.sh "query" [sp-filter] [discover-count]
# Discovers candidates and prints ONLY passing videos (public, embeddable, >=361s)
# as TSV: id<TAB>lengthSeconds<TAB>channel<TAB>title
set -u
here="$(dirname "$0")"
q="$1"; sp="${2:-}"; n="${3:-20}"
ids=$(bash "$here/discover.sh" "$q" "$sp" "$n")
[ -z "$ids" ] && exit 0
bash "$here/verify.sh" $ids 2>/dev/null \
  | awk -F'\t' '($2!="-" && $2+0>=361 && $3=="YES"){ printf "%s\t%s\t%s\t%s\n",$1,$2,$4,$5 }'
