set -e
cd "$(dirname "$0")/../src/worker"
./.venv/Scripts/uvicorn.exe app.main:app --host 127.0.0.1 --port 8000 "$@"