#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Gezielter RealAdvisor-Nachtrag mit manuell geprüften URL-Slugs.

In denselben Ordner wie realadvisor_nachtrag_korrigiert.py und die beiden
bestehenden CSV-Dateien legen; in VS Code ohne Argumente starten.
Installation (falls nötig): pip install requests beautifulsoup4

Nur fehlende Werte ergänzen; vorhandene Preise niemals überschreiben.
"""
import csv
import os
import random
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup
import realadvisor_nachtrag_korrigiert as basis

ORDNER = Path(__file__).resolve().parent
WOHNUNGEN = ORDNER / 'realadvisor_wohnungen.csv'
HAEUSER = ORDNER / 'realadvisor_haeuser.csv'
PROTOKOLL = ORDNER / 'realadvisor_letzter_nachtrag_protokoll.csv'

# Explizite URL-Endungen nach den vom Benutzer gefundenen Seiten.
SLUGS = {**{str(plz): f'{plz}-genf' for plz in range(1201, 1210)},
         **{str(plz): f'{plz}-biel' for plz in range(2502, 2506)},
         '1299': '1299-crans-pres-celigny',
         '1700': '1700-freiburg',
         '1950': '1950-sitten',
         '1962': '1962-pont-de-la-morge-sitten',
         '6173': '6173-fluhli-lu',
         '6196': '6196-marbach-lu',
         '6208': '6208-oberkirch-lu',
         '7447': '7447-cresta-avers'}

LOGFELDER = ['PLZ', 'Ortschaft', 'Status', 'HTTP', 'URL', 'Hinweis']


def speichern_mit_wiederholung(pfad, daten):
    """Originale Schreibfunktion, aber bei Windows/Dropbox-Sperre erneut versuchen."""
    for versuch in range(10):
        try:
            basis.atomar_speichern(pfad, daten)
            return
        except PermissionError:
            if versuch == 9:
                raise
            print(f'Datei gesperrt: {pfad.name}. Warte 3 Sekunden ...', flush=True)
            time.sleep(3)


def protokollieren(**werte):
    neu = not PROTOKOLL.exists() or PROTOKOLL.stat().st_size == 0
    with PROTOKOLL.open('a', encoding='utf-8-sig' if neu else 'utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=LOGFELDER, delimiter=';')
        if neu:
            writer.writeheader()
        writer.writerow({feld: werte.get(feld, '') for feld in LOGFELDER})


def main():
    wohn = basis.lade_csv(WOHNUNGEN)
    haus = basis.lade_csv(HAEUSER)
    gruppen = basis.lade_plz()  # Original-Ortsnamen beibehalten
    offen = [plz for plz in sorted(SLUGS) if
             not (wohn.get(plz, {}).get('Median') and haus.get(plz, {}).get('Median'))]
    print(f'Gezielter Nachtrag: {len(offen)} offene von {len(SLUGS)} vorgesehenen PLZ.')
    print('Bestehende vollständige Datensätze bleiben unverändert.', flush=True)
    if not offen:
        return

    session = requests.Session()
    session.headers.update({'User-Agent': basis.AGENT, 'Accept-Language': 'de-CH,de;q=0.9'})
    basis.pruefe_robots(session)

    for i, plz in enumerate(offen, 1):
        if i > 1:
            time.sleep(random.uniform(basis.PAUSE_MIN, basis.PAUSE_MAX))
        url = f'{basis.BASE}/de/immobilienpreise-pro-m2/{SLUGS[plz]}'
        ort = (gruppen.get(plz) or [wohn.get(plz, {}).get('Ortschaft') or
                                    haus.get(plz, {}).get('Ortschaft') or ''])[0]
        status, hinweis, http = 'FEHLER', '', ''
        try:
            r = session.get(url, timeout=25, allow_redirects=True)
            http = str(r.status_code)
            if r.status_code in (401, 403, 429):
                status, hinweis = 'SPERRE', 'Abruf abgebrochen, keine Umgehung'
                protokollieren(PLZ=plz, Ortschaft=ort, Status=status,
                               HTTP=http, URL=url, Hinweis=hinweis)
                raise SystemExit(f'HTTP {http}: Abbruch bei {url}')
            if r.status_code == 404:
                status, hinweis = '404', 'Seite nicht gefunden'
            else:
                r.raise_for_status()
                soup = BeautifulSoup(r.text, 'html.parser')
                korrekt, grund = basis.ist_richtige_plz(soup, r.url, url, plz)
                if not korrekt:
                    status, hinweis = 'FALSCHE_SEITE', grund
                else:
                    w = basis.preisblock(soup, 'Wohnungen')
                    h = basis.preisblock(soup, 'Häuser')
                    if not w and not h:
                        status, hinweis = 'OHNE_PREISE', 'Beide Preisblöcke fehlen'
                    else:
                        # Nur fehlende Seiten ergänzen, niemals vorhandene Werte ersetzen.
                        if w and not wohn.get(plz, {}).get('Median'):
                            neu = dict(zip(basis.FELDER, [plz, ort, *w]))
                            kopie = dict(wohn)
                            kopie[plz] = neu
                            speichern_mit_wiederholung(WOHNUNGEN, kopie)
                            wohn = kopie
                        if h and not haus.get(plz, {}).get('Median'):
                            neu = dict(zip(basis.FELDER, [plz, ort, *h]))
                            kopie = dict(haus)
                            kopie[plz] = neu
                            speichern_mit_wiederholung(HAEUSER, kopie)
                            haus = kopie
                        status = 'OK' if wohn.get(plz, {}).get('Median') and haus.get(plz, {}).get('Median') else 'TEILWEISE'
                        hinweis = f'Wohnungen={w}, Haeuser={h}'
        except requests.RequestException as exc:
            status, hinweis = 'NETZFEHLER', str(exc)[:180]
        protokollieren(PLZ=plz, Ortschaft=ort, Status=status,
                       HTTP=http, URL=url, Hinweis=hinweis)
        print(f'[{i}/{len(offen)}] {plz} {ort}: {status} | {hinweis}', flush=True)

    print('Fertig. Noch nicht erfasste PLZ sind im Protokoll erkennbar.')
    print('Hinweis: 6441 Rütli wird bewusst nicht abgefragt (keine Daten).')


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\nUnterbrochen. Bereits gespeicherte Daten bleiben erhalten.')
