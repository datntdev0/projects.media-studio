# The Playwright image already carries the browsers and their system libraries.
# The tag tracks the playwright version pinned in requirements.txt.
FROM mcr.microsoft.com/playwright/python:v1.62.0-noble

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000 \
    # Keeping the browser profile on a volume carries the Cloudflare clearance cookie
    # across restarts, which halves the first scrape after a boot.
    SCRAPER_USER_DATA_DIR=/data/profile

WORKDIR /app

COPY requirements.txt ./
# Scrapling drives patchright, which pins its own Chromium build - the one baked into
# this image belongs to playwright and sits under a different version directory.
RUN pip install --no-cache-dir -r requirements.txt \
    && scrapling install \
    && patchright install chromium

COPY entrypoint.sh ./
COPY app ./app
RUN chmod +x entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["./entrypoint.sh"]
