# syntax=docker/dockerfile:1
# check=skip=JSONArgsRecommended
FROM python:3.13-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /srv

RUN apt-get update \
    # install build tools only
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
LABEL org.opencontainers.image.source="https://github.com/example/app" version=1.0
EXPOSE 8000/tcp
USER 1000:1000
STOPSIGNAL SIGINT
CMD python -m app --port "${PORT:-8000}" > /dev/stdout 2>&1
