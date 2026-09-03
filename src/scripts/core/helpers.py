"""Small shared pieces: where the scraper keeps its own files, and image sniffing."""

from pathlib import Path

# Everything the scripts write or keep between runs — the browser profile, the TTS models,
# the log — lives here, beside the code rather than wherever the caller happens to run it from.
DATA_DIR = Path(__file__).resolve().parents[1] / "data"

IMAGE_TYPES = {b"\xff\xd8\xff": "image/jpeg", b"\x89PNG": "image/png", b"GIF8": "image/gif", b"RIFF": "image/webp"}


def media_type(body: bytes) -> str | None:
    """The content type from the file signature, or None when it is not an image."""
    return next((mime for magic, mime in IMAGE_TYPES.items() if body.startswith(magic)), None)
