# sticky-board

Ein digitales Sticky-Board gebaut mit Next.js 14, TypeScript und Tailwind CSS. Als Session-Store wird Redis verwendet.

## Voraussetzungen

- [Node.js](https://nodejs.org/) (v18 oder neuer)
- [Docker](https://www.docker.com/) und Docker Compose

## Projekt starten

```bash
docker-compose up -d && npm install && npm run dev
```

Die drei Befehle im Einzelnen:

| Befehl | Beschreibung |
|--------|--------------|
| `docker-compose up -d` | Startet den Redis-Container im Hintergrund |
| `npm install` | Installiert alle Node.js-Abhängigkeiten |
| `npm run dev` | Startet den Next.js-Entwicklungsserver |

Die Anwendung ist anschließend unter [http://localhost:3000](http://localhost:3000) erreichbar.

## Umgebungsvariablen

Die Datei `.env.local` enthält die lokalen Konfigurationswerte:

| Variable | Standardwert | Beschreibung |
|----------|-------------|--------------|
| `REDIS_URL` | `redis://localhost:6379` | Verbindungs-URL zum Redis-Server |
| `NEXTAUTH_SECRET` | `localsecret` | Secret für NextAuth.js (bitte in Produktion ersetzen) |

## Verfügbare Skripte

```bash
npm run dev      # Entwicklungsserver starten
npm run build    # Produktions-Build erstellen
npm run start    # Produktions-Build starten
npm run lint     # Code-Qualität prüfen
```

## Redis stoppen

```bash
docker-compose down
```
