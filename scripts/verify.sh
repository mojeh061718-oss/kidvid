#!/usr/bin/env bash
# Verify YouTube video IDs: prints TSV "id<TAB>lengthSeconds<TAB>embeddable<TAB>channel<TAB>title"
# Only public, oEmbed-resolvable videos produce a title. Live streams have no lengthSeconds.
# Usage: verify.sh ID1 ID2 ...   (or pipe IDs one per line)
set -u
ids=("$@")
if [ ${#ids[@]} -eq 0 ]; then mapfile -t ids; fi

for id in "${ids[@]}"; do
  id=$(echo "$id" | tr -d '[:space:]')
  [ -z "$id" ] && continue
  oe=$(curl -sS --max-time 20 "https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=$id" 2>/dev/null)
  if ! echo "$oe" | grep -q '"title"'; then
    printf '%s\t-\tNO\t-\t(unavailable/private/removed)\n' "$id"; continue
  fi
  title=$(echo "$oe" | sed -n 's/.*"title":"\(\([^"\\]\|\\.\)*\)".*/\1/p')
  chan=$(echo "$oe" | sed -n 's/.*"author_name":"\(\([^"\\]\|\\.\)*\)".*/\1/p')
  html=$(curl -sS --max-time 25 "https://www.youtube.com/watch?v=$id" 2>/dev/null)
  len=$(echo "$html" | grep -oE '"lengthSeconds":"[0-9]+"' | head -1 | grep -oE '[0-9]+')
  emb=$(echo "$html" | grep -oE '"playableInEmbed":(true|false)' | head -1 | grep -oE '(true|false)')
  [ -z "$len" ] && len="-"
  [ "$emb" = "true" ] && emb="YES" || { [ "$emb" = "false" ] && emb="NO" || emb="?"; }
  printf '%s\t%s\t%s\t%s\t%s\n' "$id" "$len" "$emb" "$chan" "$title"
done
