"use strict";
/* WOHNRADAR – Bauland. Gemeinsame Datenbasis: wohnungspreise.json.
 * Logarithmische Formel aus der Gemeindekalibrierung:
 * Anteil = clamp(0.3212595 + 0.2652819 * ln(P / 10000), 0.0625, 0.625)
 * Baulandpreis/m² = P * Anteil * Ausnützungsannahme
 * Ursprünglich validierte Formel: Faktor 0.5; Bebauungsvarianten 0.65 / 0.35
 * und Mikrolage +/-20% sind NICHT separat empirisch validiert.
 */
async function starteBauland() {
 const antwort=await fetch('wohnungspreise.json');
 if(!antwort.ok)throw new Error('Wohnungspreise konnten nicht geladen werden');
 const DATA=await antwort.json(),$=id=>document.getElementById(id);
 const fmt=n=>Math.round(n).toLocaleString('de-CH');
 const normalize=t=>String(t).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const places=Object.entries(DATA).filter(([,d])=>Number.isFinite(+d.median)&&+d.median>0).map(([plz,d])=>({plz,ort:d.ort,norm:normalize(plz+' '+d.ort)}));
 let plz=DATA['5400']?'5400':places[0].plz,focused=false,active=-1;
 function close(){ $('suggestions').classList.add('hide');$('placeInput').setAttribute('aria-expanded','false');active=-1; }
 function calc(){
  const d=DATA[plz];if(!d)return;
  const type=document.querySelector('input[name="landType"]:checked').value;
  const p=+d.median,share=Math.max(.0625,Math.min(.625,.3212595+.2652819*Math.log(p/10000)));
  const base=p*share*(type==='multi'?.65:.35);
  $('estimate').textContent='CHF '+fmt(base);
  $('low').textContent='CHF '+fmt(base*.8);
  $('high').textContent='CHF '+fmt(base*1.2);
  $('buildLabel').textContent=type==='multi'?'Mehrfamilienhaus':'Einfamilienhaus';
  $('apartmentPrice').textContent='CHF '+fmt(p)+'/m²';
 }
 function choose(p){if(!DATA[p])return;plz=p;$('placeInput').value=p+' '+DATA[p].ort;$('placeHint').textContent='';close();calc();}
 function suggestions(){const q=normalize($('placeInput').value),list=$('suggestions');if(!focused||!q){close();return;}
  const matches=places.filter(p=>p.plz.startsWith(q)||normalize(p.ort).startsWith(q)||p.norm.includes(' '+q)).sort((a,b)=>Number(b.plz.startsWith(q)||normalize(b.ort).startsWith(q))-Number(a.plz.startsWith(q)||normalize(a.ort).startsWith(q))||a.ort.localeCompare(b.ort,'de')).slice(0,12);
  list.replaceChildren();matches.forEach((p,i)=>{const btn=document.createElement('button');btn.type='button';btn.setAttribute('role','option');btn.setAttribute('aria-selected','false');btn.id='suggest_'+i;btn.append(document.createTextNode(p.ort+' '));const small=document.createElement('small');small.textContent='PLZ '+p.plz;btn.append(small);btn.addEventListener('pointerdown',e=>e.preventDefault());btn.addEventListener('click',()=>choose(p.plz));list.append(btn);});
  list.classList.toggle('hide',!matches.length);$('placeInput').setAttribute('aria-expanded',String(!!matches.length));active=-1;
 }
 $('placeInput').addEventListener('focus',()=>{focused=true;suggestions();});
 $('placeInput').addEventListener('input',()=>{if(normalize($('placeInput').value)!==normalize(plz+' '+DATA[plz].ort)){$('placeHint').textContent='Ortschaft aus der Liste auswählen.';}suggestions();});
 $('placeInput').addEventListener('keydown',e=>{const buttons=[...$('suggestions').querySelectorAll('button')];if(e.key==='Escape'){close();return;}if((e.key==='ArrowDown'||e.key==='ArrowUp')&&buttons.length){e.preventDefault();active=(active+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons.forEach((b,i)=>b.setAttribute('aria-selected',String(i===active)));buttons[active].scrollIntoView({block:'nearest'});}if(e.key==='Enter'&&buttons.length){e.preventDefault();buttons[active<0?0:active].click();}});
 $('placeInput').addEventListener('blur',()=>{focused=false;setTimeout(close,100);});
 $('clearPlace').addEventListener('click',()=>{$('placeInput').value='';$('placeInput').focus();suggestions();});
 document.querySelectorAll('input[name="landType"]').forEach(el=>el.addEventListener('change',calc));
 $('reset').addEventListener('click',()=>{document.querySelector('input[name="landType"][value="multi"]').checked=true;choose(DATA['5400']?'5400':places[0].plz);});
 choose(plz);
}
starteBauland().catch(error=>{console.error('Bauland:',error);document.getElementById('estimate').textContent='Daten nicht verfügbar';document.getElementById('placeHint').textContent='Daten konnten nicht geladen werden. Bitte die Seite über einen Webserver öffnen.';});
