# Railway Volume Setup för Persistent Database

## Problem
SQLite-databasen raderas vid varje deploy eftersom den ligger i containerns ephemeral storage.

## Lösning: Railway Volume

### Steg 1: Skapa Volume i Railway
1. Gå till din app i Railway
2. Klicka på "Settings" tab
3. Scrolla ner till "Volumes"
4. Klicka "New Volume"
5. Konfigurera:
   - **Mount Path**: `/data`
   - **Name**: `wavee-database` (valfritt namn)
6. Klicka "Add"

### Steg 2: Uppdatera Environment Variables
1. Gå till "Variables" tab
2. Lägg till ny variabel:
   - **Name**: `DATABASE_PATH`
   - **Value**: `/data/outdoor-assistant.db`
3. Spara

### Steg 3: Redeploy
1. Railway kommer automatiskt redeploya
2. Databasen kommer nu sparas i `/data` (persistent)
3. Användare försvinner inte längre vid deploy!

## Verifiering
Efter deployment, kolla logs för:
```
[DATABASE] Using persistent storage: /data/outdoor-assistant.db
```

## Backup
För att ta backup av databasen:
```bash
railway run bash
sqlite3 /data/outdoor-assistant.db ".backup /tmp/backup.db"
exit
```

## Alternativ: PostgreSQL
Om du vill använda PostgreSQL istället (mer robust):
1. Lägg till PostgreSQL i Railway (via "New" → "Database" → "Add PostgreSQL")
2. Uppdatera koden för att använda PostgreSQL istället för SQLite
3. Railway sätter automatiskt `DATABASE_URL` environment variable

PostgreSQL rekommenderas för produktion, men SQLite med Volume fungerar för små/medelstora appar.
