set -e
root="$(cd "$(dirname "$0")/.." && pwd)"
# Run from wherever the caller is, so a relative --output means what they expect; the
# scraper resolves its own files (the crawlers, the browser profile) off its own path.
"$root/src/scripts/.venv/Scripts/python.exe" "$root/src/scripts/scrape.py" "$@"
