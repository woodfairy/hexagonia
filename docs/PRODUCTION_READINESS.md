# Hexagonia: Arbeitsstand und Freigabekriterien

Das Ziel bleibt ein vollständig spielbares, regelgetreues Basisspiel mit Seefahrer-Erweiterung und einer immersiven, auf Desktop und Mobilgeräten geprüften 3D-Spielansicht. Der aktuelle Stand ist **noch nicht produktionsreif**.

## Referenz und Arbeitsbasis

- Repository: `woodfairy/hexagonia`, Ausgangscommit `dc723fea4a0a674f9a844b9f96d03ab05ab5f55f`.
- Arbeitsbranch: `codex/immersive-seafarers`.
- Offizielle Regelhefte von 2025 liegen unter `references/seafarers/`; die Szenarien für drei/vier sowie fünf/sechs Spieler müssen getrennt geprüft werden.
- Der Nutzer hat Installation, Build und Startbefehle ausdrücklich freigegeben. Es werden keine neuen Unit- oder Regressionstests geschrieben.

## Bisher umgesetzt

- Spielstand, Metadaten und sämtliche neuen Ereignisse werden in einer Datenbanktransaktion gespeichert. Zuvor wurde nur das letzte Ereignis einer Aktion separat gespeichert.
- Spielaktionen, Beitritte und relevante Verbindungsänderungen werden innerhalb eines Serverprozesses pro Partie nacheinander verarbeitet. Der Cache wird bei diesen Änderungen erst nach erfolgreicher Speicherung aktualisiert.
- Schiffbewegungen sind serverseitig auf eine Bewegung pro Spieler und Zug begrenzt. Die Sonderbauphase erlaubt kein Versetzen. Fremde Gebäude schließen ein ansonsten offenes Ende nicht als eigenes Gebäude ab.
- Die 3D-Szene gibt Renderer, Szene, Steuerung und Schattenressourcen beim Abbau frei und setzt ihre Referenzen für einen erneuten Aufbau zurück.
- Unterbrochene WebGL-Kontexte und fehlende Grafikunterstützung erhalten übersetzte Statusmeldungen. Unsichtbare Dokumente pausieren das Rendern. Kameraanimationen berücksichtigen Zeitabstände und reduzierte Bewegung.
- Eine erste neue Spielansicht verwendet eine durchgehende 3D-Fläche und eine einklappbare mobile Bedienleiste. Der Kameraausschnitt berücksichtigt verdeckende Bedienflächen. Diese Gestaltung muss noch in echten Partien visuell geprüft und weiter ausgearbeitet werden.
- Aufgedeckte TypeScript-Fehler in Übersetzungsaufrufen, Seefahrer-Darstellung und optionalen Eigenschaften wurden behoben, ohne die strengen Compileroptionen abzuschalten.

## Prüfstand vom 5. September 2026

- Produktionsbuild aller vier Pakete erfolgreich; danach wurden weitere kleine Quellcodeänderungen vorgenommen, die erneut gebaut werden müssen.
- Web-Typprüfung erfolgreich nach Bereinigung der vorgefundenen Fehler.
- Vorhandene Regelsuite: 33 erfolgreich, 7 fehlgeschlagen. Fehlermeldungen betreffen alte Board-Generator-Aufrufe, feste Brett-IDs und eine deutsche Fehlermeldung statt des Fehlercodes. Die einzelnen Prüfungen müssen inhaltlich eingeordnet werden; die Suite beweist keine vollständige Regelkonformität.
- Startseite im lokalen Browser geladen und visuell betrachtet. Eine vollständige Partie wurde noch nicht im Browser geprüft.
- Der Build enthält sechs WAV-Dateien mit jeweils etwa 28–35 MB und ein großes initiales JavaScript-Bündel. Medienauslieferung und Aufteilung des Clients sind offen.

## Noch erforderliche Arbeit

1. Lokale PostgreSQL-Instanz und Backend starten; Anmeldung, Räume und echte Mehrspielerpartien prüfen.
2. Alle Basisspielregeln und sämtliche Seefahrer-Szenarien einschließlich ihrer Originalaufbauten, Sonderwertungen, Nebelfelder, Piraten, Schiffbewegungen und Regeln für fünf/sechs Spieler systematisch gegen die offiziellen Hefte prüfen.
3. Serverhärtung vervollständigen: konkurrierende Raumaktionen, Initialisierung und Beendigung von Partien, Wiederverbindung nach Neustarts, Origin-Prüfung, Zugriffsschutz, Anfragelimits und Fehlerbehandlung prüfen. Eine lokale Warteschlange ist kein Nachweis für einen Betrieb mit mehreren Serverinstanzen.
4. Das visuelle Redesign im laufenden Spiel weiterentwickeln: Gelände, Wasser, Spielsteine, Kamera, Auswahl und kontextbezogene Aktionen sowie Startseite und Lobby gemeinsam beurteilen.
5. Desktop, schmale Mobilansicht, Tablet, Querformat, Bildschirmtastatur, sichere Bildschirmränder, Fokusführung, reduzierte Bewegung und WebGL-Wiederherstellung prüfen. Echte Safari-Prüfungen bleiben erforderlich.
6. Audio- und Grafikressourcen optimieren; Ladezeit, Speicher, Leerlauflast und Wiederaufbau messen.
7. Veraltete Implementierungen und widersprüchliche Layoutregeln gezielt entfernen. Keine Bereinigung darf gültige Regeln oder benötigte Bedienwege entfernen.
8. Abschließend Produktionsbuild, vollständige Typprüfung, relevante vorhandene Prüfungen und dokumentierte Browserdurchläufe am finalen Stand ausführen. Erst dann Freigabe und gegebenenfalls Pull Request vorbereiten.

Ein erfolgreicher Build oder eine einzelne grüne Prüfung ersetzt keines dieser Freigabekriterien.
