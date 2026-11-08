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

AKTUALISIERTE FORMEL (Version 2):
Grundwert = PLZ-Median * Wohnfläche * (Wohnfläche/100)^(-0.12)
+ Balkonäquivalent * PLZ-Median * 0.22 (kein Abzug einer Referenz-Balkonfläche)
+ Referenz-Abnutzung einer durchschnittlich unterhaltenen Wohnung
- tatsächlicher Alters-/Renovationsabzug.
Die Referenz-Abnutzung wird aus Bauteilkosten, Wohnfläche und typischen
Erneuerungsaltern abgeleitet, nicht pauschal als Prozentsatz des Verkaufspreises.
Der bisherige pauschale Faktor 1.06 entfällt.
Danach prozentuale Anpassungen für Typ, Stockwerk/Lift, Lage, Ruhe,
Aussicht, Qualität und Tageslicht.
Parkplätze: Ein Garagenplatz ist im Basiswert enthalten; jeder zusätzliche
Garagenplatz bringt einen Zuschlag, kein Garagenplatz einen Abschlag.
Aussenparkplätze werden weiterhin ab dem ersten Platz zusätzlich bewertet.
Diese Referenzannahmen sind nicht empirisch belegt; bitte mit Marktobjekten prüfen.
