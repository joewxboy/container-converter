# Python Flask application
FROM python:3.11-slim

LABEL org.opencontainers.image.title="Python API Service"
LABEL org.opencontainers.image.version="2.1.0"
LABEL org.opencontainers.image.description="REST API service built with Flask"

# Environment variables
ENV FLASK_APP=app.py
ENV FLASK_ENV=production
ENV PORT=8080
ENV WORKERS=4
ENV DEBUG=false

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create non-root user
RUN useradd -m appuser
USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD curl -f http://localhost:8080/health || exit 1

CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:8080", "app:app"]
