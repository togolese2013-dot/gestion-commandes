#!/bin/bash
set -e

APP_DIR="/opt/gestion-commandes"

echo "→ Pulling latest code..."
cd "$APP_DIR"
git pull origin main

echo "→ Building Docker image..."
docker compose build --no-cache

echo "→ Restarting app..."
docker compose up -d

echo "→ Cleaning old images..."
docker image prune -f

echo "✓ Deploy done. Logs: docker compose logs -f"
