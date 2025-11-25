# Slack Status Bot - Electron App Architecture

## Übersicht
Die Cross-Platform Desktop-App wird als **Electron-App** implementiert mit einer React-basierten UI und Node.js/JavaScript im Main-Process für Systemintegration und Daemon-Kommunikation.

## Tech-Stack
- **Framework**: Electron 27.x
- **Frontend**: React 18.2.x + TypeScript
- **Styling**: CSS3 mit modernem Design
- **Dependency Management**: npm
- **Packaging**: electron-builder
- **Cross-Platform**: macOS (Intel + ARM), Windows, Linux

## Struktur

```
app/
├── public/
│   ├── electron.js          # Main-Process (Electron)
│   ├── preload.js           # Context Bridge für IPC Sicherheit
│   ├── index.html           # HTML Entry Point
│   ├── entitlements.mac.plist # macOS App Signing
│   └── icon.png             # App Icon (256x256+)
├── src/
│   ├── index.tsx            # React Entry Point
│   ├── App.tsx              # Haupt-App Komponente mit Navigation
│   ├── pages/
│   │   ├── Dashboard.tsx    # Status & Quick Actions
│   │   └── Settings.tsx     # Konfiguration (Token, Quellen, System)
│   ├── services/
│   │   └── ipcService.ts    # IPC-Kommunikations-Service
│   └── styles/
│       ├── index.css        # Globale Styles
│       ├── App.css          # App Layout & Navigation
│       ├── Dashboard.css    # Dashboard Styles
│       └── Settings.css     # Settings Styles
├── package.json             # npm Dependencies + Konfiguration
├── tsconfig.json            # TypeScript Config für src/
├── tsconfig.node.json       # TypeScript Config für Electron
└── README.md
```

## Komponenten

### Main Process (`electron.js`)
- **Window Management**: BrowserWindow erstellen/managen
- **Tray Icon**: Kontextmenü mit Quick Access
- **IPC Handler**: Kanäle für Daemon-Kommunikation
- **Auto-Start**: Konfiguration für Autostart beim Login
- **Config Store**: Persistente Konfiguration mit `electron-store`

### React App (`App.tsx`)
- **Navigation**: Dashboard ↔ Settings
- **Status Badge**: Online/Offline Anzeige
- **IPC Hooks**: Statusupdates vom Daemon

### Dashboard (`Dashboard.tsx`)
- Aktuelle Slack-Status anzeigen
- 3 Quick-Status-Button (Online/Away/DND)
- Custom Status Message Input
- Aktive Quellen anzeigen (Spotify, Teams, Zoom, Huddle, Apple Music)
- Quellen toggeln (Enable/Disable)
- Quick Actions (Break, Meeting, Focus, Travel, Sick, Holiday)

### Settings (`Settings.tsx`)
- Slack Bot Token eingeben (masked)
- Quellen konfigurieren (Enable/Disable)
- System-Optionen (Focus Mode, Auto-Start)
- Config speichern → IPC zum Main-Process

## IPC-Kanäle (React ↔ Electron Main)

### Config Management
- `config:get` → Promise<Config>
- `config:set` → Promise<{success: boolean}>
- `config:updated` (broadcast) → aktualisierte Config

### Daemon Status
- `daemon:getStatus` → Promise<boolean> (online/offline)
- `daemon:status` (broadcast) → boolean

### Quellen
- `sources:getStatus` → Promise<SourceStatus[]>
- `sources:toggle` → Promise<{success: boolean}>
- `sources:updated` (broadcast) → SourceStatus[]

### Slack API
- `slack:setStatus` → Promise<{success: boolean}>
- `slack:setPresence` → Promise<{success: boolean}>

## Daemon Integration

Das Electron-Backend kommuniziert mit dem bestehenden Bash-Daemon über:
1. **Config-Datei**: Liest/schreibt `~/.config/slack-status-bot/config.json`
2. **Status-Socket**: IPC-Socket oder HTTP-API für Statusupdates
3. **Command-Befehle**: Startet die bash-Skripte direkt (mit `spawnSync`)

*Später: Full TypeScript/Go Reimplementierung des Daemons möglich*

## Tray Menu

```
┌─────────────────────────────────────┐
│  🟢 Slack Status Bot                │
├─────────────────────────────────────┤
│  Show (↔ Window)                    │
├─────────────────────────────────────┤
│  Status: Online                     │
├─────────────────────────────────────┤
│  Quick Actions:                     │
│    ├─ 🟢 Online                     │
│    ├─ 🟡 Away                       │
│    ├─ 🔴 Do Not Disturb             │
│    ├─ ────                          │
│    ├─ ☕ Break                       │
│    └─ 📞 Meeting                    │
├─────────────────────────────────────┤
│  Quit                               │
└─────────────────────────────────────┘
```

## Build & Packaging

### Entwicklung
```bash
npm run dev      # React + Electron Watch
npm run electron-dev  # Nur Electron
npm run react-start   # Nur React
```

### Production Build
```bash
npm run build    # React build + Electron build + Package
npm run dist     # Distribuierbare Binaries (DMG, MSI, AppImage)
npm run pack     # Schneller Build ohne Packaging
```

### Ausgaben
- **macOS**: `dist/Slack Status Bot-${version}.dmg`, `.zip`
- **Windows**: `dist/Slack Status Bot Setup ${version}.exe`, `-portable.exe`
- **Linux**: `dist/slack-status-bot-${version}.AppImage`, `.deb`

## Design & UX

### Farbschema
- **Primary**: `#667eea` (Blau-Lila)
- **Accent**: `#764ba2` (Dunkelviolett)
- **Gradient**: 135° von Primary zu Accent
- **Text**: `#333` (dunkelgrau), `#9ca3af` (hellgrau)
- **Success**: `#22c55e` (grün)
- **Error**: `#ef4444` (rot)

### Komponenten
- **Modern Glassmorphism**: Navbar mit backdrop-filter
- **Smooth Transitions**: 0.3s ease auf allen Interaktionen
- **Responsive Grid**: Grid-Layout für Dashboard & Actions
- **Toggle Switches**: Custom styled für Settings
- **Status Badges**: Inline mit Animation

## Sicherheit

1. **Context Isolation**: `contextIsolation: true` in BrowserWindow
2. **Preload Script**: Sichere IPC via `contextBridge`
3. **No Node Integration**: `nodeIntegration: false`
4. **Content Security**: Meta-Tags in HTML
5. **Code Signing**: macOS + Windows (später mit CI)

## Nächste Schritte

1. ✅ Struktur & UI fertigstellen
2. ⏳ Daemon-Kommunikation implementieren (IPC/HTTP)
3. ⏳ Tests für React-Komponenten (Jest + React Testing Library)
4. ⏳ CI/CD für Builds (GitHub Actions)
5. ⏳ Code-Signing & Notarization (macOS + Windows)
6. ⏳ Auto-Update Mechanismus
7. ⏳ Installer Konfiguration (NSIS für Windows, DMG für macOS)
