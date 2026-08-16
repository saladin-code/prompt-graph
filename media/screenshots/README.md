# Screenshot-Platzhalter für PromptGraph Extension

Diese Screenshots werden in der Extension-Detailseite (`docs/EXTENSION.md`) verwendet.

---

## Benötigte Screenshots

### 1. `promptgraph-history.png`

**UI-Zustand:** PromptGraph Sidebar mit mehreren History-Einträgen

**Aufnahme:**
- PromptGraph Sidebar in der Activity Bar öffnen
- Mindestens 3-4 Prompt-Einträge sollten sichtbar sein
- Verschiedene Prompts mit unterschiedlichen Änderungsstatistiken
- Zeigt die Timeline-Ansicht mit Zeitstempeln und Prompt-Texten

**Empfohlene Größe:** ca. 400-600px Breite

---

### 2. `promptgraph-prompt-details.png`

**UI-Zustand:** Ausgewählter Prompt mit Dateiliste und Change-Stats

**Aufnahme:**
- Einen Prompt in der Sidebar auswählen
- Das Detail-Panel sollte sichtbar sein
- Liste der geänderten Dateien mit +/- Statistiken
- Idealerweise 2-4 geänderte Dateien sichtbar

**Empfohlene Größe:** ca. 600-800px Breite

---

### 3. `promptgraph-diff-viewer.png`

**UI-Zustand:** VS Code Diff-Ansicht einer geänderten Datei

**Aufnahme:**
- Auf "View Changes" bei einer Datei klicken
- Der native VS Code Side-by-Side Diff öffnet sich
- Zeigt hinzugefügte (grün) und entfernte (rot) Zeilen
- Idealerweise ein aussagekräftiger Code-Diff

**Empfohlene Größe:** ca. 800-1000px Breite

---

### 4. `promptgraph-tracking.png`

**UI-Zustand:** PromptGraph nach einem abgeschlossenen Kiro-Agent-Run

**Aufnahme:**
- Frisch abgeschlossener Kiro-Agent-Run
- Neuer History-Eintrag erscheint in der Sidebar
- Optional: Notification oder visuelles Feedback sichtbar
- Zeigt den automatischen Tracking-Ablauf

**Empfohlene Größe:** ca. 600-800px Breite

---

## Hinweise zur Aufnahme

- **Format:** PNG (bevorzugt) oder JPG
- **Qualität:** 2x Retina-Auflösung empfohlen für scharfe Darstellung
- **Hintergrund:** Dunkles oder helles Theme — konsistent halten
- **Sensible Daten:** Keine echten Projektnamen oder sensiblen Code in Screenshots
- **Dateigröße:** Unter 500KB pro Bild halten (für schnelles Laden)

---

## Nach dem Erstellen

1. Screenshots in diesen Ordner (`media/screenshots/`) ablegen
2. Die Dateinamen exakt wie oben angegeben verwenden
3. VSIX neu bauen: `npm run package:extension`
4. Extension-Seite prüfen: Die Bilder sollten in der Extension-Detailseite erscheinen
