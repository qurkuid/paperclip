#!/usr/bin/env bash

set -euo pipefail

usage() {
  printf '%s\n' 'Usage: paperclip-link-resource.sh URL [--title TEXT] [--summary TEXT]'
}

url="${1:-}"
shift $(( $# > 0 ? 1 : 0 ))
title=""
summary=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --title) title="${2:-}"; shift 2 ;;
    --summary) summary="${2:-}"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) usage >&2; exit 1 ;;
  esac
done

if [[ ! "$url" =~ ^https?://[^[:space:]]+$ ]]; then
  printf '%s\n' 'URL must be an http(s) URL.' >&2
  exit 1
fi

: "${PAPERCLIP_API_URL:?PAPERCLIP_API_URL is required}"
: "${PAPERCLIP_API_KEY:?PAPERCLIP_API_KEY is required}"
: "${PAPERCLIP_TASK_ID:?PAPERCLIP_TASK_ID is required}"
: "${PAPERCLIP_RUN_ID:?PAPERCLIP_RUN_ID is required}"

title="${title:-$url}"
api_base="${PAPERCLIP_API_URL%/}"
api_base="${api_base%/api}"
payload="$(jq -n --arg title "$title" --arg url "$url" --arg summary "$summary" '{type:"preview_url",provider:"custom",title:$title,url:$url,status:"ready_for_review",summary:($summary | if . == "" then null else . end)}')"

curl -fsS -X POST "$api_base/api/issues/$PAPERCLIP_TASK_ID/work-products" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -H 'Content-Type: application/json' \
  --data-binary "$payload"
