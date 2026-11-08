#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""RealAdvisor PLZ-Preise: Wohnungen und Häuser, fortsetzbar, CSV-Export.

Installation: pip install requests beautifulsoup4
Start: python realadvisor_scraper.py
Die Datei realadvisor_plz.txt muss neben diesem Skript liegen.
"""
import csv
import logging
import random
import re
import sys
import time
import unicodedata
from pathlib import Path
from urllib.parse import quote
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup

BASE = "https://realadvisor.ch"
ZIEL = Path(r"C:\Users\misch\Dropbox\Immobilien\Immo-Staitistiken-ab2025\NeuerWohnradarOkt2026\realadvisordaten")
EINGABE = Path(__file__).resolve().parent / "realadvisor_plz.txt"
WOHNUNGEN = ZIEL / "realadvisor_wohnungen.csv"
HAEUSER = ZIEL / "realadvisor_haeuser.csv"
PROTOKOLL = ZIEL / "realadvisor_protokoll.csv"
FELDER = ["PLZ", "Ortschaft", "Tiefster_Wert", "Median", "Hoechster_Wert"]
LOGFELDER = ["PLZ", "Ortschaft", "Status", "HTTP", "URL", "Hinweis"]
# Gleichverteilung 2-8 Sekunden -> durchschnittlich 5 Sekunden pro PLZ.
PAUSE_MIN, PAUSE_MAX = 2.0, 8.0
AGENT = "ImmobilienResearch/1.0 (Kontakt: manuelle Forschung; geringe Abrufrate)"


def ort_slug(ort):
    ort = re.sub(r"\s+(?:VD|BE|FR|GE|NE|VS|JU|AG|ZH|SG|TG|SO|BL|BS|GR|TI|LU|SZ|ZG|UR|OW|NW|GL|SH|AI|AR)$", "", ort)
    ort = ort.replace("ä", "ae").replace("ö", "oe").replace("ü", "ue")
    ort = ort.replace("Ä", "Ae").replace("Ö", "Oe").replace("Ü", "Ue")
    ort = unicodedata.normalize("NFKD", ort)
    ort = "".join(c for c in ort if not unicodedata.combining(c)).lower()
    ort = re.sub(r"[^a-z0-9]+", "-", ort).strip("-")
    return ort


def lade_plz():
    if not EINGABE.exists():
        sys.exit(f"Eingabedatei fehlt: {EINGABE}")
    gruppen = {}
    with EINGABE.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f, delimiter="\t")
        for row in reader:
            if len(row) < 2:
                continue
            ort, plz = row[0].strip(), row[1].strip()
            if re.fullmatch(r"\d{4}", plz) and ort:
                gruppen.setdefault(plz, [])
                if ort not in gruppen[plz]:
                    gruppen[plz].append(ort)
    return gruppen


def bereits_bearbeitet():
    # Nur vollständige, erfolgreich gespeicherte Datensätze gelten als abgeschlossen.
    if not (WOHNUNGEN.exists() and HAEUSER.exists()):
        return set()
    def gelesen(pfad):
        with pfad.open(encoding="utf-8-sig", newline="") as f:
            return {r["PLZ"] for r in csv.DictReader(f) if r.get("PLZ") and r.get("Median")}
    return gelesen(WOHNUNGEN) & gelesen(HAEUSER)


def csv_schreiben(pfad, felder, zeile):
    neu = not pfad.exists() or pfad.stat().st_size == 0
    with pfad.open("a", encoding="utf-8-sig" if neu else "utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=felder, delimiter=";")
        if neu:
            writer.writeheader()
        writer.writerow(zeile)


def chf_int(text):
    ziffern = re.sub(r"[^0-9]", "", text)
    return int(ziffern) if ziffern else None


def preisblock(soup, name):
    # Der erste sichtbare Preisblock je Kategorie gehört zum Verkauf (nicht Miete).
    for span in soup.find_all("span"):
        if span.get_text(" ", strip=True) != name:
            continue
        el = span.parent.parent if span.parent else None
        if el is None:
            continue
        median_el = el.select_one("div.font-bold")
        # Unter dem Median steht die CHF-Preisspanne.
        if not median_el:
            continue
        median_text = median_el.get_text(" ", strip=True)
        if "CHF" not in median_text:
            continue
        median = chf_int(median_text)
        spanne = None
        for div in el.find_all("div"):
            if div is median_el or div.find("div"):
                continue
            txt = div.get_text(" ", strip=True)
            if "CHF" in txt and "-" in txt:
                spanne = txt
                break
        if not spanne:
            continue
        werte = re.findall(r"CHF\s*([\d\s\u00a0\u202f’'.,]+)", spanne)
        if len(werte) < 2:
            continue
        unten, oben = chf_int(werte[0]), chf_int(werte[1])
        if all(x is not None for x in (unten, median, oben)) and unten <= median <= oben:
            return unten, median, oben
    return None


def preise_lesen(html):
    soup = BeautifulSoup(html, "html.parser")
    wohnung = preisblock(soup, "Wohnungen")
    haus = preisblock(soup, "Häuser")
    return wohnung, haus


def pruefe_robots(session):
    url = BASE + "/robots.txt"
    try:
        r = session.get(url, timeout=15)
        if r.status_code == 200:
            rp = RobotFileParser()
            rp.parse(r.text.splitlines())
            test_url = BASE + "/de/immobilienpreise-pro-m2/3014-bern"
            if not rp.can_fetch(AGENT, test_url):
                sys.exit("robots.txt untersagt den Zugriff auf diese Seiten. Abbruch.")
            delay = rp.crawl_delay(AGENT)
            if delay and delay > PAUSE_MAX:
                print(f"robots.txt fordert mindestens {delay} Sekunden Pause. Bitte Pausen anpassen.")
                sys.exit(1)
            print("robots.txt geprüft: keine Sperre für die Zielseite gefunden.")
        elif r.status_code in (401, 403, 429):
            sys.exit(f"robots.txt nicht zugänglich (HTTP {r.status_code}); bitte Zugriffsregeln manuell prüfen.")
        else:
            print(f"Hinweis: robots.txt HTTP {r.status_code}; Nutzungsbedingungen manuell prüfen.")
    except requests.RequestException as e:
        print(f"Hinweis: robots.txt nicht prüfbar ({e}); bitte manuell prüfen.")


def main():
    gruppen = lade_plz()
    ZIEL.mkdir(parents=True, exist_ok=True)
    fertig = bereits_bearbeitet()
    offen = [(plz, orte) for plz, orte in sorted(gruppen.items()) if plz not in fertig]
    print(f"Einmalige PLZ: {len(gruppen)} | bereits abgeschlossen: {len(fertig)} | offen: {len(offen)}")
    print(f"Ausgabeordner: {ZIEL}")
    print("Hinweis: Bei mehreren Ortschaften pro PLZ wird zunächst die erste URL probiert.")
    print("Mit Strg+C jederzeit unterbrechen; erfolgreiche Ergebnisse bleiben erhalten.")

    session = requests.Session()
    session.headers.update({"User-Agent": AGENT, "Accept-Language": "de-CH,de;q=0.9"})
    pruefe_robots(session)
    for i, (plz, orte) in enumerate(offen, 1):
        if i > 1:
            time.sleep(random.uniform(PAUSE_MIN, PAUSE_MAX))
        # Maximal zwei Kandidaten, damit die Anfragezahl gering bleibt.
        kandidaten = []
        for ort in orte:
            slug = ort_slug(ort)
            if slug and slug not in kandidaten:
                kandidaten.append(slug)
        if not kandidaten:
            continue
        # Häufiger alternativer Schweizer Slug (z.B. Zürich -> zurich).
        if "zuerich" in kandidaten:
            kandidaten.append("zurich")
        kandidaten = kandidaten[:2]
        status, http, verwendete_url, hinweis = "FEHLER", "", "", ""
        result = None
        for j, slug in enumerate(kandidaten):
            if j > 0:
                time.sleep(random.uniform(PAUSE_MIN, PAUSE_MAX))
            url = f"{BASE}/de/immobilienpreise-pro-m2/{plz}-{quote(slug)}"
            verwendete_url = url
            try:
                r = session.get(url, timeout=25)
                http = str(r.status_code)
                if r.status_code in (401, 403, 429):
                    csv_schreiben(PROTOKOLL, LOGFELDER, dict(PLZ=plz, Ortschaft=" | ".join(orte), Status="SPERRE", HTTP=http, URL=url, Hinweis="Automatischer Abbruch"))
                    sys.exit(f"Zugriffsbeschränkung HTTP {http} bei {url}. Abbruch.")
                if r.status_code == 404:
                    status, hinweis = "404", "URL nicht gefunden"
                    continue
                r.raise_for_status()
                wohnung, haus = preise_lesen(r.text)
                if wohnung and haus:
                    result = (wohnung, haus)
                    status, hinweis = "OK", ""
                    break
                status, hinweis = "UNVOLLSTAENDIG", "Wohnungs- oder Hauspreisblock nicht erkannt"
                # Bei einer gültigen Seite nicht mit anderen Ortsnamen weitersuchen.
                break
            except requests.RequestException as e:
                status, hinweis = "NETZFEHLER", str(e)[:200]
                break
        if result:
            wohnung, haus = result
            # Bezeichnung der ersten Ortschaft der PLZ, ohne Preis-Duplikate.
            ort = orte[0]
            for pfad, werte in ((WOHNUNGEN, wohnung), (HAEUSER, haus)):
                csv_schreiben(pfad, FELDER, dict(zip(FELDER, [plz, ort, *werte])))
        csv_schreiben(PROTOKOLL, LOGFELDER, dict(PLZ=plz, Ortschaft=" | ".join(orte), Status=status, HTTP=http, URL=verwendete_url, Hinweis=hinweis))
        print(f"[{i}/{len(offen)}] {plz} {orte[0]}: {status}" + (f" | Wohnung {result[0]} | Haus {result[1]}" if result else f" | {hinweis}"), flush=True)
    print("Fertig. CSV-Dateien und Protokoll liegen im Ausgabeordner.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nUnterbrochen. Beim nächsten Start wird fortgesetzt.")
