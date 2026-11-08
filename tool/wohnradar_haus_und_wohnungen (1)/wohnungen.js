"use strict";

/* WOHNRADAR – Eigentumswohnungen
 * Datenbasis: RealAdvisor-PLZ-Medianpreise aus wohnungspreise.json.
 * Zuschläge und Abschläge sind transparente Modellannahmen, nicht
 * aus der PLZ-CSV empirisch geschätzte Koeffizienten.
 */
async function starteWohnungswert() {
    const antwort = await fetch('wohnungspreise.json');
    if (!antwort.ok) throw new Error('Wohnungspreise konnten nicht geladen werden');
    const DATA = await antwort.json();
    const $ = id => document.getElementById(id);
    const fmt = n => Math.round(n).toLocaleString('de-CH');
    const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
    const YEAR = 2026;
    const PARTS = [
        {id:'kitchen',label:'Küche',cost:26000,life:30,exp:.55},
        {id:'bath',label:'Bad und WC',cost:29000,life:30,exp:.50},
        {id:'interior',label:'Innenausbau (Böden, Malerarbeiten, Türen)',cost:34000,life:30,exp:.85},
        {id:'windows',label:'Fenster',cost:18000,life:35,exp:.65},
        {id:'heat',label:'Heizung / Haustechnik (Wohnungsanteil)',cost:11500,life:25,exp:.65},
        {id:'water',label:'Sanitärleitungen (Wohnungsanteil)',cost:11000,life:50,exp:.65},
        {id:'electric',label:'Elektroinstallationen',cost:14000,life:40,exp:.70}
    ];
    const DEFAULT_AGES = {kitchen:15,bath:16,interior:14,windows:22,heat:14,water:25,electric:24};
    const METRICS = [
        {id:'view',label:'Aussicht',names:['Schlecht','Eingeschränkt','Durchschnittlich','Schön','Sehr schön','Herausragend'],values:[-6,-3,0,3,6,10],def:2},
        {id:'access',label:'Geschäfte, Schulen und ÖV',names:['Sehr schlecht','Eher schlecht','Durchschnittlich','Gut','Sehr gut'],values:[-6,-3,0,2,4],def:2},
        {id:'noise',label:'Ruhe / Lärmbelastung',names:['Extrem laut','Stark belastet','Verkehrslärm','Durchschnittlich','Ruhig','Sehr ruhig'],values:[-8,-5,-2,0,2,4],def:3},
        {id:'quality',label:'Bauqualität und Wohnkomfort',names:['Einfach','Eher einfach','Durchschnittlich','Gehoben','Sehr hochwertig'],values:[-7,-3,0,4,8],def:2},
        {id:'light',label:'Besonnung / Tageslicht',names:['Sehr schlecht','Eher schlecht','Durchschnittlich','Gut','Sehr gut'],values:[-5,-2,0,2,4],def:2}
    ];
    const S = {plz:DATA['5400']?'5400':Object.keys(DATA)[0],garage:1,outside:0,mode:'normal',renovations:{}};
    const places = Object.entries(DATA).map(([plz,d])=>({plz,ort:d.ort,norm:normalize(plz+' '+d.ort)}));
    let placeFocused=false,activeSuggestion=-1;
    function normalize(t) {return String(t).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();}
    function renovationYears(mode,b) {
        const out={};for(const p of PARTS){
            const age=mode==='old'?YEAR-b:mode==='new'?Math.min(YEAR-b,4):Math.min(YEAR-b,DEFAULT_AGES[p.id]);
            out[p.id]=YEAR-age;
        }return out;
    }
    function renderRenos() {
        const b=+$('built').value;
        $('ageFields').innerHTML=PARTS.map(p=>{
            const yr=clamp(S.renovations[p.id]??b,b,YEAR);
            return `<div class="reno"><div class="rangehead"><label for="reno_${p.id}">${p.label}</label><output id="renov_${p.id}">${yr===b?'Seit Baujahr ('+b+')':yr}</output></div><input type="range" id="reno_${p.id}" min="${b}" max="${YEAR}" step="1" value="${yr}" data-reno="${p.id}"></div>`;
        }).join('');
        document.querySelectorAll('[data-reno]').forEach(el=>el.addEventListener('input',()=>{
            S.renovations[el.dataset.reno]=+el.value;
            $('renov_'+el.dataset.reno).textContent=+el.value===b?'Seit Baujahr ('+b+')':el.value;
            calc();
        }));
    }
    function setMode(mode) {
        S.mode=mode;S.renovations=renovationYears(mode,+$('built').value);
        document.querySelectorAll('[data-cond]').forEach(btn=>btn.classList.toggle('active',btn.dataset.cond===mode));
        renderRenos();calc();
    }
    $('sliders').innerHTML=METRICS.map(s=>`<div class="range"><div class="rangehead"><label for="${s.id}">${s.label}</label><output id="${s.id}v"></output></div><input id="${s.id}" type="range" min="0" max="${s.values.length-1}" value="${s.def}" step="1"></div>`).join('');
    function closeSuggestions(){
        $('suggestions').classList.add('hide');$('placeInput').setAttribute('aria-expanded','false');activeSuggestion=-1;
    }
    function suggestions(){
        const raw=normalize($('placeInput').value),list=$('suggestions');
        if(!placeFocused||!raw){closeSuggestions();return;}
        const matches=places.filter(p=>p.plz.startsWith(raw)||normalize(p.ort).startsWith(raw)||p.norm.includes(' '+raw)).sort((a,b)=>{
            const aa=normalize(a.ort).startsWith(raw)||a.plz.startsWith(raw),bb=normalize(b.ort).startsWith(raw)||b.plz.startsWith(raw);
            return Number(bb)-Number(aa)||a.ort.localeCompare(b.ort,'de');
        }).slice(0,12);
        list.innerHTML=matches.map((p,i)=>`<button type="button" role="option" aria-selected="false" id="suggest_${i}" data-plz="${p.plz}">${p.ort} <small>PLZ ${p.plz}</small></button>`).join('');
        list.classList.toggle('hide',!matches.length);$('placeInput').setAttribute('aria-expanded',String(!!matches.length));
        list.querySelectorAll('button').forEach(btn=>{
            btn.addEventListener('pointerdown',e=>e.preventDefault());btn.addEventListener('click',()=>choose(btn.dataset.plz));
        });activeSuggestion=-1;
    }
    function choose(plz){
        if(!DATA[plz])return;S.plz=plz;$('placeInput').value=plz+' '+DATA[plz].ort;
        closeSuggestions();$('placeHint').textContent='';calc();
    }
    function highlightSuggestion(i){
        const buttons=[...$('suggestions').querySelectorAll('button')];if(!buttons.length)return;
        activeSuggestion=(i+buttons.length)%buttons.length;
        buttons.forEach((b,j)=>b.setAttribute('aria-selected',String(j===activeSuggestion)));
        buttons[activeSuggestion].scrollIntoView({block:'nearest'});
    }
    function calc(){
        const d=DATA[S.plz];if(!d)return;
        const w=+$('living').value,balcony=+$('land').value,b=+$('built').value,m=d.median;
        const floor=+$('floor').value,lift=$('lift').value==='yes';
        const type=document.querySelector('input[name=apartmentType]:checked').value;
        $('livingv').textContent=fmt(w)+' m²';$('landv').textContent=fmt(balcony)+' m²';
        $('builtv').textContent=b;$('floorv').textContent=floor===0?'Erdgeschoss':floor+'. Stock';
        $('garagev').textContent=S.garage;$('outsidev').textContent=S.outside;
        // Grössere Wohnungen: leicht sinkender m²-Preis, Referenz 100 m².
        const base=m*w*Math.pow(w/100,-.12);
        // Balkon/Terrasse: 22 % des lokalen Wohnflächenpreises; ab 40 m² sinkender Grenznutzen.
        const effectiveBalcony=Math.min(balcony,40)+Math.max(0,balcony-40)*.35;
        const balconyValue=m*.22*effectiveBalcony;
        let ageDed=0;
        for(const p of PARTS){
            const cost=p.cost*Math.pow(w/100,p.exp)*Math.pow(m/10000,.18);
            const renovated=clamp(Number(S.renovations[p.id]??b)||b,b,YEAR);
            ageDed+=cost*clamp((YEAR-renovated)/p.life,0,1);
        }
        // 6 % Modellreserve vor Altersabzug; keine empirische Kalibrierung.
        const gross=base*1.06+balconyValue;
        const afterAge=Math.max(0,gross-ageDed);
        const typePct={standard:0,attic:5,garden:2}[type];
        // Geschossvorteil nur mit Lift uneingeschränkt; ohne Lift hohe Stockwerke im Nachteil.
        const floorPct=lift?clamp((floor-2)*.7,-1.4,4):
            (floor<=2?clamp((floor-2)*.7,-1.4,0):-Math.min(7,(floor-2)*1.8));
        const liftPct=lift?0:(floor>=2?-1.5:0);
        let micro=0,quality=0;
        for(const s of METRICS){
            const i=+$(s.id).value;$(s.id+'v').textContent=s.names[i];
            if(s.id==='quality')quality=s.values[i];else micro+=s.values[i];
        }
        micro=clamp(micro,-20,20);
        const adjusted=afterAge*(1+(typePct+floorPct+liftPct+micro+quality)/100);
        // Je ein Stellplatz: Marktannahmen; 0 Plätze im Basiswert enthalten.
        const gp=clamp(32000+.35*(m-10000),25000,42000);
        const ap=clamp(12000+.25*(m-10000),7000,19000);
        const garageAdjustment=S.garage*gp,outsideAdjustment=S.outside*ap;
        const result=Math.max(0,adjusted+garageAdjustment+outsideAdjustment);
        $('estimate').textContent='CHF '+fmt(result);
        $('ageout').textContent='− CHF '+fmt(ageDed);
        $('garageLabel').textContent=S.garage+' '+(S.garage===1?'Garagenplatz':'Garagenplätze');
        $('outsideLabel').textContent=S.outside+' '+(S.outside===1?'Aussenparkplatz':'Aussenparkplätze');
        $('garageout').textContent='+ CHF '+fmt(garageAdjustment);
        $('outsideout').textContent='+ CHF '+fmt(outsideAdjustment);
    }
    $('placeInput').addEventListener('focus',()=>{placeFocused=true;$('placeInput').select();suggestions();});
    $('placeInput').addEventListener('input',()=>{suggestions();$('placeHint').textContent=$('placeInput').value.trim()?'Ort oder PLZ auswählen':'';});
    $('clearPlace').addEventListener('click',()=>{$('placeInput').value='';$('placeInput').focus();closeSuggestions();$('placeHint').textContent='Ortschaft oder PLZ eingeben';});
    $('placeInput').addEventListener('keydown',e=>{
        const buttons=[...$('suggestions').querySelectorAll('button')];
        if(e.key==='ArrowDown'&&buttons.length){e.preventDefault();highlightSuggestion(activeSuggestion+1);}
        else if(e.key==='ArrowUp'&&buttons.length){e.preventDefault();highlightSuggestion(activeSuggestion-1);}
        else if(e.key==='Enter'&&buttons.length){e.preventDefault();choose(buttons[Math.max(0,activeSuggestion)].dataset.plz);$('placeInput').blur();}
        else if(e.key==='Escape'){closeSuggestions();$('placeInput').blur();}
    });
    $('placeInput').addEventListener('blur',()=>{
        placeFocused=false;setTimeout(()=>{
            closeSuggestions();
            if($('placeInput').value.trim()!==S.plz+' '+DATA[S.plz].ort && $('placeInput').value.trim())
                $('placeHint').textContent='Bitte einen Ort aus den Vorschlägen wählen';
        },160);
    });
    ['living','land','floor','lift',...METRICS.map(s=>s.id)].forEach(id=>$(id).addEventListener('input',calc));
    document.querySelectorAll('input[name=apartmentType]').forEach(el=>el.addEventListener('change',calc));
    $('built').addEventListener('input',()=>{S.renovations=renovationYears(S.mode,+$('built').value);renderRenos();calc();});
    document.querySelectorAll('[data-cond]').forEach(btn=>btn.addEventListener('click',()=>setMode(btn.dataset.cond)));
    document.querySelectorAll('[data-count]').forEach(btn=>btn.addEventListener('click',()=>{
        const [k,v]=btn.dataset.count.split(':');S[k]=clamp(S[k]+Number(v),0,8);calc();
    }));
    $('reset').addEventListener('click',()=>{
        choose(DATA['5400']?'5400':Object.keys(DATA)[0]);
        $('living').value=100;$('land').value=12;$('built').value=1995;$('floor').value=2;$('lift').value='yes';
        document.querySelector('input[name=apartmentType][value=standard]').checked=true;
        METRICS.forEach(s=>$(s.id).value=s.def);S.garage=1;S.outside=0;setMode('normal');
    });
    choose(S.plz);setMode('normal');
}
starteWohnungswert().catch(error=>{
    console.error('Wohnungswert: Datenfehler',error);
    const out=document.getElementById('estimate');if(out)out.textContent='Daten nicht verfügbar';
    const hint=document.getElementById('placeHint');if(hint)hint.textContent='Wohnungspreise konnten nicht geladen werden. Bitte die Seite über einen Webserver öffnen.';
});
