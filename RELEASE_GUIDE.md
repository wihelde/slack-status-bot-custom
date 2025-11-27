# Release Guide - Slack Status Bot

Dieses Dokument beschreibt den korrekten Prozess, um eine neue Version zu releassen, mit Git-Tags und automatischer Pipeline-Auslösung.

## ✅ Kompletter Release-Prozess

### Schritt 1: Code-Änderungen abschließen
```bash
cd /Users/martin/Projects/slack-status-bot-custom
git status  # Überprüfe, dass alle Änderungen committed sind
```

### Schritt 2: Version-Nummern synchronisieren

#### 2a. `app/package.json` aktualisieren
```bash
# Öffne die Datei und ändere die Version:
# "version": "X.Y.Z"  →  "version": "X.Y.(Z+1)"
```

Beispiel: von `1.2.0` zu `1.2.1`

#### 2b. `app/package-lock.json` aktualisieren
```bash
# Aktualisiere auch hier die Version (2 Stellen):
# - Zeile 3: "version": "X.Y.Z"
# - Zeile 9: "version": "X.Y.Z"
```

#### 2c. `app/CHANGELOG.md` aktualisieren
```markdown
## [1.2.1] - 2025-11-27
- Feature 1
- Bugfix 2
- Feature 3
```

### Schritt 3: Alle Änderungen committen
```bash
git add app/package.json app/package-lock.json app/CHANGELOG.md
git commit -m "chore: bump version to 1.2.1"
git push
```

### Schritt 4: Git-Tag erstellen und pushen
```bash
# Tag mit der neuen Version erstellen
git tag -a v1.2.1 -m "Release version 1.2.1"

# Tag zu GitLab pushen (triggert die Pipeline!)
git push origin v1.2.1
```

### Schritt 5: Pipeline überwachen
- Gehe zu GitLab: https://gitlab.com/wihel_de/slack-status-bot-custom
- Klick auf "Deployments" → "Releases"
- Die Pipeline sollte automatisch ein Release erstellen
- Das DMG-File wird automatisch angehängt

---

## 🚨 Wichtige Punkte

### ❌ HÄUFIGE FEHLER

1. **Nur `package.json` ändern, `package-lock.json` nicht**
   - ❌ FALSCH: `npm install` oder Build regeneriert `package-lock.json` mit alter Version
   - ✅ RICHTIG: Beide Dateien mit gleicher Version committen

2. **Tag vor dem Commit erstellen**
   - ❌ FALSCH: `git tag v1.2.1` → `git add/commit` → `git push origin v1.2.1`
   - ✅ RICHTIG: `git add/commit` → `git push` → `git tag v1.2.1` → `git push origin v1.2.1`

3. **Vergessen, die Changes zu committen**
   - ❌ FALSCH: Version in IDE ändern, aber nicht speichern/committen
   - ✅ RICHTIG: Immer `git status` überprüfen, dass alles committed ist

4. **Wrong branch**
   - ❌ FALSCH: Release von `app` branch statt `master`
   - ✅ RICHTIG: Immer auf `master` branch sein

### ✅ CHECKLISTE VOR JEDEM RELEASE

- [ ] Alle Code-Änderungen sind tested und committed
- [ ] `app/package.json` Version wurde erhöht
- [ ] `app/package-lock.json` Version wurde erhöht (beide Stellen)
- [ ] `app/CHANGELOG.md` wurde aktualisiert
- [ ] Alle Änderungen sind committed: `git status` zeigt "nothing to commit"
- [ ] Aktuell auf `master` branch: `git branch` zeigt `* master`
- [ ] Git-Tag wurde erstellt: `git tag v1.2.1`
- [ ] Tag wurde gepusht: `git push origin v1.2.1`
- [ ] GitLab Pipeline läuft und erstellt Release

---

## 📋 Quick-Reference (Kopier-Paste)

```bash
# 1. Alle Änderungen committen
git add .
git commit -m "feat: new feature"
git push

# 2. Versionen aktualisieren (manuell in den 3 Dateien)
# app/package.json:       "version": "1.2.1"
# app/package-lock.json:  "version": "1.2.1" (2x)
# app/CHANGELOG.md:       ## [1.2.1] - DATE

# 3. Version-Commit
git add app/package.json app/package-lock.json app/CHANGELOG.md
git commit -m "chore: bump version to 1.2.1"
git push

# 4. Release-Tag
git tag -a v1.2.1 -m "Release version 1.2.1"
git push origin v1.2.1

# 5. GitLab überwachen:
# https://gitlab.com/wihel_de/slack-status-bot-custom/releases
```

---

## 🔄 Wenn etwas schiefgeht

### Tag löschen und neu erstellen
```bash
# Lokal
git tag -d v1.2.1

# Remote
git push origin --delete v1.2.1

# Neu erstellen
git tag -a v1.2.1 -m "Release version 1.2.1"
git push origin v1.2.1
```

### Commit-Nachricht korrigieren
```bash
# Letzten Commit ändern
git commit --amend -m "neue nachricht"
git push --force-with-lease  # Nur wenn noch nicht gepusht!
```

### Version rollback
```bash
# Letzten Commit rückgängig machen
git revert HEAD
git push
```

---

## 📚 Weitere Ressourcen

- GitLab Releases: https://gitlab.com/wihel_de/slack-status-bot-custom/releases
- GitLab CI/CD Pipeline: `.gitlab-ci.yml`
- Package.json Spec: https://docs.npmjs.com/cli/v10/configuring-npm/package-json

