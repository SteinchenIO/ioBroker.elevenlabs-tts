# ioBroker.elevenlabs-tts

Liest einen Text aus einem Datenpunkt, erzeugt per ElevenLabs Text-to-Speech eine MP3-Datei und speichert sie in einem Ordner.

## Funktionsweise

- Der Adapter abonniert den konfigurierten Datenpunkt (und zusätzlich `elevenlabs-tts.0.speak`).
- Bei jeder Änderung mit nicht-leerem Text wird der Text an ElevenLabs geschickt.
- Die MP3-Datei wird atomar in den Ausgabeordner geschrieben.
- Aufträge werden nacheinander abgearbeitet (Warteschlange).

## Installation

1. Ordner `iobroker.elevenlabs-tts` nach `/opt/iobroker/node_modules/` kopieren (oder per `npm i <pfad>`).
2. Im ioBroker-Verzeichnis: `iobroker upload elevenlabs-tts` und `iobroker add elevenlabs-tts`.
3. In den Instanz-Einstellungen API-Key, Voice-ID, Quell-Datenpunkt und Ausgabeordner eintragen.

Voraussetzungen: Node.js 18 oder neuer, js-controller 5.0.19 oder neuer, Admin 6 oder neuer.

## Datenpunkte

| Datenpunkt | Beschreibung |
|---|---|
| `speak` | Text hier hineinschreiben, um ihn zu vertonen |
| `lastFile` | Vollständiger Pfad der zuletzt erzeugten MP3 |
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

## License

MIT
