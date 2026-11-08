WOHNRADAR – Bauland-Integration

Alle Dateien im ZIP gehören in denselben Webordner. index.html und wohnungen.html wurden nur in der Navigation geändert; die bisherigen JS-Dateien, JSON-Dateien und styles.css bleiben unverändert.

Neue Dateien: bauland.html und bauland.js. bauland.js lädt wohnungspreise.json.

Formel: P * clamp(0.3212595 + 0.2652819 * ln(P/10000), 0.0625, 0.625) * Faktor.
Faktor: MFH 0.65, EFH 0.35. Ursprünglich validiert wurde 0.5. Die Differenzierung ist eine unvalidierte Annahme.
Mikrolage: +/-20% um den berechneten Richtwert; nicht empirisch kalibriert.

Test: python -m http.server 8000; http://localhost:8000/bauland.html
