"use strict";
/* WOHNRADAR MIETE: originalgetreue PLZ-/Flächenfunktion, Schätzzuschläge separat. */
const MODEL_FILE="mietmodell_plz_parameter.json", PLACE_FILE="mietorte.json";
let MODEL=null, PLACES={}, selection="5400", parking={garage:0,outside:0};
const selected={location:"normal",condition:"normal",apartmentType:"standard"};
const $=id=>document.getElementById(id), money=n=>Math.round(n).toLocaleString("de-CH")+" CHF";
const text=(id,s)=>$(id).textContent=s;
// Originalfunktion aus dem hochgeladenen Mietpreis-Testtool (unverändert).
function estimate(beta,area){const x=Math.log(area);return beta[0]+beta[1]*x+beta[2]*x*x;}
// Modellannahmen, nicht aus Inseratedaten direkt isolierbare Effekte.
const locationFactor={poor:.94,normal:1,good:1.06};
const conditionFactor={old:.92,normal:1,new:1.08};
// Regional skalierte, degressive Zuschläge. Attika insgesamt max. 15 %.
// Attika-Differenz aus CSV: ca. +14,6 % im Median; ältere Schweizer Studie: ca. +18 %.
 // Balkon: Studie zeigt rund +1 % für das Vorhandensein, flächenabhängiger Teil Annahme.
function exteriorPremium(type,area){
 if(area<=0) return type==="attic" ? .04 : 0;
 if(type==="standard") return .01+.01*(1-Math.exp(-area/6)); // max. 2 %
 if(type==="attic") return .04+.11*(1-Math.exp(-area/14)); // max. 15 % inkl. Typ
 return .01+.055*(1-Math.exp(-area/14)); // Garten: max. 6,5 %, Annahme
}
const parkingAddition={garage:130,outside:65}; // CHF/Monat
function refresh(){
 if(!MODEL){return;}
 const area=Number($("living").value);text("livingv",area+" m²");
 if(!selection||!MODEL[selection]){text("status","Bitte eine gültige PLZ aus der Auswahl eingeben.");text("estimate","—");for(const k of ["baseout","qualityout","typeout","parkingout","low","high"])text(k,"—");return;}
 const p=MODEL[selection];
 const net=q=>estimate(p[q],area)*area/12;
 const base=net("q50");
 const factor=locationFactor[selected.location]*conditionFactor[selected.condition];
 const quality=base*(factor-1);
 const balconyArea=Number($("balconyArea").value), outdoorArea=Number($("outdoorArea").value);
 text("balconyAreav",balconyArea+" m²");text("outdoorAreav",outdoorArea+" m²");
 const type=selected.apartmentType;
 const exterior=base*exteriorPremium(type,type==="standard"?balconyArea:outdoorArea);
 const park=parking.garage*parkingAddition.garage+parking.outside*parkingAddition.outside;
 const adj=v=>v*(factor+exteriorPremium(type,type==="standard"?balconyArea:outdoorArea))+park;
 text("estimate",money(Math.max(0,adj(base))));text("baseout",money(base));
 text("qualityout",(quality>=0?"+":"−")+money(Math.abs(quality)));
 text("typeout","+"+money(exterior));text("parkingout","+"+money(park));
 const low=adj(net("q20")),high=adj(net("q80"));
 // Lokale Quantilregressionen können sich kreuzen. Deshalb in der Anzeige sortieren.
 text("low",money(Math.min(low,high,adj(base))));text("high",money(Math.max(low,high,adj(base))));
 text("status",`PLZ ${selection}${PLACES[selection]?" · "+PLACES[selection]:""} · ${area} m² · ohne Nebenkosten`);
}
function selectPlace(zip){if(!MODEL?.[zip])return;selection=zip;$("placeInput").value=zip+(PLACES[zip]?" "+PLACES[zip]:"");$("suggestions").classList.add("hide");$("placeInput").setAttribute("aria-expanded","false");refresh();}
function suggestionItems(q){
 if(!q)return[];
 return Object.keys(MODEL||{}).filter(z=>z.startsWith(q)||((PLACES[z]||"").toLocaleLowerCase("de-CH")).includes(q.toLocaleLowerCase("de-CH"))).slice(0,9);
}
function showSuggestions(){let q=$("placeInput").value.trim();const matches=suggestionItems(q);const root=$("suggestions");root.replaceChildren();for(const z of matches){const btn=document.createElement("button");btn.type="button";btn.setAttribute("role","option");btn.textContent=z+(PLACES[z]?" "+PLACES[z]:"");btn.addEventListener("mousedown",e=>e.preventDefault());btn.addEventListener("click",()=>selectPlace(z));root.append(btn);}root.classList.toggle("hide",matches.length===0);$("placeInput").setAttribute("aria-expanded",matches.length?"true":"false");}
$("placeInput").addEventListener("input",()=>{selection="";showSuggestions();refresh();});
$("placeInput").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();const z=suggestionItems($("placeInput").value.trim())[0];if(z)selectPlace(z);}else if(e.key==="Escape"){$("suggestions").classList.add("hide");}});
$("placeInput").addEventListener("blur",()=>{setTimeout(()=>$("suggestions").classList.add("hide"),150);});
$("clearPlace").addEventListener("click",()=>{$("placeInput").value="";selection="";$("placeInput").focus();refresh();});
$("living").addEventListener("input",refresh);
for(const id of ["balconyArea","outdoorArea"])$(id).addEventListener("input",refresh);
for(const id of ["location","condition","apartmentType"]){$(id).addEventListener("click",e=>{let btn=e.target.closest("button[data-value]");if(!btn)return;selected[id]=btn.dataset.value;for(const b of $(id).querySelectorAll("button"))b.classList.toggle("active",b===btn);refresh();});}
document.querySelectorAll("[data-count]").forEach(btn=>btn.addEventListener("click",()=>{const [key,delta]=btn.dataset.count.split(":");parking[key]=Math.max(0,Math.min(5,parking[key]+Number(delta)));text(key+"v",parking[key]);refresh();}));
function updateExterior(){
 const type=selected.apartmentType;
 $("balconyField").classList.toggle("hide",type!=="standard");
 $("outdoorField").classList.toggle("hide",type==="standard");
 $("outdoorField").querySelector("label").textContent=type==="garden"?"Gartenfläche":"Terrassenfläche";
 $("outdoorNote").textContent=type==="standard"?"Balkon: Zuschlag nach Fläche und lokalem Mietniveau.":type==="attic"?"Attika: Typen- und Terrassenzuschlag gemeinsam, maximal rund 15 %.":"Garten: die ersten Quadratmeter zählen besonders stark; danach flacht der Zuschlag ab.";
}
$("apartmentType").addEventListener("click",updateExterior);
$("reset").addEventListener("click",()=>{for(const id of ["location","condition","apartmentType"]){selected[id]=id==="apartmentType"?"standard":"normal";$(id).querySelectorAll("button").forEach(b=>b.classList.toggle("active",b.dataset.value===selected[id]));}parking={garage:0,outside:0};text("garagev","0");text("outsidev","0");$("living").value=80;$("balconyArea").value=0;$("outdoorArea").value=0;updateExterior();selectPlace("5400");});
(async()=>{try{const [r1,r2]=await Promise.all([fetch(MODEL_FILE),fetch(PLACE_FILE)]);if(!r1.ok)throw Error("Mietmodell: HTTP "+r1.status);MODEL=await r1.json();if(r2.ok)PLACES=await r2.json();selectPlace("5400");}catch(e){console.error(e);$("status").classList.add("error");text("status","Modelldatei nicht gefunden. Bitte miete.html und die beiden JSON-Dateien gemeinsam über einen Webserver bereitstellen.");}})();
