"""Erstellt eine interaktive Karte der RealAdvisor-Spannweitengruppen.
Start: python realadvisor_karte_erstellen.py
Benötigt: realadvisor_spannweiten_gruppen.csv im gleichen Ordner, Internet beim ersten Start.
Datenquelle für PLZ-Koordinaten: GeoNames (CC BY 4.0), https://www.geonames.org/
"""
import csv, io, json, urllib.request, zipfile
from collections import Counter, defaultdict
from pathlib import Path
from html import escape

HERE = Path(__file__).resolve().parent
GROUPS = HERE / 'realadvisor_spannweiten_gruppen.csv'
GEO = HERE / 'CH.zip'
OUT = HERE / 'realadvisor_spannweiten_karte.html'
URL = 'https://download.geonames.org/export/zip/CH.zip'

if not GROUPS.exists():
    raise SystemExit(f'Datei fehlt: {GROUPS}. Bitte in denselben Ordner legen.')
with GROUPS.open(encoding='utf-8-sig', newline='') as f:
    rows = list(csv.DictReader(f, delimiter=';'))

if not GEO.exists():
    print('Lade GeoNames-PLZ-Koordinaten (einmalig) ...')
    try:
        urllib.request.urlretrieve(URL, GEO)
    except Exception as e:
        raise SystemExit(f'GeoNames-Download fehlgeschlagen: {e}\nBitte CH.zip manuell von {URL} in den Skriptordner legen.')



coords = defaultdict(list)

with zipfile.ZipFile(GEO) as z:
    name = "CH.txt"
    print("ZIP-Inhalt:", z.namelist())
    with z.open(name) as test:
        for i in range(3):
            print("ROHZEILE", i + 1, repr(test.readline().decode("utf-8", errors="replace")))






    with z.open(name) as raw:
        for line in io.TextIOWrapper(raw, encoding='utf-8'):
            c = line.rstrip('\n').split('\t')

            if len(c) >= 11:
                try:
                    plz = c[1].strip().replace('CH-', '')
                    lat = float(c[9])
                    lon = float(c[10])

                    coords[plz].append((lat, lon))

                except (ValueError, IndexError):
                    continue

print("GeoNames: Anzahl gefundener PLZ:", len(coords))
print("Beispiele:", list(coords.items())[:5])












counts = Counter(r['Gruppe'] for r in rows)
order = [g for g, _ in counts.most_common()]
colors = ['#e63946','#277da1','#43aa8b','#f9c74f','#9b5de5','#f3722c','#577590','#90be6d','#f15bb5','#4d908e','#b56576','#00bbf9','#bc6c25','#5777c8','#a7c957','#c77dff','#ff8066','#007f86','#d4a373','#7f5539','#2a9d8f','#ef476f','#118ab2','#8338ec','#fb8500','#588157','#d62828','#6a994e','#3a86ff','#8d99ae','#6d597a']
features=[]
missing=[]
for r in rows:
    p=r['PLZ']
    if p not in coords:
        missing.append(p)
        continue
    lat=sum(x for x,y in coords[p])/len(coords[p]);lon=sum(y for x,y in coords[p])/len(coords[p])
    features.append({'p':p,'n':r['Ortschaft'],'g':order.index(r['Gruppe']),'lat':round(lat,5),'lon':round(lon,5),
                     'w':f"{float(r['Wmin'])*100:.0f}–{float(r['Wmax'])*100:.0f}%",
                     'h':f"{float(r['Hmin'])*100:.0f}–{float(r['Hmax'])*100:.0f}%"})

html='''<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>RealAdvisor: Regionale Spannweiten-Gruppen</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>body{margin:0;font:14px system-ui,Arial;color:#1d2939}#map{height:100vh}#panel{position:absolute;z-index:1000;top:14px;left:14px;width:305px;max-height:85vh;overflow:auto;background:#fff;border-radius:12px;padding:16px;box-shadow:0 3px 18px #0003}h2{font-size:17px;margin:0 0 8px}.muted{color:#667085;font-size:12px}label{display:block;margin:9px 0;cursor:pointer}input[type=checkbox]{vertical-align:middle}#groups{margin-top:10px}.dot{display:inline-block;width:12px;height:12px;border-radius:50%;margin-right:6px}button{cursor:pointer;border:1px solid #ccc;border-radius:6px;padding:5px 8px;background:#fff}#search{width:96%;padding:7px;border:1px solid #ccc;border-radius:6px}@media(max-width:700px){#panel{width:225px;padding:10px;max-height:50vh}}</style>
</head><body><div id="map"></div><div id="panel"><h2>RealAdvisor: 31 Spannweiten-Gruppen</h2><div class="muted">PLZ als Punkte, farbig nach identischen relativen Preisgrenzen. Keine amtlichen Regionsgrenzen.</div>
<p><input id="search" placeholder="PLZ oder Ort suchen"></p><div><button onclick="allOn(true)">Alle</button> <button onclick="allOn(false)">Keine</button></div><div id="groups"></div><p class="muted">Quelle Preisfaktoren: RealAdvisor-Auswertung. Koordinaten: GeoNames (CC BY 4.0). Kartengrundlage: OpenStreetMap.</p></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>
const data=__DATA__, names=__NAMES__, colors=__COLORS__, counts=__COUNTS__;
const map=L.map('map',{preferCanvas:true}).setView([46.82,8.25],8);
L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors, SRTM | © OpenTopoMap',maxZoom:17}).addTo(map);
const layers=names.map(()=>L.layerGroup().addTo(map));const lookup=[];
for(const d of data){const m=L.circleMarker([d.lat,d.lon],{radius:4.2,weight:.5,color:'#fff',fillColor:colors[d.g],fillOpacity:.82});
m.bindPopup(`<b>${d.p} ${d.n}</b><br>Gruppe ${d.g+1} (${counts[d.g]} PLZ)<br>Wohnungen: ${d.w} des Medians<br>Häuser: ${d.h} des Medians`);m.addTo(layers[d.g]);lookup.push([d,m]);}
const el=document.getElementById('groups');names.forEach((n,i)=>{const label=document.createElement('label');label.innerHTML=`<input type="checkbox" checked data-i="${i}"> <span class="dot" style="background:${colors[i]}"></span><b>${i+1}</b> · ${counts[i]} PLZ <small>(${n.split(' | ')[0]})</small>`;el.appendChild(label)});
el.addEventListener('change',e=>{const i=+e.target.dataset.i;if(e.target.checked)map.addLayer(layers[i]);else map.removeLayer(layers[i])});
function allOn(yes){el.querySelectorAll('input').forEach(c=>{c.checked=yes;const i=+c.dataset.i;if(yes)map.addLayer(layers[i]);else map.removeLayer(layers[i])})}
document.getElementById('search').addEventListener('change',e=>{const q=e.target.value.toLowerCase().trim();const x=lookup.find(([d])=>d.p===q)||lookup.find(([d])=>d.n.toLowerCase().includes(q));if(x){map.addLayer(layers[x[0].g]);map.setView([x[0].lat,x[0].lon],12);x[1].openPopup()}});
</script></body></html>'''
for key,val in {'__DATA__':features,'__NAMES__':order,'__COLORS__':colors,'__COUNTS__':[counts[g] for g in order]}.items():
    html=html.replace(key,json.dumps(val,ensure_ascii=False))
OUT.write_text(html,encoding='utf-8')
print(f'Karte erstellt: {OUT}\nGeoreferenziert: {len(features)} / {len(rows)} PLZ; ohne GeoNames-Koordinate: {len(missing)}')
if missing: print('Nicht zugeordnet:', ', '.join(missing[:60]))
print('HTML im Browser öffnen (Internet für die Kartengrundlage erforderlich).')
