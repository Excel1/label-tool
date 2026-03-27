export default {
  failed: 'Aktion fehlgeschlagen',
  success: 'Aktion war erfolgreich',
  annotation: {
    actions: {
      connect: 'MQTT starten',
      mock: 'Mock-Bild in Queue',
      send: 'Aktuelles senden',
      removeSelected: 'Ausgewaehlte Box loeschen'
    },
    classSelect: 'Klasse',
    queue: 'Queue: {count}',
    currentFrame: 'Aktuelles Bild',
    instructions: 'Klasse waehlen, mit Linksklick Box ziehen, per Ziehen verschieben/anpassen. Mit Mausrad zoomen und mit Rechtsklick ziehen verschieben.',
    empty: 'Queue ist leer. Starte MQTT oder lade ein Mock-Bild.',
    notify: {
      connected: 'MQTT verbunden',
      connectFailed: 'MQTT-Verbindung fehlgeschlagen',
      mockQueued: 'Mock-Bild wurde in die Queue gelegt',
      mockFailed: 'Mock-Bild konnte nicht geladen werden',
      imageLoadFailed: 'Bild konnte nicht angezeigt werden',
      sent: 'Bild und Labels wurden gesendet',
      sendFailed: 'Senden fehlgeschlagen'
    }
  }
};
