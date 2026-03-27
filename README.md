# Sticky Board

Ein kollaboratives Echtzeit-Whiteboard mit Sticky Notes. Mehrere Nutzer können gleichzeitig Notizen erstellen, verschieben und bearbeiten – alle Änderungen werden sofort über Server-Sent Events synchronisiert.

## Features

- Gemeinsames Echtzeit-Board für alle eingeloggten Nutzer
- Drag & Drop für alle Notizen (ohne externe Bibliothek)
- Inline-Textbearbeitung per Doppelklick
- Nutzer-spezifische Farben (einmalig gewählt, dauerhaft gespeichert)
- Online-Präsenz-Anzeige in der Kopfzeile
- Eigentümerprüfung: Nur der Ersteller kann seine Note bearbeiten oder löschen
- Persistenter Datenspeicher via Redis

## Technologie-Stack

| Schicht | Technologie |
|---------|-------------|
| Framework | Next.js 14 (App Router), React 18 |
| Styling | Tailwind CSS |
| Auth | next-auth v4 · CredentialsProvider · JWT |
| Echtzeit | Server-Sent Events (SSE) + Redis Pub/Sub |
| Datenbank | Redis 7 via ioredis |
| Passwörter | bcryptjs (Faktor 12) |

## Voraussetzungen

- [Node.js](https://nodejs.org/) v18 oder neuer
- [Docker](https://www.docker.com/) und Docker Compose (für Redis)

## Installation

### 1. Repository klonen

```bash
git clone <repo-url>
cd sticky-board
```

### 2. Umgebungsvariablen anlegen

Erstelle eine `.env.local` Datei im Projektverzeichnis:

```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<zufälliger-string>
REDIS_URL=redis://localhost:6379
```

> `NEXTAUTH_SECRET` generieren: `openssl rand -base64 32`

### 3. Redis starten

```bash
docker-compose up -d
```

Redis läuft danach auf `localhost:6379`. Daten werden im Docker-Volume `redis_data` persistiert.

### 4. Abhängigkeiten installieren

```bash
npm install
```

### 5. Entwicklungsserver starten

```bash
npm run dev
```

Die Anwendung ist unter [http://localhost:3000](http://localhost:3000) erreichbar.
Beim ersten Aufruf zur `/register`-Seite navigieren, um einen Account zu erstellen.

## Verfügbare Skripte

```bash
npm run dev      # Entwicklungsserver mit Hot-Reload
npm run build    # Produktions-Build erstellen
npm run start    # Produktions-Build starten
npm run lint     # ESLint-Prüfung
```

## Redis verwalten

```bash
docker-compose up -d     # Redis starten
docker-compose down      # Redis stoppen (Daten bleiben erhalten)
docker-compose down -v   # Redis stoppen und alle Daten löschen
```

## Architektur

```
Browser
  └── Next.js App Router
        ├── /login, /register          Auth-Seiten (Client Components)
        ├── /board                     Server Component lädt Initialdaten,
        │                              übergibt an interaktiven Client
        └── /api
              ├── auth/[...nextauth]   NextAuth-Handler (Login / Session)
              ├── register             Benutzer anlegen
              ├── notes                GET alle Notes / POST neue Note
              ├── notes/[noteId]       PATCH Position & Text / DELETE
              ├── events               SSE-Stream (je Client eigene Redis-Verbindung)
              └── user/color           Nutzerfarbe lesen / einmalig setzen
```

### Redis-Schlüsselschema

| Schlüssel | Typ | Inhalt |
|-----------|-----|--------|
| `note:{id}` | Hash | alle Felder einer Note |
| `board:main:notes` | Set | IDs aller Notes des gemeinsamen Boards |
| `user:{id}` | Hash | Benutzerdaten (gehashtes Passwort) |
| `username:{name}` | String | Reverse-Lookup: Username → User-ID |
| `user:{id}:color` | String | Nutzerfarbe (permanent nach erster Wahl) |
| `online:users` | Hash | userId → `{name, color}` für aktive SSE-Clients |
| `board:main:events` | Pub/Sub | Echtzeit-Kanal für Board-Events |

### SSE-Architektur

Jede SSE-Verbindung (`/api/events`) bekommt eine **eigene** ioredis-Instanz im Subscribe-Modus, weil ioredis eine Verbindung nach dem ersten `SUBSCRIBE`-Aufruf sperrt. Die globale Singleton-Verbindung wird ausschließlich zum Schreiben und Publizieren verwendet.

## Projektstruktur

```
app/
  api/                  API-Routen (alle mit try/catch Error-Handling)
  board/
    Board.tsx           Hauptkomponente: SSE, Drag & Drop, CRUD
    StickyNote.tsx      Einzelne Notiz mit Drag-Handle und Inline-Edit
    ColorSetup.tsx      Einmaliges Farb-Auswahl-Overlay
    SignOutButton.tsx   Logout
  login/ register/      Auth-Seiten
lib/
  redis.ts              Datenschicht + Umgebungsvariablen-Validierung
  auth.ts               NextAuth-Konfiguration
types/
  index.ts              Zentrale TypeScript-Interfaces (Note, User, BoardEvent …)
  next-auth.d.ts        Session-Typ-Erweiterung für user.id
middleware.ts           Route-Schutz für /board/*
```
