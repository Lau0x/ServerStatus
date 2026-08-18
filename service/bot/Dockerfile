FROM python:3.12-alpine

LABEL maintainer="lidalao"
LABEL description="Telegram Bot for ServerStatus"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
RUN addgroup -S -g 10001 app && adduser -S -D -H -u 10001 -G app app
COPY --chown=app:app ./bot.py .
USER app
CMD ["python", "-u", "./bot.py"]
