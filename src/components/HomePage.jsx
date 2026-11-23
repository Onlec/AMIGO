import React, { useEffect, useRef } from 'react';
import ThemeToggle from './ThemeToggle.jsx';

// Deze homepage is vrijwel letterlijk overgenomen uit het AMIGO-homepage-
// artefact: een SVG-kaartenwiel met een kritisch gedempt veermodel voor
// alle beweging (scroll/sleep/toetsen/knoppen), een "alle tools"-raster,
// en 13 losse tool-pagina's (12 echt werkende rekenmachines/lijstjes uit
// het artefact + onze eigen Datumprikker). Dat is zoveel dichte,
// onderling afhankelijke wiskunde (perspectief-projecties, SVG-paden)
// dat het risicovoller is om het handmatig naar React-state te herschrijven
// dan om het ongemoeid te laten als een eigen DOM-subboom: we renderen de
// statische schil als JSX en voeren de (licht aangepaste) originele
// JS uit via een echt geïnjecteerd <script>-element.
//
// De enige inhoudelijke wijziging t.o.v. het artefact: de tool-array
// kreeg een 13de, "externe" entry (Datumprikker) met een vijfde
// array-element (de href). Waar het origineel voor elke kaart intern
// navigeert via location.hash, doet het dat voor een kaart mét een
// href-waarde in plaats daarvan via een echte navigatie (location.href)
// naar onze eigen React-route. Verder is er niets aan de logica
// veranderd.
const HOME_SCRIPT = `(function(){
var RM=matchMedia('(prefers-reduced-motion:reduce)').matches,$=function(s){return document.querySelector(s)};
var T=[['Agenda','Afspraken en deadlines in één overzicht.','Planner','agenda'],['Btw-calculator','Netto, btw en totaal in drie tarieven.','Calculate','btw'],['Datumrekenaar','Dagen, weken en werkdagen tussen twee datums.','Planner','datum'],['Eenhedenomrekenaar','Lengte, gewicht en temperatuur omzetten.','Convert','eenheden'],['Factuurnummers','Doorlopende, sluitende nummering.','Organize','factuur'],['Kilometervergoeding','Ritten en vergoedingen per periode.','Calculate','kilometers'],['Leningcalculator','Maandlasten en totale rentekosten.','Calculate','lening'],['Margecalculator','Marge en winstpercentage.','Calculate','marge'],['Notities','Korte aantekeningen per project.','Organize','notities'],['Procentrekenaar','Stijging, daling en aandeel.','Calculate','procent'],['Tijdschrijver','Uren per taak en per week.','Planner','tijd'],['Uurtariefberekening','Een kostendekkend tarief uitrekenen.','Calculate','uurtarief'],['Datumprikker','Prik een datum met je groep: stemmen, bewerken en bevestigen.','Planner','datumprikker','?page=planner']];
var n=T.length,SL=[0,1,2,1],CX=180,H=190,W=160,CH=103,D=61,WN=W*1.135,TH=7,TL=4.7;
var sv=$('#sv'),pos=6,vel=0,tw=null,drag=null,run=false,cur=-1;
function wrap(x){return((x+n/2)%n+n)%n-n/2}
function idx(){return((Math.round(pos)%n)+n)%n}
function f(x){return Math.round(x*10)/10}
/* Inhoud van de voorkant, in kaartcoördinaten (0,0 = linksboven) */
function content(i){return '<rect x="9" y="9" width="7" height="7" fill="#D21F26"/>'+
  '<text class="tx" x="'+(W-9)+'" y="16" text-anchor="end" font-size="8" font-weight="700">'+String(i+1).padStart(2,'0')+'</text>'+
  '<line class="ln" x1="10" x2="10" y1="'+(CH-40)+'" y2="'+(CH-10)+'"/>'+
  '<text class="tx" x="18" y="'+(CH-23)+'" font-size="10.5" font-weight="700">'+T[i][0].toUpperCase()+'</text>'+
  '<text class="tx" x="18" y="'+(CH-12)+'" font-size="6.5" font-weight="500" opacity=".7">AMIGO · TOOL</text>'}
/* Kaart rechtop (boven het scharnier); lv = zichtbaarheid van de tekst */
function up(i,top,lv,w,tk){var x=CX-w/2,s=SL[i%4],tx=x+w*(.05+.357*s),tw=w*.186,th=TH*(w/W)*tk,o='<g data-i="'+i+'">';
  o+='<rect class="k" x="'+f(x)+'" y="'+f(top)+'" width="'+f(w)+'" height="'+f(H-top)+'"/>';
  if(th>.4)o+='<rect class="k" x="'+f(tx)+'" y="'+f(top-th)+'" width="'+f(tw)+'" height="'+f(th)+'"/><line class="sm" x1="'+f(tx+1.5)+'" x2="'+f(tx+tw-1.5)+'" y1="'+f(top)+'" y2="'+f(top)+'"/>';
  if(lv>0)o+='<g transform="translate('+f(x)+' '+f(top)+') scale('+(w/W).toFixed(3)+')">'+content(i)+'</g>';
  return o+'</g>'}
/* Kaart die om het scharnier valt: projectie met perspectief. Voorkant (met inhoud) tot de kaart
   van opzij staat, daarna de achterkant (andere tint, leeg). */
var KK=W/280,PP=1500*KK,OY=H-1000*KK,EA=-82*Math.PI/180;
function P(a,x,yl){return [CX+x*PP/(PP-yl*Math.sin(a)),OY+(H+yl*Math.cos(a)-OY)*PP/(PP-yl*Math.sin(a))]}
D=P(EA,0,-CH)[1]-H;WN=2*(P(EA,W/2,-CH)[0]-CX);TL=P(EA,0,-CH-TH)[1]-P(EA,0,-CH)[1];
function flip(i,t){var a=-82*t*Math.PI/180,ca=Math.cos(a),sa=Math.sin(a),s=SL[i%4],fr=t<.573;
  function pr(x,yl){var k=PP/(PP-yl*sa);return [CX+x*k,OY+(H+yl*ca-OY)*k]}
  function pt(q){return f(q[0])+','+f(q[1])}
  var bl=pr(-W/2,0),br=pr(W/2,0),tl=pr(-W/2,-CH),tr=pr(W/2,-CH),x0=-W/2+W*(.05+.357*s),x1=x0+W*.186,
      t1=pr(x0,-CH-TH),t2=pr(x1,-CH-TH),t3=pr(x1,-CH),t4=pr(x0,-CH),m1=pr(x0+1.5,-CH),m2=pr(x1-1.5,-CH);
  /* Rond het scharnier staat de kaart van opzij: houd het tabje dan minstens 3 hoog en laat de naad verdwijnen */
  var dyn=t1[1]-t4[1];if(Math.abs(dyn)<3){dyn=(tl[1]<bl[1]?-1:1)*3;t1[1]=t4[1]+dyn;t2[1]=t3[1]+dyn}
  var sw=Math.max(0,Math.min(3,Math.abs(bl[1]-tl[1])-2)),c=fr?'k':'kb',
      o='<g data-i="'+i+'"><polygon class="'+c+'" points="'+pt(bl)+' '+pt(br)+' '+pt(tr)+' '+pt(tl)+'"/><polygon class="'+c+'" points="'+pt(t1)+' '+pt(t2)+' '+pt(t3)+' '+pt(t4)+'"/><line class="'+(fr?'sm':'smb')+'" style="stroke-width:'+f(sw)+'" x1="'+f(m1[0])+'" y1="'+f(m1[1])+'" x2="'+f(m2[0])+'" y2="'+f(m2[1])+'"/>';
  if(fr){var A=(tr[0]-tl[0])/W,B=(tr[1]-tl[1])/W,C=(bl[0]-tl[0])/CH,Dd=(bl[1]-tl[1])/CH;
    o+='<g transform="matrix('+A.toFixed(4)+' '+B.toFixed(4)+' '+C.toFixed(4)+' '+Dd.toFixed(4)+' '+f(tl[0])+' '+f(tl[1])+')">'+content(i)+'</g>'}
  return o+'</g>'}
/* Kaart plat (onder het scharnier), achterkant. dep = diepte, wn = breedte onderrand, tk = tabschaal */
function flat(i,dep,wn,tk){var s=SL[i%4],y=H+dep,a=CX-W/2,b=CX+W/2,c=CX-wn/2,d=CX+wn/2,tx=c+wn*(.05+.357*s),tw=wn*.186,th=TL*(wn/WN)*tk;
  return '<g data-i="'+i+'"><polygon class="kb" points="'+a+','+H+' '+b+','+H+' '+f(d)+','+f(y)+' '+f(c)+','+f(y)+'"/>'+
   (th>.4?'<rect class="kb" x="'+f(tx)+'" y="'+f(y)+'" width="'+f(tw)+'" height="'+f(th)+'"/><line class="smb" x1="'+f(tx+1.5)+'" x2="'+f(tx+tw-1.5)+'" y1="'+f(y)+'" y2="'+f(y)+'"/>':'')+'</g>'}
/* Beugels met schuivende streepjes */
function rails(p){var y0=H-24,hh=48,pitch=12,off=(p*12)%hh,o='';
  [-1,1].forEach(function(sd){var x=CX+sd*(W/2+12),x0=CX+sd*(W/2);
    o+='<path class="ln" d="M'+x0+' '+y0+'H'+x+'V'+(y0+hh)+'H'+x0+'"/>';
    for(var m=0;m<4;m++){var ty=y0+((m*pitch+off)%hh);if(ty<y0+2||ty>y0+hh-2)continue;o+='<line class="ln" x1="'+x+'" x2="'+(x-sd*7)+'" y1="'+f(ty)+'" y2="'+f(ty)+'"/>'}});
  return o}
function render(){
  var p=pos,o='',L=[];
  for(var i=0;i<n;i++){var d=wrap(i-p);if(d>-3.3&&d<3.3)L.push([i,d])}
  L.sort(function(a,b){var ka=a[1]>0?100-a[1]:(a[1]>-1?200:a[1]+50),kb=b[1]>0?100-b[1]:(b[1]>-1?200:b[1]+50);return ka-kb});
  o+=rails(p);
  L.forEach(function(e){var i=e[0],d=e[1];
    if(d>=0){var w=W*(1-.065*d),top=d<=1?H-CH-4.5*d:(d<=2?H-CH-4.5+(d-1):H-CH-3.5+10*(d-2)),tk=d>2?Math.max(0,1-(d-2)*1.5):1;
      o+=up(i,top,1,w,tk)}
    else if(d>-1)o+=flip(i,-d);
    else{var e=-d-1,dep=e<=1?D-3*e:D-3-11*(e-1),tk2=e>1?Math.max(0,1-(e-1)*1.5):1;
      o+=flat(i,dep,WN*(1-.07*e),tk2)}});
  sv.innerHTML=o;
  var r=idx();
  if(r!==cur){cur=r;$('#rb').textContent=String(r+1).padStart(2,'0');$('#rn').textContent=String(r+1).padStart(2,'0')+' / '+n;$('#rt').textContent=T[r][0];$('#rd').textContent=T[r][1];$('#live').textContent=T[r][0]+', kaart '+(r+1)+' van '+n}}
/* Eén veermodel voor alle beweging: scrollen, slepen, toetsen en knoppen lopen allemaal naar een doel (tg)
   met een kritisch gedempte veer. De snelheid blijft behouden, dus er is nooit een stilstand vlak voor het eindpunt. */
var tg=pos,last=0,wt=null,OM=12;
function kick(){if(!run){run=true;last=performance.now();requestAnimationFrame(loop)}}
function goTo(v){tg=v;kick()}
function goIdx(i){var r=Math.round(tg);tg=r+wrap(i-r);kick()}
function loop(t){
  var dt=Math.min(.033,(t-last)/1000);last=t;
  if(RM){pos=tg;vel=0}
  else if(!drag){vel+=(OM*OM*(tg-pos)-2*OM*vel)*dt;pos+=vel*dt}
  render();
  if(drag||Math.abs(tg-pos)>.0004||Math.abs(vel)>.003)requestAnimationFrame(loop);else{pos=tg;vel=0;run=false;render()}}
var acc=0,at=null;
/* Eén klik van het scrollwiel = precies één kaart. Een trackpad (kleine deltas) telt op tot een kaart. */
sv.addEventListener('wheel',function(e){e.preventDefault();
  var dy=e.deltaY,r=Math.round(tg);
  if(e.deltaMode===1||Math.abs(dy)>=50){acc=0;if(dy)goTo(r+(dy>0?1:-1));return}
  acc+=dy;clearTimeout(at);at=setTimeout(function(){acc=0},250);
  var k=Math.trunc(acc/60);if(k){k=Math.max(-2,Math.min(2,k));acc-=k*60;goTo(r+k)}},{passive:false});
sv.addEventListener('pointerdown',function(e){if(e.button>0)return;clearTimeout(wt);vel=0;tg=pos;drag={y:e.clientY,p:pos,moved:false,id:e.pointerId,t:performance.now(),v:0};kick()});
sv.addEventListener('pointermove',function(e){if(!drag)return;var dy=e.clientY-drag.y;
  if(Math.abs(dy)>5&&!drag.moved){drag.moved=true;try{sv.setPointerCapture(drag.id)}catch(x){}}
  var np=drag.p+dy/52,now=performance.now(),dtm=(now-drag.t)/1000;
  if(dtm>0)drag.v=drag.v*.6+((np-pos)/dtm)*.4;drag.t=now;pos=np;tg=np});
sv.addEventListener('pointerup',function(e){if(!drag)return;var m=drag.moved,d=drag;drag=null;
  if(!m){var g=document.elementFromPoint(e.clientX,e.clientY),h=g&&g.closest&&g.closest('[data-i]');
    if(h){var hi=+h.dataset.i;if(hi!==idx()){goIdx(hi)}else openTool(hi);return}tg=Math.round(pos);kick();return}
  vel=performance.now()-d.t>80?0:Math.max(-8,Math.min(8,d.v));tg=Math.round(pos+vel*.18);kick()});
sv.addEventListener('keydown',function(e){var r=Math.round(tg);
  if(e.key==='ArrowUp'||e.key==='ArrowLeft'){e.preventDefault();goTo(r-1)}
  else if(e.key==='ArrowDown'||e.key==='ArrowRight'){e.preventDefault();goTo(r+1)}
  else if(e.key==='Home'){e.preventDefault();goIdx(0)}else if(e.key==='Enter'||e.key===' '){e.preventDefault();openTool(idx())}});
$('#pv').onclick=function(){goTo(Math.round(tg)-1)};$('#nx').onclick=function(){goTo(Math.round(tg)+1)};

/* ---------- Homepage: alle tools als raster ---------- */
(function(){var g='';T.forEach(function(t){g+='<a class="tl" href="'+(t[4]||('#'+t[3]))+'"><span class="l">'+t[0][0]+'</span><small>'+t[2]+'</small><span class="n">'+t[0]+'</span></a>'});$('#grid').innerHTML=g})();
$('#open').onclick=function(){openTool(idx())};
function openTool(i){if(T[i][4]){location.href=T[i][4]}else{location.hash=T[i][3]}}
/* ---------- Hulpfuncties ---------- */
function num(v){return parseFloat(String(v).replace(/\\./g,'').replace(',','.'))}
function fmt(x,d){if(!isFinite(x))return '–';var s=Math.abs(x).toFixed(d===undefined?2:d).split('.');return(x<0?'-':'')+s[0].replace(/\\B(?=(\\d{3})+(?!\\d))/g,'.')+(s[1]?','+s[1]:'')}
function eur(x){return '€ '+fmt(x,2)}
function iso(d){var p=function(k){return(k<10?'0':'')+k};return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())}
function plus(d,k){var x=new Date(d);x.setDate(x.getDate()+k);return x}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
var NOW=new Date();
/* ---------- Toolconfiguratie: velden + berekening ---------- */
var CFG={
 btw:{f:[['a','Bedrag in euro','num','1.250,00'],['r','Btw-tarief','sel','21',[['0','0%'],['6','6%'],['12','12%'],['21','21%']]],['m','Het bedrag is','sel','excl',[['excl','exclusief btw'],['incl','inclusief btw']]]],
  c:function(v){var a=num(v.a),r=num(v.r)/100;if(isNaN(a))return null;var net,vat,tot;if(v.m==='incl'){tot=a;net=a/(1+r);vat=a-net}else{net=a;vat=a*r;tot=a+vat}return[['Netto',eur(net)],['Btw',eur(vat)],['Totaal',eur(tot),1]]}},
 datum:{f:[['s','Startdatum','date',iso(NOW)],['e','Einddatum','date',iso(plus(NOW,30))]],
  c:function(v){var a=new Date(v.s+'T00:00:00'),b=new Date(v.e+'T00:00:00');if(isNaN(a)||isNaN(b))return null;var days=Math.round((b-a)/864e5),w=0,k,sg=days<0?-1:1;for(k=0;k<Math.abs(days);k++){var d=plus(sg>0?a:b,k).getDay();if(d!==0&&d!==6)w++}return[['Dagen',String(days)],['Weken',fmt(days/7,1)],['Werkdagen',String(w*sg),1]]}},
 eenheden:{f:[['a','Waarde','num','10'],['t','Omrekening','sel','0',[['0','km naar mijl'],['1','mijl naar km'],['2','kg naar pond'],['3','pond naar kg'],['4','°C naar °F'],['5','°F naar °C'],['6','liter naar gallon'],['7','gallon naar liter']]]],
  c:function(v){var a=num(v.a);if(isNaN(a))return null;var F=[[a*.621371,'mijl'],[a/.621371,'km'],[a*2.20462,'pond'],[a/2.20462,'kg'],[a*9/5+32,'°F'],[(a-32)*5/9,'°C'],[a*.264172,'gallon'],[a/.264172,'liter']][+v.t];return[['Resultaat',fmt(F[0],2)+' '+F[1],1]]}},
 factuur:{f:[['p','Voorvoegsel','txt','2026-'],['s','Eerste nummer','num','1'],['c','Aantal cijfers','num','4'],['k','Aantal nummers (max. 12)','num','6']],
  c:function(v){var s=Math.floor(num(v.s)),c=Math.floor(num(v.c)),k=Math.floor(num(v.k));if(isNaN(s)||isNaN(c)||isNaN(k)||k<1)return null;k=Math.min(k,12);var r=[],i;for(i=0;i<k;i++)r.push(['Nummer '+(i+1),v.p+String(s+i).padStart(c,'0')]);return r}},
 kilometers:{f:[['k','Aantal kilometers','num','120'],['t','Tarief per kilometer (€)','num','0,43']],
  c:function(v){var k=num(v.k),t=num(v.t);if(isNaN(k)||isNaN(t))return null;return[['Kilometers',fmt(k,1)+' km'],['Vergoeding',eur(k*t),1]]}},
 lening:{f:[['a','Bedrag in euro','num','18.500,00'],['y','Looptijd in jaren','num','5'],['r','Rente per jaar (%)','num','5,25']],
  c:function(v){var a=num(v.a),y=num(v.y),r=num(v.r);if(!(a>0)||!(y>0)||isNaN(r)||r<0)return null;var m=y*12,i=r/1200,p=i===0?a/m:a*i/(1-Math.pow(1+i,-m));return[['Maandlast',eur(p),1],['Totale rente',eur(p*m-a)],['Totaal terug te betalen',eur(p*m)]]}},
 marge:{f:[['i','Inkoopprijs (€)','num','640,00'],['v','Verkoopprijs (€)','num','925,00']],
  c:function(v){var i=num(v.i),s=num(v.v);if(isNaN(i)||!(s>0))return null;return[['Marge',eur(s-i)],['Marge op verkoopprijs',fmt((s-i)/s*100,2)+' %',1],['Opslag op inkoopprijs',i>0?fmt((s-i)/i*100,2)+' %':'–']]}},
 procent:{f:[['a','Getal A','num','15'],['b','Getal B','num','240']],
  c:function(v){var a=num(v.a),b=num(v.b);if(isNaN(a)||isNaN(b))return null;return[[fmt(a,2)+' % van '+fmt(b,2),fmt(a/100*b,2),1],[fmt(a,2)+' is hoeveel % van '+fmt(b,2),b?fmt(a/b*100,2)+' %':'–'],['Verandering van '+fmt(a,2)+' naar '+fmt(b,2),a?fmt((b-a)/a*100,2)+' %':'–']]}},
 tijd:{f:[['s','Starttijd','time','09:00'],['e','Eindtijd','time','17:30'],['p','Pauze in minuten','num','30']],
  c:function(v){var a=v.s.split(':'),b=v.e.split(':'),p=num(v.p);if(a.length<2||b.length<2||isNaN(p))return null;var m=(+b[0]*60+ +b[1])-(+a[0]*60+ +a[1])-p;if(m<0)return null;return[['Gewerkt',Math.floor(m/60)+' u '+(m%60<10?'0':'')+(m%60)+' min',1],['In uren',fmt(m/60,2)+' u']]}},
 uurtarief:{f:[['n','Gewenst netto inkomen per jaar (€)','num','36.000'],['l','Belasting en sociale lasten (%)','num','30'],['k','Bedrijfskosten per jaar (€)','num','6.000'],['u','Factureerbare uren per jaar','num','1.200']],
  c:function(v){var n1=num(v.n),l=num(v.l),k=num(v.k),u=num(v.u);if(isNaN(n1)||isNaN(l)||l>=100||isNaN(k)||!(u>0))return null;var om=n1/(1-l/100)+k;return[['Benodigde omzet per jaar',eur(om)],['Uurtarief',eur(om/u),1]]}},
 agenda:{list:'amigo-agenda',date:1,ph:'Afspraak of deadline'},
 notities:{list:'amigo-notities',ph:'Nieuwe notitie'}
};
/* ---------- Toolpagina ---------- */
var tool=$('#tool'),home=$('#home'),lastTool=-1;
function build(i){
  var t=T[i],c=CFG[t[3]],h='<div class="tp reveal"><a class="back" href="#home">◂ Terug naar de index</a><div class="lab" style="color:var(--muted)">AMIGO '+t[2]+' · '+String(i+1).padStart(2,'0')+' / '+n+'</div><h1 tabindex="-1" id="th">'+t[0]+'</h1><p class="d">'+t[1]+'</p>';
  if(c.list){
    h+='<div class="tgrid" style="grid-template-columns:1fr"><div><div class="add"><input id="li" placeholder="'+c.ph+'" aria-label="'+c.ph+'">'+(c.date?'<input id="ld" type="date" style="max-width:190px" value="'+iso(NOW)+'" aria-label="Datum">':'')+'<button class="go" type="button" id="la">Toevoegen</button></div><div id="ll"></div></div></div>'}
  else{
    h+='<div class="tgrid"><div id="tf">';
    c.f.forEach(function(q){h+='<div class="fld"><label class="lab" for="f_'+q[0]+'">'+q[1]+'</label>';
      if(q[2]==='sel'){h+='<select id="f_'+q[0]+'">';q[4].forEach(function(o){h+='<option value="'+o[0]+'"'+(o[0]===q[3]?' selected':'')+'>'+o[1]+'</option>'});h+='</select>'}
      else h+='<input id="f_'+q[0]+'" '+(q[2]==='num'?'inputmode="decimal" ':'')+'type="'+(q[2]==='num'||q[2]==='txt'?'text':q[2])+'" value="'+q[3]+'" autocomplete="off">';
      h+='</div>'});
    h+='</div><div><div id="tr" aria-live="polite"></div><span class="stat lab" id="ts"></span></div></div>'}
  var pv=(i+n-1)%n,nx=(i+1)%n;
  h+='<div class="pn"><a class="go sec" href="'+(T[pv][4]||('#'+T[pv][3]))+'">◂ '+T[pv][0]+'</a><a class="go sec" href="'+(T[nx][4]||('#'+T[nx][3]))+'">'+T[nx][0]+' ▸</a></div></div>';
  tool.innerHTML=h;
  if(c.list)listTool(c);else{var go=function(){calc(c)};$('#tf').addEventListener('input',go);$('#tf').addEventListener('change',go);calc(c)}
}
function calc(c){var v={};c.f.forEach(function(q){v[q[0]]=$('#f_'+q[0]).value});var r=c.c(v),o='';
  if(!r){$('#tr').innerHTML='';$('#ts').textContent='Controleer invoer';$('#ts').className='stat lab err';return}
  r.forEach(function(x){o+='<div class="res'+(x[2]?' big':'')+'"><span class="lab">'+esc(x[0])+'</span><b>'+esc(x[1])+'</b></div>'});
  $('#tr').innerHTML=o;$('#ts').textContent='Berekend';$('#ts').className='stat lab'}
function listTool(c){var items=[];try{items=JSON.parse(localStorage.getItem(c.list)||'[]')}catch(e){}
  function save(){try{localStorage.setItem(c.list,JSON.stringify(items))}catch(e){}}
  function draw(){var o='';
    if(c.date)items.sort(function(a,b){return(a.d||'')<(b.d||'')?-1:1});
    items.forEach(function(it,k){o+='<div class="it">'+(c.date?'<em>'+esc(it.d||'')+'</em>':'')+'<span>'+esc(it.t)+'</span><button type="button" data-k="'+k+'" aria-label="Verwijderen">×</button></div>'});
    $('#ll').innerHTML=o||'<p class="empty">Nog niets toegevoegd.</p>'}
  function add(){var t=$('#li').value.trim();if(!t)return;items.push({t:t,d:c.date?$('#ld').value:''});$('#li').value='';save();draw();$('#li').focus()}
  $('#la').onclick=add;$('#li').addEventListener('keydown',function(e){if(e.key==='Enter')add()});
  $('#ll').addEventListener('click',function(e){var b=e.target.closest('button[data-k]');if(b){items.splice(+b.dataset.k,1);save();draw()}});
  draw()}
function showTool(i){lastTool=i;home.hidden=true;tool.hidden=false;build(i);document.title='AMIGO – '+T[i][0];window.scrollTo(0,0);var h=$('#th');if(h)h.focus({preventScroll:true})}
function showHome(){var was=lastTool;tool.hidden=true;home.hidden=false;document.title='AMIGO – Wherever, whenever.';
  if(was>=0){var r=Math.round(pos);pos=tg=r+wrap(was-r);vel=0;kick();lastTool=-1}}
function route(){var h=location.hash.slice(1),i=-1,k;for(k=0;k<n;k++)if(T[k][3]===h)i=k;if(i>=0&&T[i][4]){location.href=T[i][4];return}if(i>=0)showTool(i);else showHome()}
window.addEventListener('hashchange',route);

render();route();
})();`;

export default function HomePage() {
  const containerRef = useRef(null);

  useEffect(() => {
    const script = document.createElement('script');
    // Een dynamisch aangemaakt en toegevoegd <script>-element voert wél
    // echt uit (in tegenstelling tot script-tags die via innerHTML/
    // dangerouslySetInnerHTML worden ingevoegd) — zo draait de originele
    // vanilla-JS ongewijzigd tegen de zojuist door React gerenderde DOM.
    script.textContent = HOME_SCRIPT;
    document.body.appendChild(script);

    return () => {
      script.remove();
    };
  }, []);

  return (
    <div ref={containerRef}>
      <header className="top">
        <div className="wrap">
          <a className="logo" href="#home">
            AMIGO
          </a>
          <nav aria-label="Hoofdmenu">
            <a href="#home">Index</a>
            <a href="#alle-tools">Alle tools</a>
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <div id="home">
        <main className="wrap">
          <section className="hero" aria-label="Start">
            <div className="intro">
              <div className="lab" style={{ color: 'var(--muted)', marginBottom: '14px' }}>
                AMIGO · Digitale tools
              </div>
              <h1>Wherever, whenever.</h1>
              <p>Jouw vriend onderweg. Draai door de index en open de tool die je nodig hebt.</p>
            </div>
            <div className="frame">
              <div className="bar">
                <span className="lab">Index</span>
                <span className="lab" id="rn">
                  00 / 00
                </span>
              </div>
              <svg
                id="sv"
                viewBox="0 50 360 220"
                tabIndex={0}
                role="listbox"
                aria-label="Toolindex. Pijltjestoetsen om te draaien, Enter om te openen."
              />
              <div className="ctl">
                <button type="button" id="pv">
                  ◂ Vorige
                </button>
                <button type="button" id="nx">
                  Volgende ▸
                </button>
              </div>
            </div>
            <div className="now">
              <span className="lab" style={{ color: 'var(--muted)' }}>
                Geselecteerd
              </span>
              <div className="row">
                <b id="rb">07</b>
                <h2 id="rt" />
              </div>
              <p id="rd" />
              <button className="go" type="button" id="open">
                Open tool ▸
              </button>
            </div>
          </section>
          <section className="all" id="alle-tools">
            <h2>Alle tools</h2>
            <nav className="grid" id="grid" aria-label="Alle tools" />
          </section>
        </main>
      </div>
      <div id="tool" hidden />
      <p id="live" aria-live="polite" style={{ position: 'absolute', left: '-9999px' }} />
    </div>
  );
}
