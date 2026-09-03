set -e
root="$(cd "$(dirname "$0")/.." && pwd)"
# Run from wherever the caller is, so relative --input/--output paths mean what they expect;
# the script resolves its own files (the log) off its own path.
"$root/src/scripts/.venv/Scripts/python.exe" "$root/src/scripts/speech.py" "$@"
