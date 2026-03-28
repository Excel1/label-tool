export default {
  failed: 'Aktion fehlgeschlagen',
  success: 'Aktion war erfolgreich',
  annotation: {
    actions: {
      connect: 'Mit MQTT verbinden',
      mock: 'Mock-Bild in Queue',
      send: 'Bild senden',
      tools: 'Mehr',
      removeSelected: 'Ausgewaehlte Box loeschen'
    },
    status: {
      connected: 'Verbunden',
      disconnected: 'Nicht verbunden'
    },
    classSelect: 'Klasse',
    queue: 'Queue: {count}',
    currentFrame: 'Aktuelles Bild',
    labels: {
      title: 'Labels',
      deleteHint: 'Entf loescht die Auswahl',
      empty: 'Noch keine Labels vorhanden'
    },
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
