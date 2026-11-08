#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Ergaenzt fehlende RealAdvisor-PLZ-Werte ohne bestehende CSV-Zeilen zu ueberschreiben.

Installation: pip install requests beautifulsoup4
Test:         python realadvisor_nachtrag_korrigiert.py
Alle:         python realadvisor_nachtrag_korrigiert.py --all
URL-Vorschau: python realadvisor_nachtrag_korrigiert.py --dry-run

realadvisor_plz.txt muss neben diesem Skript liegen. CSVs im ZIEL-Ordner.
"""
import argparse
import csv
import os
import random
import re
import sys
import time
import unicodedata
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlparse, unquote
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup

BASE = 'https://realadvisor.ch'
ZIEL = Path(r'C:\Users\misch\Dropbox\Immobilien\Immo-Staitistiken-ab2025\NeuerWohnradarOkt2026\realadvisordaten')
EINGABE = Path(__file__).resolve().parent / 'realadvisor_plz.txt'
WOHNUNGEN = ZIEL / 'realadvisor_wohnungen.csv'
HAEUSER = ZIEL / 'realadvisor_haeuser.csv'
PROTOKOLL = ZIEL / 'realadvisor_nachtrag_korrigiert_protokoll.csv'
FELDER = ['PLZ', 'Ortschaft', 'Tiefster_Wert', 'Median', 'Hoechster_Wert']
KANTONE = {'ZH','BE','LU','UR','SZ','OW','NW','GL','ZG','FR','SO','BS','BL','SH','AR','AI','SG','GR','AG','TG','TI','VD','VS','NE','GE','JU'}
AGENT = 'ImmobilienResearch/1.0'
PAUSE_MIN, PAUSE_MAX = 2.0, 8.0
LOGFELDER = ['PLZ','Ortschaft','Status','HTTP','URL','Hinweis']


def zerlege_ort(ort):
    m = re.search(r'\s+(' + '|'.join(sorted(KANTONE)) + r')$', ort, re.I)
    return (ort[:m.start()].strip(), m.group(1).lower()) if m else (ort.strip(), None)


def slugify(ort):
    # RealAdvisor verwendet a/o/u, nicht ae/oe/ue.
    ort = ort.translate(str.maketrans({'ä':'a','ö':'o','ü':'u','Ä':'A','Ö':'O','Ü':'U'}))
    ort = unicodedata.normalize('NFKD', ort)
    ort = ''.join(c for c in ort if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]+', '-', ort.lower()).strip('-')


def lade_plz():
    if not EINGABE.is_file():
        sys.exit(f'PLZ-Liste fehlt: {EINGABE}')
    gruppen = defaultdict(list)
    with EINGABE.open(encoding='utf-8-sig', newline='') as f:
        for row in csv.reader(f, delimiter='\t'):
            if len(row) >= 2 and re.fullmatch(r'\d{4}', row[1].strip()):
                plz, ort = row[1].strip(), row[0].strip()
                if ort and ort not in gruppen[plz]:
                    gruppen[plz].append(ort)
    return dict(gruppen)


def lade_csv(pfad):
    if not pfad.exists():
        sys.exit(f'Bestehende CSV fehlt: {pfad}\nAbbruch, um keine unvollstaendigen Ersatzdateien anzulegen.')
    with pfad.open(encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f, delimiter=';')
        if reader.fieldnames != FELDER:
            sys.exit(f'Unerwartete CSV-Spalten in {pfad}: {reader.fieldnames}')
        daten = {}
        for r in reader:
            plz = r['PLZ'].strip()
            if not re.fullmatch(r'\d{4}', plz):
                sys.exit(f'Ungueltige PLZ in {pfad}: {plz!r}')
            if plz in daten:
                sys.exit(f'Doppelte PLZ {plz} in {pfad}; bitte zuerst bereinigen.')
            daten[plz] = r
        return daten


def atomar_speichern(pfad, daten):
    temp = pfad.with_name(pfad.name + '.tmp')
    with temp.open('w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=FELDER, delimiter=';', lineterminator='\n')
        w.writeheader()
        for plz in sorted(daten):
            w.writerow({k: daten[plz].get(k, '') for k in FELDER})
        f.flush()
        os.fsync(f.fileno())
    for versuch in range(10):
        try:
            os.replace(temp, pfad)
            break
        except PermissionError:
            if versuch == 9:
                raise
            print(f"Datei gesperrt: {pfad.name}. Warte 3 Sekunden ...")
            time.sleep(3)







def log_zeile(**kwargs):
    neu = not PROTOKOLL.exists() or PROTOKOLL.stat().st_size == 0
    with PROTOKOLL.open('a', encoding='utf-8-sig' if neu else 'utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=LOGFELDER, delimiter=';')
        if neu: w.writeheader()
        w.writerow({k: kwargs.get(k, '') for k in LOGFELDER})


def kandidaten(plz, orte, kanton_indizien):
    """Erst normale URL, dann Kantonsvariante; nie blind alle 26 Kantone."""
    gesehen, out = set(), []
    for ort in orte:
        name, kanton = zerlege_ort(ort)
        grund = slugify(name)
        if not grund: continue
        moegliche_kantone = [kanton] if kanton else sorted(kanton_indizien.get(name.casefold(), set()))
        for suffix in ([f'-{k}' for k in moegliche_kantone if k] + ['']):
            slug = f'{plz}-{grund}{suffix}'
            if slug not in gesehen:
                gesehen.add(slug)
                out.append(f'{BASE}/de/immobilienpreise-pro-m2/{slug}')
    return out


def ist_richtige_plz(soup, response_url, angefragt, plz):
    """Kanonische Seiten-URL muss exakt dem getesteten PLZ-Slug entsprechen."""
    expected_path = urlparse(angefragt).path.rstrip('/')
    if not re.fullmatch(r'/de/immobilienpreise-pro-m2/' + re.escape(plz) + r'-[a-z0-9-]+', expected_path):
        return False, 'Test-URL hat keine gueltige PLZ-Struktur'
    if urlparse(response_url).path.rstrip('/') != expected_path:
        return False, 'Weiterleitung auf andere Seite'
    canon = soup.select_one('link[rel="canonical"][href]')
    if not canon:
        return False, 'Keine Canonical-URL; Zuordnung nicht sicher'
    cp = urlparse(canon['href']).path.rstrip('/')
    if cp != expected_path:
        return False, f'Canonical weicht ab: {cp}'
    return True, ''


def chf_int(s):
    s = re.sub(r'[^0-9]', '', s)
    return int(s) if s else None


def preisblock(soup, name):
    # Preisparser aus dem urspruenglichen, erfolgreich gelaufenen Scraper.
    for span in soup.find_all('span'):
        if span.get_text(' ', strip=True) != name: continue
        el = span.parent.parent if span.parent else None
        if el is None: continue
        median_el = el.select_one('div.font-bold')
        if not median_el: continue
        median_text = median_el.get_text(' ', strip=True)
        if 'CHF' not in median_text: continue
        median = chf_int(median_text)
        spanne = None
        for div in el.find_all('div'):
            if div is median_el or div.find('div'): continue
            txt = div.get_text(' ', strip=True)
            if 'CHF' in txt and '-' in txt:
                spanne = txt
                break
        if not spanne: continue
        werte = re.findall(r'CHF\s*([\d\s\u00a0\u202f’\'.,]+)', spanne)
        if len(werte) < 2: continue
        unten, oben = chf_int(werte[0]), chf_int(werte[1])
        if all(v is not None for v in (unten, median, oben)) and 0 < unten <= median <= oben:
            return (unten, median, oben)
    return None


def pruefe_robots(session):
    try:
        r = session.get(BASE + '/robots.txt', timeout=15)
        if r.status_code != 200:
            sys.exit(f'robots.txt nicht verifizierbar (HTTP {r.status_code}); Abbruch.')
        rp = RobotFileParser()
        rp.parse(r.text.splitlines())
        if not rp.can_fetch(AGENT, BASE + '/de/immobilienpreise-pro-m2/1020-renens-vd'):
            sys.exit('robots.txt untersagt den automatisierten Abruf der Preisseiten.')
        delay = rp.crawl_delay(AGENT)
        if delay and delay > PAUSE_MAX:
            sys.exit(f'robots.txt verlangt mindestens {delay}s Crawl-Delay. Bitte Pause anpassen.')
    except requests.RequestException as exc:
        sys.exit(f'robots.txt nicht erreichbar: {exc}')


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--all', action='store_true', help='Alle fehlenden PLZ statt nur 10')
    p.add_argument('--dry-run', action='store_true', help='Nur URL-Kandidaten anzeigen, keine Anfragen')
    p.add_argument('--limit', type=int, default=None, help='Maximale PLZ (Standard: alle)')
    args = p.parse_args()
    gruppen = lade_plz()
    wohn = lade_csv(WOHNUNGEN)
    haus = lade_csv(HAEUSER)
    fertig = {plz for plz in gruppen if wohn.get(plz, {}).get('Median') and haus.get(plz, {}).get('Median')}
    offen = [(plz, gruppen[plz]) for plz in sorted(gruppen) if plz not in fertig]
    # Kantonskürzel aus expliziten Ortsangaben der gesamten PLZ-Liste sammeln.
    kanton_indizien = defaultdict(set)
    for orte in gruppen.values():
        for ort in orte:
            name, kanton = zerlege_ort(ort)
            if kanton: kanton_indizien[name.casefold()].add(kanton)
    todo = offen if args.all or args.limit is None else offen[:max(0, args.limit)]
    print(f'PLZ total: {len(gruppen)} | komplett: {len(fertig)} | fehlend: {len(offen)}')
    print(f'Dieser Lauf: {len(todo)} | Zielordner: {ZIEL}')
    if args.dry_run:
        for plz, orte in todo:
            print(f'{plz} {orte[0]}:')
            for url in kandidaten(plz, orte, kanton_indizien): print('  ', url)
        return
    session = requests.Session()
    session.headers.update({'User-Agent': AGENT, 'Accept-Language': 'de-CH,de;q=0.9'})
    pruefe_robots(session)
    letzter_abruf = None
    for i, (plz, orte) in enumerate(todo, 1):
        urls = kandidaten(plz, orte, kanton_indizien)
        status, hinweis, code, url = 'KEIN_TREFFER', '', '', ''
        for url in urls:
            if letzter_abruf is not None:
                time.sleep(random.uniform(PAUSE_MIN, PAUSE_MAX))
            letzter_abruf = time.monotonic()
            try:
                r = session.get(url, timeout=25, allow_redirects=True)
                code = str(r.status_code)
                if r.status_code in (401, 403, 429):
                    log_zeile(PLZ=plz, Ortschaft=' | '.join(orte), Status='SPERRE', HTTP=code, URL=url, Hinweis='Abbruch')
                    sys.exit(f'HTTP {code}: Abbruch ohne Umgehungsversuch: {url}')
                if r.status_code == 404:
                    status, hinweis = '404', 'URL nicht vorhanden'
                    continue
                r.raise_for_status()
                soup = BeautifulSoup(r.text, 'html.parser')
                ok, grund = ist_richtige_plz(soup, r.url, url, plz)
                if not ok:
                    status, hinweis = 'FALSCHE_SEITE', grund
                    continue
                w, h = preisblock(soup, 'Wohnungen'), preisblock(soup, 'Häuser')
                if not w and not h:
                    status, hinweis = 'OHNE_PREISE', 'Seite gefunden, beide Preisblöcke fehlen'
                    continue
                ort = orte[0]
                if w and not wohn.get(plz, {}).get('Median'):
                    wohn[plz] = dict(zip(FELDER, [plz, ort, *w]))
                    atomar_speichern(WOHNUNGEN, wohn)
                if h and not haus.get(plz, {}).get('Median'):
                    haus[plz] = dict(zip(FELDER, [plz, ort, *h]))
                    atomar_speichern(HAEUSER, haus)
                status = 'OK' if w and h else 'TEILWEISE'
                hinweis = f'Wohnungen={w}, Haeuser={h}'
                break
            except requests.RequestException as exc:
                status, hinweis = 'NETZFEHLER', str(exc)[:180]
                break
        log_zeile(PLZ=plz, Ortschaft=' | '.join(orte), Status=status, HTTP=code, URL=url, Hinweis=hinweis)
        print(f'[{i}/{len(todo)}] {plz} {orte[0]}: {status} | {hinweis}', flush=True)
    print('Fertig. Bei erneutem Start werden vollständig erfasste PLZ übersprungen.')


if __name__ == '__main__':
    try: main()
    except KeyboardInterrupt: print('\nUnterbrochen; vorhandene Ergebnisse bleiben erhalten.')
