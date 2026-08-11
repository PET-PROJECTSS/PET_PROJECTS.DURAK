FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

ENV USE_PROXY=0 \
    APP_HOST=0.0.0.0 \
    APP_PORT=8080

EXPOSE 8080

CMD ["python", "main.py"]
