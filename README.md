# ioBroker.elevenlabs-tts

Liest einen Text aus einem Datenpunkt, erzeugt per ElevenLabs Text-to-Speech eine MP3-Datei und speichert sie in einem Ordner.

## Funktionsweise

- Der Adapter abonniert den konfigurierten Datenpunkt (und zusätzlich `elevenlabs-tts.0.speak`).
- Bei jeder Änderung mit nicht-leerem Text wird der Text an ElevenLabs geschickt.
- Die MP3-Datei wird atomar in den Ausgabeordner geschrieben.
- Aufträge werden nacheinander abgearbeitet (Warteschlange).
- Nach erfolgreicher Erzeugung wird die neue Datei gemeldet (siehe "Signal für andere Programme").

## Installation

Voraussetzungen: Node.js 18 oder neuer, js-controller 5.0.19 oder neuer, Admin 6 oder neuer.

Der Adapter steht nicht im offiziellen ioBroker-Repository und wird deshalb direkt von GitHub installiert. Das geht auf dem ioBroker-Rechner (z. B. Raspberry Pi) per SSH:

```bash
cd /opt/iobroker
iobroker url https://github.com/SteinchenIO/ioBroker.elevenlabs-tts
```

Danach in der Admin-Oberfläche unter **Instanzen** prüfen, ob `elevenlabs-tts.0` vorhanden ist. Falls nicht:

```bash
iobroker add elevenlabs-tts
```

Anschließend in den Instanz-Einstellungen API-Key, Voice-ID, Quell-Datenpunkt und Ausgabeordner eintragen.

### Wichtig: nicht von Hand nach `node_modules` kopieren

Ein von Hand nach `/opt/iobroker/node_modules/` kopierter Ordner steht nicht in der `package.json` von ioBroker. Beim nächsten `npm install` (z. B. bei einem Adapter-Update) wird er dann als überflüssig entfernt, und die Instanz meldet `startInstance cannot find adapter`. Die Installation über `iobroker url` trägt den Adapter dagegen ein und schützt ihn.

### Update

Erneut denselben Befehl ausführen:

```bash
cd /opt/iobroker
iobroker url https://github.com/SteinchenIO/ioBroker.elevenlabs-tts
```

Die Instanz-Einstellungen bleiben erhalten.

### Ausgabeordner

Der Ordner aus der Konfiguration muss für den Benutzer `iobroker` beschreibbar sein, z. B.:

```bash
sudo chown iobroker:iobroker /media/stimme
```

### Deinstallation

```bash
iobroker del elevenlabs-tts
```

## ElevenLabs-Konto

- API-Key: Bei eingeschränkten Keys müssen "Text zu Sprache" und "Benutzer" (`user_read`) freigegeben sein. Verwende den geheimen Schlüssel (beginnt mit `sk_`), nicht die Key-ID.
- Im kostenlosen Plan sind Stimmen aus der Bibliothek über die API nicht erlaubt (HTTP 402 `paid_plan_required`). Nutze eine Stimme aus "Meine Stimmen" oder eine mit "Voice Design" erzeugte Stimme und trage ihre Voice-ID ein.

## Signal für andere Programme

Wenn eine MP3 fertig geschrieben ist, passiert in dieser Reihenfolge:

1. `lastFile` (voller Pfad) und `lastFileName` (nur Dateiname) werden gesetzt.
2. `newFile` wechselt auf `true` und fällt nach 1 Sekunde wieder auf `false` (Impuls). Andere Adapter oder Skripte reagieren auf `newFile == true` und lesen danach `lastFile`.
3. Der auslösende Datenpunkt (Quell-Datenpunkt oder `speak`) wird mit `ack=true` bestätigt. Das geschieht nur, wenn er mit `ack=false` geschrieben wurde und sich der Wert in der Zwischenzeit nicht geändert hat.

Bei einem Fehler wird nichts bestätigt und `newFile` bleibt `false`; die Meldung steht in `lastError`.

Beispiel (JavaScript-Adapter):

```js
on({ id: 'elevenlabs-tts.0.newFile', val: true }, () => {
    const file = getState('elevenlabs-tts.0.lastFile').val;
    // Datei abspielen, weiterleiten, ...
});
```

## Datenpunkte

| Datenpunkt | Beschreibung |
|---|---|
| `speak` | Text hier hineinschreiben, um ihn zu vertonen |
| `newFile` | Impuls: `true` für 1 Sekunde, sobald eine neue MP3 fertig ist |
| `lastFile` | Vollständiger Pfad der zuletzt erzeugten MP3 |
| `lastFileName` | Dateiname der zuletzt erzeugten MP3 |
| `lastText` | Zuletzt vertonter Text |
| `lastError` | Letzte Fehlermeldung |
| `processing` | `true` während einer Konvertierung |
| `info.connection` | API erreichbar |

## Dateinamen

- **Zeitstempel**: jede Datei neu, z. B. `20261001_223500_123.mp3`
- **Fester Name**: immer dieselbe Datei, wird überschrieben
- **Hash**: gleicher Text, gleiche Stimme, gleiches Modell ergibt dieselbe Datei

## Hinweise

- Der API-Key wird verschlüsselt in der Instanzkonfiguration gespeichert.
- ElevenLabs rechnet nach Zeichen ab. Mit "Maximale Textlänge" lässt sich das begrenzen.
- Die Modellnamen und Audioformate in der Admin-Oberfläche können sich bei ElevenLabs ändern.
- Der Adapter läuft mit `compact: false` als eigener Prozess.

## License

MIT
