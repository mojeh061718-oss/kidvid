#!/usr/bin/env bash
# discover.sh "search query" [sp-filter] [count]
# Prints up to <count> unique video IDs from YouTube search results HTML.
# sp filters: long(20m+)=EgIYAg%3D%3D  medium(4-20m)=EgIYAw%3D%3D  (omit for any)
set -u
q="$1"; sp="${2:-}"; n="${3:-12}"
enc=$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))' "$q")
url="https://www.youtube.com/results?search_query=$enc"
[ -n "$sp" ] && url="$url&sp=$sp"
curl -sS --max-time 30 -H "Accept-Language: en-US" "$url" 2>/dev/null \
  | grep -oE '"videoId":"[A-Za-z0-9_-]{11}"' \
  | sed 's/.*:"//;s/"//' | awk '!seen[$0]++' | head -"$n"
