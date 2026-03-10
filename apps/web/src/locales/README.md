# Locale-Dateien

- Jede Sprache liegt als eigene JSON-Datei in diesem Ordner.
- Der Dateiname ist gleichzeitig der Sprachcode in der App, zum Beispiel `de.json`, `en.json` oder `fr.json`.
- Neue Dateien werden im Web-Client automatisch geladen und erscheinen direkt in der Sprachauswahl.
- Die Schlüssel sind aktuell flache Strings. Für Platzhalter werden Werte wie `{code}`, `{track}` oder `{count}` verwendet.
- `de.json` ist die Referenzdatei. Für neue Sprachen am besten zuerst `de.json` kopieren und dann nur die Werte übersetzen.
