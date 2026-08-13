"""Image sniffing, shared by every crawler's cover endpoint."""

IMAGE_TYPES = {b"\xff\xd8\xff": "image/jpeg", b"\x89PNG": "image/png", b"GIF8": "image/gif", b"RIFF": "image/webp"}


def media_type(body: bytes) -> str | None:
    """The content type from the file signature, or None when it is not an image."""
    return next((mime for magic, mime in IMAGE_TYPES.items() if body.startswith(magic)), None)
