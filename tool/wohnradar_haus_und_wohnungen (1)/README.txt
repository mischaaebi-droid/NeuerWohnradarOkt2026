WOHNRADAR – Haus und Eigentumswohnung

Dateien alle im gleichen Ordner ablegen:
index.html              Einfamilienhaus
app.js                  Original-Berechnung Einfamilienhaus (unverändert)
immobilienpreise.json   Original-Hauspreise (unverändert)
wohnungen.html          Eigentumswohnung
wohnungen.js            Eigenständige Wohnungsbewertung
wohnungspreise.json     3’172 PLZ-Medianpreise aus RealAdvisor-Wohnungs-CSV
styles.css              Gemeinsames Original-CSS (unverändert)

Lokaler Test: im Ordner python -m http.server 8000 starten, dann
http://localhost:8000/index.html oder /wohnungen.html öffnen.

MODELLHINWEIS: Die CSV enthält ausschliesslich PLZ-Preisniveaus, keine Einzelobjekte.
Wohnfläche, Balkone, Alter, Lift, Stockwerk, Lage und Parkplätze werden mit
expliziten heuristischen Annahmen bewertet. Diese sind NICHT regressionsbasiert
oder an tatsächlich beobachteten Transaktionen validiert.

Formel: Grundwert = PLZ-Median * Wohnfläche * (Wohnfläche/100)^(-0.12) * 1.06
+ Balkonäquivalent * PLZ-Median * 0.22
- Summe zeitwertbezogener Renovationsabzüge
anschliessend prozentuale Anpassungen für Wohnungstyp, Stockwerk/Lift, Lage,
Ruhe, Aussicht, Qualität und Tageslicht; zuzüglich separat bewerteter Parkplätze.
Für Balkone über 40 m² wird die darüber liegende Fläche nur zu 35 % angerechnet.
Wichtige Einschränkung: Ob Parkplätze in den RealAdvisor-PLZ-Medianen enthalten
sind, ist unbekannt. Die separate Bewertung kann dadurch zu Doppelzählung führen.
