# AGENT.md

## Ziel
Dieses Dokument definiert verbindliche Architektur- und UI-Regeln fuer das Projekt `label-tool` (Quasar + Vue 3 + Pinia + i18n).

## Produktkontext
- Das Tool empfaengt per MQTT ein Bild (base64-kodiert) und optional bestehende YOLO-Labels.
- Das Bild wird im Frontend angezeigt und fuer Annotation/Korrektur verwendet (Bounding Boxes fuer YOLO).
- Ergebnis wird wieder per MQTT auf ein anderes Topic gesendet: `image + labels`.
- MQTT-Payload-Format ist bewusst einfach und roh:
  - Eingehend/Ausgehend: `{ "image": "<base64>", "labels": "<yolo-label-string>" }`
  - `labels` ist ein String im YOLO-Format (mehrere Zeilen moeglich), keine Objektliste im Transport.

## Architektur
- Verwende eine klare Trennung zwischen `Service Layer` und `Store Layer`.
- `Service Layer` kuemmert sich um externe Kommunikation (MQTT, Mapping, Fehlerbehandlung, Retry).
- `Store Layer` (Pinia) verwaltet nur Frontend-State, orchestriert Aufrufe und kennt keine Transportdetails.
- Komponenten greifen nicht direkt auf MQTT zu, sondern nutzen Store/Services.

## Kommunikations-Stack
- Kein Axios/REST als Standardweg.
- Primare Kommunikation erfolgt direkt ueber MQTT (Empfangen und Senden von Daten).
- MQTT-Logik in dedizierten Services kapseln (z. B. `src/services/mqtt/*`).
- Topic-Namen, QoS und Payload-Formate zentral definieren (Konstanten/Typen), nicht verteilt in Komponenten.

## Konfiguration (.env)
- Verbindungsdaten und Laufzeit-Konfiguration ueber `.env` Dateien verwalten.
- Frontend-seitige Variablen nur mit geeignetem Prefix (z. B. `VITE_`) nutzen.
- Keine echten Secrets im Frontend-Bundle hinterlegen.
- Erwartete Variablen in einer `.env.example` dokumentieren.
- Betriebsmodus per `.env` umschaltbar (`mock` oder `mqtt`).
- Erlaubte Label-Klassen zentral per Konfiguration definieren (nicht hart in Komponenten).

## Mock-Modus (ohne Verbindung)
- Wenn keine MQTT-Verbindung verfuegbar ist, muss ein Mock-Modus nutzbar sein.
- Mock-Modus liefert Bild und optionale Labels aus `src/assets/mock/`.
- Verhalten (z. B. Labels an/aus, Intervall) ist ueber `.env` steuerbar.
- Mock und MQTT muessen dasselbe Payload-Schema bedienen, damit UI/Store austauschbar bleiben.

## Internationalisierung (i18n)
- App mindestens zweisprachig mit standardisierten Sprachcodes: Deutsch (`de-DE`) und Englisch (`en-US`).
- Kein harter UI-Text in Komponenten; alle sichtbaren Texte ueber i18n-Keys.
- Keys konsistent und domaenenbasiert benennen (z. B. `dialog.delete.title`).
- Neue Features muessen beide Sprachen gleichzeitig liefern.

## Komponentenstrategie
- Komponentenbasiertes Arbeiten mit Fokus auf Wiederverwendung.
- Komponenten nach Typ sortieren (z. B. `inputs/`, `selects/`, `cards/`, `dialogs/`).
- Neue Komponentenordner nur bei Bedarf anlegen.
- Props/Events/Slots klar und stabil halten, um Mehrfachnutzung zu erleichtern.

## Dialoge (Quasar Dialog Plugin)
- Quasar Dialog Plugin als Standard fuer modale Interaktionen verwenden.
- Jeder Dialog ist eine eigene Vue-Komponente (keine Inline-Dialoge in grossen Seitenkomponenten).
- Dialoge ueber eine zentrale Aufruffunktion starten, damit Aufrufmuster konsistent bleiben.
- Dialog-Inhalte duerfen wiederverwendbare Komponenten einbetten.

## Benachrichtigungen (Quasar Notify)
- Fuer alle Erfolgs- und Fehlermeldungen das `Notify` Plugin nutzen.
- Keine direkten `alert`/`console`-UX-Meldungen fuer User-Feedback.
- Meldungen konsistent halten (Typ, Text, Dauer, Position), idealerweise ueber Helper-Funktionen.
- Notify-Texte ebenfalls i18n-faehig halten.

## Qualitaetsregeln
- TypeScript-Typen fuer MQTT-Payloads, Service-Responses und Store-State definieren.
- Fehlerpfade immer behandeln (inkl. User-Feedback via Notify).
- Neue UI-Funktionen sollten mindestens auf Desktop und Mobile sauber funktionieren.
- Vor Merge: `npm run lint` und Build-Erfolg sicherstellen.

## Empfohlene Struktur (orientierend)
- `src/services/` fuer MQTT und fachliche Services.
- `src/stores/` fuer Pinia Stores.
- `src/components/inputs/`, `src/components/selects/`, `src/components/cards/`, `src/components/dialogs/` fuer UI nach Typ.
- `src/i18n/` fuer Sprachdateien und Key-Struktur.
