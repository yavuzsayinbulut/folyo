#!/bin/sh
# Gunluk veritabani ve foto yedegi. Ornek cron: 30 3 * * * /opt/folyo/backup.sh
# 14 gunden eski yedekler silinir. Yedekleri sunucu disina (S3, baska makine) kopyalamak ayrica ayarlanmali.
set -eu
cd "$(dirname "$0")"
STAMP=$(date +%Y%m%d-%H%M)
mkdir -p backups
docker compose -f compose.prod.yml exec -T db pg_dump -U folyo -d folyo --format=custom > "backups/db-$STAMP.dump"
docker compose -f compose.prod.yml run --rm --no-deps -v "$(pwd)/backups:/backups" --entrypoint sh api \
  -c "tar -czf /backups/media-$STAMP.tar.gz -C /data media"
find backups -type f -mtime +14 -delete
echo "Yedek tamam: backups/db-$STAMP.dump, backups/media-$STAMP.tar.gz"
