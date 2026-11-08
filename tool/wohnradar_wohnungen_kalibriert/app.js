'use strict';

// Die Immobilienpreisdaten werden separat geladen.
// Auf einem Webserver funktioniert dies ohne weitere Einrichtung.
async function ladeImmobilienpreise() {
  const antwort = await fetch('immobilienpreise.json');
  if (!antwort.ok) {
    throw new Error(`Immobilienpreisdaten konnten nicht geladen werden (HTTP ${antwort.status}).`);
  }
  return antwort.json();
}

async function starteHauswert() {

// Daten, Hilfsfunktionen und Modellparameter
const DATA = await ladeImmobilienpreise();
const $=id=>document.getElementById(id),fmt=n=>Math.round(n).toLocaleString('de-CH'),clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),YEAR=2026;
const PARTS=[{id:'kitchen',label:'Küche',k:30000,a:.5,b:.25,l:30,lo:20000,hi:50000},{id:'bath',label:'Bäder und WC',k:40000,a:.4,b:.15,l:30,lo:24000,hi:64000},{id:'interior',label:'Innenausbau (Böden, Malerarbeiten, Türen)',k:65000,a:.9,b:.05,l:30},{id:'windows',label:'Fenster',k:35000,a:.8,b:.05,l:35},{id:'heat',label:'Heizung',k:35000,a:.6,b:.05,l:25},{id:'water',label:'Wasser- und Abwasserleitungen',k:30000,a:.7,b:.05,l:50},{id:'electric',label:'Elektroinstallationen',k:25000,a:.75,b:.05,l:40},{id:'roof',label:'Dach',k:50000,a:.8,b:.05,l:50},{id:'facade',label:'Fassade (ohne Dämmung)',k:35000,a:.8,b:.05,l:40}];
const METRICS=[{id:'view',label:'Aussicht',names:['Schlecht','Eingeschränkt','Durchschnittlich','Schön','Sehr schön','Herausragend'],values:[-6,-3,0,4,8,16],def:2},{id:'access',label:'Geschäfte, Schulen und ÖV',names:['Sehr schlecht','Eher schlecht','Durchschnittlich','Gut','Sehr gut'],values:[-6,-3,0,2,5],def:2},{id:'noise',label:'Ruhe / Lärmbelastung',names:['Extrem laut','Stark belastet','Verkehrslärm','Durchschnittlich','Ruhig','Sehr ruhig'],values:[-8,-5.6,-2.3,0,2,4],def:3},{id:'quality',label:'Bauqualität und Wohnkomfort',names:['Einfach','Eher einfach','Durchschnittlich','Gehoben','Sehr hochwertig'],values:[-8,-4,0,4,8],def:2}];
const S={plz:'5400',garage:1,outside:1,mode:'normal',renovations:{}};const places=Object.entries(DATA).map(([plz,d])=>({plz,ort:d.ort,norm:(plz+' '+d.ort).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}));

// Renovationsjahre aus dem gewählten Zustand ableiten
function renovationsFor(mode,b){let r={};for(const p of PARTS){let age=mode==='old'?YEAR-b:mode==='new'?Math.min(YEAR-b,4):Math.min(YEAR-b,({kitchen:18,bath:20,interior:15,windows:25,heat:15,water:30,electric:30,roof:35,facade:30})[p.id]);r[p.id]=YEAR-age;}return r;}

// Detailregler für einzelne Renovationen erstellen
function renderRenos(){let b=+$('built').value;$('ageFields').innerHTML=PARTS.map(p=>{let yr=clamp(S.renovations[p.id]??b,b,YEAR);return `<div class="reno"><div class="rangehead"><label for="reno_${p.id}">${p.label}</label><output id="renov_${p.id}">${yr===b?'Seit Baujahr ('+b+')':yr}</output></div><input type="range" id="reno_${p.id}" min="${b}" max="${YEAR}" step="1" value="${yr}" data-reno="${p.id}"></div>`}).join('');document.querySelectorAll('[data-reno]').forEach(el=>el.addEventListener('input',()=>{S.renovations[el.dataset.reno]=+el.value;let b=+$('built').value;$('renov_'+el.dataset.reno).textContent=+el.value===b?'Seit Baujahr ('+b+')':el.value;calc();}));}

function setMode(mode){S.mode=mode;S.renovations=renovationsFor(mode,+$('built').value);document.querySelectorAll('[data-cond]').forEach(b=>b.classList.toggle('active',b.dataset.cond===mode));renderRenos();calc();}

// Lage- und Komfortregler aufbauen
$('sliders').innerHTML=METRICS.map(s=>`<div class="range"><div class="rangehead"><label for="${s.id}">${s.label}</label><output id="${s.id}v"></output></div><input id="${s.id}" type="range" min="0" max="${s.values.length-1}" value="${s.def}" step="1"></div>`).join('');
let placeFocused=false, activeSuggestion=-1;

// Ortssuche und Auswahl
function normalize(t){return t.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();}

function closeSuggestions(){const list=$('suggestions');list.classList.add('hide');$('placeInput').setAttribute('aria-expanded','false');activeSuggestion=-1;}

function suggestions(){const raw=normalize($('placeInput').value);const list=$('suggestions');if(!placeFocused||!raw){closeSuggestions();return;}let matches=places.filter(p=>p.plz.startsWith(raw)||normalize(p.ort).startsWith(raw)||p.norm.includes(' '+raw)).sort((a,b)=>{let as=normalize(a.ort).startsWith(raw)||a.plz.startsWith(raw),bs=normalize(b.ort).startsWith(raw)||b.plz.startsWith(raw);return Number(bs)-Number(as)||a.ort.localeCompare(b.ort,'de');}).slice(0,12);list.innerHTML=matches.map((p,i)=>`<button type="button" role="option" aria-selected="false" id="suggest_${i}" data-plz="${p.plz}">${p.ort} <small>PLZ ${p.plz}</small></button>`).join('');list.classList.toggle('hide',!matches.length);$('placeInput').setAttribute('aria-expanded',String(!!matches.length));list.querySelectorAll('button').forEach(btn=>{btn.addEventListener('pointerdown',e=>e.preventDefault());btn.addEventListener('click',()=>choose(btn.dataset.plz));});activeSuggestion=-1;}

function choose(plz){if(!DATA[plz])return;S.plz=plz;$('placeInput').value=plz+' '+DATA[plz].ort;closeSuggestions();$('placeHint').textContent='';calc();}

function highlightSuggestion(i){const buttons=[...$('suggestions').querySelectorAll('button')];if(!buttons.length)return;activeSuggestion=(i+buttons.length)%buttons.length;buttons.forEach((b,j)=>b.setAttribute('aria-selected',String(j===activeSuggestion)));buttons[activeSuggestion].scrollIntoView({block:'nearest'});}

// Verkehrswert berechnen und Ergebnis aktualisieren

function calc() {
    const d = DATA[S.plz];
    if (!d) return;

    const w = +$('living').value;
    const g = +$('land').value;
    const b = +$('built').value;
    const m = d.median;

    $('livingv').textContent = fmt(w) + ' m²';
    $('landv').textContent = fmt(g) + ' m²';
    $('builtv').textContent = b;
    $('garagev').textContent = S.garage;
    $('outsidev').textContent = S.outside;

    let ageDed = 0;

    for (const p of PARTS) {
        let cost = p.k *
            Math.pow(w / 180, p.a) *
            Math.pow(m / 10000, p.b);

        cost = clamp(cost, p.lo ?? 0, p.hi ?? Infinity);

        let renovated = clamp(
            Number(S.renovations[p.id] ?? b) || b,
            b,
            YEAR
        );

        ageDed += cost *
            clamp((YEAR - renovated) / p.l, 0, 1);
    }

    const effectiveLand = Math.max(40, g);

    const ref = m * w *
        Math.pow(w / 180, -.426) *
        Math.pow(effectiveLand / 590, .145) *
        1.18;

    const residualAge = -Math.min(
        3.5,
        Math.max(0, YEAR - b - 15) * .045
    );

    const typePct = {
        free: 0,
        end: -1.2,
        mid: -2.5
    }[document.querySelector('input[name=houseType]:checked').value];

    let micro = 0;
    let quality = 0;

    for (const s of METRICS) {
        const index = +$(s.id).value;
        $(s.id + 'v').textContent = s.names[index];

        if (s.id === 'quality') {
            quality = s.values[index];
        } else {
            micro += s.values[index];
        }
    }

    micro = clamp(micro, -20, 20);

    const afterAge = Math.max(0, ref - ageDed);

    const adjusted = afterAge *
        (1 + (typePct + micro + quality + residualAge) / 100);

    const gp = clamp(
        33000 + .5 * (m - 10000),
        28000,
        38000
    );

    const ap = clamp(
        12000 + .6 * (m - 10000),
        8000,
        18000
    );

    const garageAdjustment = (S.garage - 1) * gp;
    const outsideAdjustment = (S.outside - 1) * ap;

    const park = garageAdjustment + outsideAdjustment;
    const result = Math.max(0, adjusted + park);

    // Verkehrswert und Altersabzug
    $('estimate').textContent = 'CHF ' + fmt(result);
    $('ageout').textContent = '− CHF ' + fmt(ageDed);

    // Anzahl Garagenplätze anzeigen
    $('garageLabel').textContent =
        S.garage + ' ' +
        (S.garage === 1 ? 'Garagenplatz' : 'Garagenplätze');

    // Anzahl Aussenparkplätze anzeigen
    $('outsideLabel').textContent =
        S.outside + ' ' +
        (S.outside === 1 ? 'Aussenparkplatz' : 'Aussenparkplätze');

    // Wertanpassungen anzeigen
    $('garageout').textContent =
        (garageAdjustment >= 0 ? '+ ' : '− ') +
        'CHF ' + fmt(Math.abs(garageAdjustment));

    $('outsideout').textContent =
        (outsideAdjustment >= 0 ? '+ ' : '− ') +
        'CHF ' + fmt(Math.abs(outsideAdjustment));
}


// Ereignisse: Jede Eingabe löst eine unmittelbare Neuberechnung aus
$('placeInput').addEventListener('focus',()=>{placeFocused=true;$('placeInput').select();suggestions();});

$('placeInput').addEventListener('input',()=>{suggestions();$('placeHint').textContent=$('placeInput').value.trim()?'Ort oder PLZ auswählen':'';});

$('clearPlace').addEventListener('click',()=>{$('placeInput').value='';$('placeInput').focus();closeSuggestions();$('placeHint').textContent='Ortschaft oder PLZ eingeben';});

$('placeInput').addEventListener('keydown',e=>{const buttons=[...$('suggestions').querySelectorAll('button')];if(e.key==='ArrowDown'&&buttons.length){e.preventDefault();highlightSuggestion(activeSuggestion+1);}else if(e.key==='ArrowUp'&&buttons.length){e.preventDefault();highlightSuggestion(activeSuggestion-1);}else if(e.key==='Enter'&&buttons.length){e.preventDefault();choose(buttons[Math.max(0,activeSuggestion)].dataset.plz);$('placeInput').blur();}else if(e.key==='Escape'){closeSuggestions();$('placeInput').blur();}});

$('placeInput').addEventListener('blur',()=>{placeFocused=false;setTimeout(()=>{closeSuggestions();if($('placeInput').value.trim()&&!($('placeInput').value===S.plz+' '+DATA[S.plz].ort)){$('placeHint').textContent='Bitte einen Ort aus den Vorschlägen wählen';}},160);});

['living','land',...METRICS.map(s=>s.id)].forEach(id=>$(id).addEventListener('input',calc));
document.querySelectorAll('input[name=houseType]').forEach(el=>el.addEventListener('change',calc));
$('built').addEventListener('input',()=>{S.renovations=renovationsFor(S.mode,+$('built').value);renderRenos();calc();});
document.querySelectorAll('[data-cond]').forEach(btn=>btn.addEventListener('click',()=>setMode(btn.dataset.cond)));
document.querySelectorAll('[data-count]').forEach(btn=>btn.addEventListener('click',()=>{const [k,v]=btn.dataset.count.split(':');S[k]=clamp(S[k]+Number(v),0,8);calc();}));
$('reset').addEventListener('click',()=>{choose('5400');$('living').value=180;$('land').value=650;$('built').value=1985;document.querySelector('input[name=houseType][value=free]').checked=true;METRICS.forEach(s=>$(s.id).value=s.def);S.garage=1;S.outside=1;setMode('normal');});

// Standardhaus beim Öffnen anzeigen
setMode('normal');

}

starteHauswert().catch(fehler => {
  console.error('Hauswert: Fehler beim Laden der Preisdaten', fehler);
  const ausgabe = document.getElementById('estimate');
  if (ausgabe) ausgabe.textContent = 'Daten nicht verfügbar';
  const hinweis = document.getElementById('placeHint');
  if (hinweis) hinweis.textContent = 'Immobilienpreise konnten nicht geladen werden. Bitte die Seite über einen Webserver öffnen.';
});
