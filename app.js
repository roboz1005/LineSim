'use strict';
// LineSim — all geometry is stored in real page millimetres (y down, origin top-left).
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],hyp=Math.hypot;
const cv=$('#c'),ctx=cv.getContext('2d'),bar=$('#bar'),chip=$('#chip');
const MPU={nm:1e-6,'µm':1e-3,mm:1,cm:10,m:1e3,km:1e6,in:25.4,ft:304.8,yd:914.4,mi:1609344};
const COLS=['#111111','#dc2626','#2563eb','#16a34a','#ea580c','#9333ea','#0d9488','#78350f'];
const PRE='1:1 1:2 1:5 1:10 1:20 1:50 1:100 1:200 1:500 1:1000 2:1 5:1 10:1 20:1 50:1 100:1'.split(' ');
const S={tool:'line',color:COLS[0],width:.8,orient:'p',unit:'mm',ps:1,pr:1,snapPt:true,snapLn:true,snapAng:true,grid:false,gridStep:null,meas:true,betw:true,side:'top',dec:'auto',showScale:true,finger:false,step:false,stepLen:null,stepAng:5,autoHide:false,angColor:'#c026d3'};
let shapes=[],hist=[],redo=[],draw=null,ui=true,cw=0,ch=0,dpr=1,fk=1,pen=0,penT=0,lastKey='',hits=[],dp=null,eraser=null,erP=0;
const v={k:3,ox:0,oy:0},P=new Map();
try{const d=JSON.parse(localStorage.getItem('linesim'));if(d){shapes=d.shapes||[];Object.assign(S,d.S)}}catch(e){}
const save=()=>{try{localStorage.setItem('linesim',JSON.stringify({shapes,S}))}catch(e){}};
const PW=()=>S.orient==='p'?210:297,PH=()=>S.orient==='p'?297:210;
const X=x=>v.ox+x*v.k,Y=y=>v.oy+y*v.k,RR=()=>S.pr/S.ps,uid=()=>shapes.reduce((m,s)=>Math.max(m,s.id),0)+1;
const D=Math.PI/180,wrap=a=>((a+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;

// ---------- labels: scale, unit, number format ----------
function fmt(mm){const u=MPU[S.unit],val=mm*RR()/u;
 if(S.dec==='auto'){const d=Math.min(3,Math.max(0,Math.ceil(-Math.log10(.1*RR()/u)-1e-9)));return String(+val.toFixed(d))}
 return val.toFixed(+S.dec)}
// The angle number is the wedge the arc shows: between the dashed horizontal at the line's start
// (pointing the same way the line travels sideways) and the line itself, so it is always 0–90°.
function ang(dx,dy){const ref=dx>=0?0:Math.PI,sw=wrap(Math.atan2(dy,dx)-ref);return{flip:0,ref,sw,val:Math.abs(sw)/D}}
const angTxt=(dx,dy)=>ang(dx,dy).val.toFixed(1)+'°';
const nice=x=>{const e=10**Math.floor(Math.log10(x)),m=x/e;return e*[1,2,5,10].reduce((a,b)=>Math.abs(Math.log(b/m))<Math.abs(Math.log(a/m))?b:a)};
const stepMM=u=>(u>0?u:nice(5*RR()/MPU[S.unit]))*MPU[S.unit]/RR(); // a step typed in the unit, as paper mm
const gstep=()=>stepMM(S.gridStep),lstep=()=>stepMM(S.stepLen);

// ---------- geometry + snapping ----------
function seg(px,py,s){const dx=s.x2-s.x1,dy=s.y2-s.y1,L=dx*dx+dy*dy;let t=L?((px-s.x1)*dx+(py-s.y1)*dy)/L:0;t=Math.max(0,Math.min(1,t));
 const x=s.x1+t*dx,y=s.y1+t*dy;return{x,y,d:hyp(px-x,py-y)}}
function pts(){const w=PW(),h=PH(),r=[[0,0],[w,0],[0,h],[w,h],[w/2,0],[w/2,h],[0,h/2],[w,h/2],[w/2,h/2]];
 for(const s of shapes){
  if(s.type==='line')r.push([s.x1,s.y1],[s.x2,s.y2],[(s.x1+s.x2)/2,(s.y1+s.y2)/2]);
  else if(s.type==='rect'){for(const i of[-1,0,1])for(const j of[-1,0,1])r.push([s.cx+i*s.hw,s.cy+j*s.hh])}
  else r.push([s.cx,s.cy],[s.cx+s.r,s.cy],[s.cx-s.r,s.cy],[s.cx,s.cy+s.r],[s.cx,s.cy-s.r])}
 return r}
// priority: point targets > point on line > angle snap > grid snap
function snapAt(sx,sy,an){const m={x:(sx-v.ox)/v.k,y:(sy-v.oy)/v.k},R=12/v.k;let b=null,bd=R;
 if(S.snapPt)for(const p of pts()){const d=hyp(p[0]-m.x,p[1]-m.y);if(d<bd){bd=d;b=p}}
 if(!b&&S.snapLn)for(const s of shapes)if(s.type==='line'){const q=seg(m.x,m.y,s);if(q.d<bd){bd=q.d;b=[q.x,q.y]}}
 if(b)return{x:b[0],y:b[1],ring:1};
 if(an&&S.step){const dx=m.x-an.x,dy=m.y-an.y,ls=lstep(),as=S.stepAng>0?S.stepAng:5,A=ang(dx,dy),q=Math.min(90,Math.round(A.val/as)*as),
  f=A.ref+(A.sw<0?-1:1)*q*D,l=Math.max(ls,Math.round(hyp(dx,dy)/ls)*ls);
  return{x:an.x+l*Math.cos(f),y:an.y+l*Math.sin(f),k:'s'+q+'/'+l.toFixed(3)}}
 if(an&&S.snapAng){const dx=m.x-an.x,dy=m.y-an.y,L=hyp(dx,dy);
  if(L>0){const a=Math.atan2(-dy,dx)/D,n=Math.round(a/15)*15;
   if(Math.abs(a-n)<=3)return{x:an.x+L*Math.cos(n*D),y:an.y-L*Math.sin(n*D)}}}
 if(S.grid){const g=gstep();return{x:Math.round(m.x/g)*g,y:Math.round(m.y/g)*g}}
 return m}
function hap(b){const k=b.ring?b.x.toFixed(2)+b.y.toFixed(2):b.k||'';if(k&&k!==lastKey)navigator.vibrate?.(8);lastKey=k}

// ---------- shapes + between-line angles ----------
function calcJoins(s){const j=[];
 for(const e of['a','b']){const x=e==='a'?s.x1:s.x2,y=e==='a'?s.y1:s.y2;
  for(const o of shapes)if(o.type==='line'&&o.id!==s.id&&seg(x,y,o).d<.02)j.push({end:e,otherId:o.id,show:true})}
 return j}
function jinfo(s,j){const o=shapes.find(q=>q.id===j.otherId);if(!o)return;
 const A=j.end==='a',p=A?[s.x1,s.y1]:[s.x2,s.y2],f=A?[s.x2,s.y2]:[s.x1,s.y1],u=[f[0]-p[0],f[1]-p[1]];
 let w=[o.x2-o.x1,o.y2-o.y1];
 if(hyp(p[0]-o.x1,p[1]-o.y1)<.05){}
 else if(hyp(p[0]-o.x2,p[1]-o.y2)<.05)w=[-w[0],-w[1]];
 else if(u[0]*w[0]+u[1]*w[1]<0)w=[-w[0],-w[1]]; // T-junction: smaller angle
 const lu=hyp(...u),lw=hyp(...w),c=(u[0]*w[0]+u[1]*w[1])/(lu*lw);
 return{p,u,w,lu,lw,deg:Math.acos(Math.max(-1,Math.min(1,c)))/D}}
function mk(d){const{a,b,tool}=d;let s;
 if(tool==='line'){if(hyp(b.x-a.x,b.y-a.y)<.5)return null;s={type:'line',x1:a.x,y1:a.y,x2:b.x,y2:b.y}}
 else if(tool==='rect'){s={type:'rect',cx:a.x,cy:a.y,hw:Math.abs(b.x-a.x),hh:Math.abs(b.y-a.y)};if(s.hw<.25&&s.hh<.25)return null}
 else{s={type:'circle',cx:a.x,cy:a.y,r:hyp(b.x-a.x,b.y-a.y)};if(s.r<.5)return null}
 Object.assign(s,{id:0,color:S.color,width:S.width});
 if(s.type==='line'){s.joins=calcJoins(s);if(S.autoHide){s.sl=s.sa=false;s.joins.forEach(j=>j.show=false)}}
 return s}
const live=d=>{const s=d&&mk(d);if(s&&s.type==='line'){s.sl=s.sa=true;s.joins.forEach(j=>j.show=true)}return s}; // while drawing, labels are always visible

// ---------- rendering ----------
const FONT='600 13px system-ui,sans-serif';
// A tappable label. o[k]===false hides it: it becomes a faint ghost dot (drawn only while the UI is showing).
function lab(t,x,y,c,o,k,nx,ny){
 ctx.font=FONT;ctx.textAlign='center';ctx.textBaseline='middle';const w=ctx.measureText(t).width;
 if(nx!=null){const d=7+Math.abs(nx)*w/2+Math.abs(ny)*8;x+=nx*d;y+=ny*d}
 if(o[k]===false){if(ui){ctx.save();ctx.strokeStyle=c;ctx.globalAlpha=.5;ctx.lineWidth=1.5;ctx.setLineDash([2,2]);ctx.beginPath();ctx.arc(x,y,6,0,7);ctx.stroke();ctx.restore();hits.push({o,k,x,y,w:0})}return}
 ctx.lineJoin='round';ctx.lineWidth=4;ctx.strokeStyle='#fff';ctx.strokeText(t,x,y);ctx.fillStyle=c;ctx.fillText(t,x,y);hits.push({o,k,x,y,w})}
function labels(s){
 const ax=X(s.x1),ay=Y(s.y1),dx=X(s.x2)-ax,dy=Y(s.y2)-ay,L=hyp(dx,dy);if(L<3)return;
 // length: "top" side (up the screen; right for vertical lines) unless flipped; uses the line colour
 let nx=dy/L,ny=-dx/L;if(ny>1e-9||(Math.abs(ny)<1e-9&&nx<0)){nx=-nx;ny=-ny}
 if(S.side==='bottom'){nx=-nx;ny=-ny}
 lab(fmt(L/v.k),ax+dx/2,ay+dy/2,s.color,s,'sl',nx,ny);
 // angle with the horizontal: dashed reference + arc at the start point, in the fixed angle colour
 const A=ang(dx,dy),sx=A.ref?-1:1,r=Math.max(8,Math.min(34,L*.35)),sw=A.sw,ac=S.angColor;
 if(s.sa!==false){ctx.save();ctx.strokeStyle=ac;ctx.lineWidth=1.2;ctx.setLineDash([5,4]);
  ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(ax+sx*(r+16),ay);ctx.stroke();
  ctx.setLineDash([]);ctx.beginPath();ctx.arc(ax,ay,r,A.ref,A.ref+sw,sw<0);ctx.stroke();ctx.restore()}
 const m=A.ref+sw/2;let tx=ax+Math.cos(m)*(r+16),ty=ay+Math.sin(m)*(r+16);
 if(Math.abs(sw)<.4){tx=ax+sx*(r+24);ty=ay-(Math.sin(A.ref+sw)>=0?1:-1)*11}
 lab(A.val.toFixed(1)+'°',tx,ty,ac,s,'sa');
 // angle between this line and the ones it snapped onto
 if(S.betw)for(const j of s.joins||[]){const o=jinfo(s,j);if(!o)continue;
  const a1=Math.atan2(o.u[1],o.u[0]),d=wrap(Math.atan2(o.w[1],o.w[0])-a1),
   rr=Math.max(6,Math.min(28,.35*Math.min(o.lu,o.lw)*v.k)),px=X(o.p[0]),py=Y(o.p[1]),b=a1+d/2;
  if(j.show!==false){ctx.save();ctx.strokeStyle=ac;ctx.lineWidth=1.5;ctx.setLineDash([2,3]);ctx.beginPath();ctx.arc(px,py,rr,a1,a1+d,d<0);ctx.stroke();ctx.restore()}
  lab(o.deg.toFixed(1)+'°',px+Math.cos(b)*(rr+14),py+Math.sin(b)*(rr+14),ac,j,'show')}}
function render(){
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,cw,ch);hits=[];
 const w=PW(),h=PH(),pv=live(draw),all=pv?[...shapes,pv]:shapes;
 ctx.save();ctx.shadowColor='#0006';ctx.shadowBlur=14;ctx.fillStyle='#fff';ctx.fillRect(X(0),Y(0),w*v.k,h*v.k);ctx.restore();
 ctx.save();ctx.beginPath();ctx.rect(X(0),Y(0),w*v.k,h*v.k);ctx.clip();
 if(S.grid){const g=gstep();if(g*v.k>5){ctx.strokeStyle='#0000002e';ctx.lineWidth=1;ctx.beginPath();
  for(let i=0;i*g<=w;i++){ctx.moveTo(X(i*g),Y(0));ctx.lineTo(X(i*g),Y(h))}
  for(let i=0;i*g<=h;i++){ctx.moveTo(X(0),Y(i*g));ctx.lineTo(X(w),Y(i*g))}ctx.stroke()}}
 ctx.lineCap='round';ctx.lineJoin='miter';
 for(const s of all){ctx.strokeStyle=s.color;ctx.lineWidth=Math.max(1,s.width*v.k);ctx.beginPath();
  if(s.type==='line'){ctx.moveTo(X(s.x1),Y(s.y1));ctx.lineTo(X(s.x2),Y(s.y2))}
  else if(s.type==='rect')ctx.rect(X(s.cx-s.hw),Y(s.cy-s.hh),2*s.hw*v.k,2*s.hh*v.k);
  else ctx.arc(X(s.cx),Y(s.cy),s.r*v.k,0,7);
  ctx.stroke()}
 ctx.restore();
 if(S.meas){
  const t=S.unit+(S.showScale&&S.ps!==S.pr?' · '+S.ps+':'+S.pr:''),z=Math.max(11,Math.min(22,v.k*3.5));
  ctx.font=`600 ${z}px system-ui,sans-serif`;ctx.textAlign='right';ctx.textBaseline='top';ctx.fillStyle='#1c2733';ctx.fillText(t,X(w)-v.k*4,Y(0)+v.k*4);
  for(const s of all)if(s.type==='line')labels(s)}
 if(draw&&draw.b.ring){ctx.strokeStyle='#e8590c';ctx.lineWidth=2;ctx.beginPath();ctx.arc(X(draw.b.x),Y(draw.b.y),9,0,7);ctx.stroke()}
 if(eraser){ctx.strokeStyle='#e8590c';ctx.lineWidth=2;ctx.beginPath();ctx.arc(eraser.x,eraser.y,12,0,7);ctx.stroke()}
 const ln=pv&&pv.type==='line'&&S.meas;chip.hidden=!ln;
 if(ln)chip.textContent=fmt(hyp(pv.x2-pv.x1,pv.y2-pv.y1))+'   ∠ '+angTxt(pv.x2-pv.x1,pv.y2-pv.y1)}

// ---------- view ----------
function fit(){const t=ui?bar.offsetHeight:0,w=PW(),h=PH();fk=Math.min((cw-24)/w,(ch-t-24)/h);v.k=fk;v.ox=(cw-w*fk)/2;v.oy=t+(ch-t-h*fk)/2}
function zoomAt(x,y,f){const k=Math.min(30,Math.max(fk*.5,v.k*f));f=k/v.k;v.ox=x-(x-v.ox)*f;v.oy=y-(y-v.oy)*f;v.k=k}
new ResizeObserver(()=>{dpr=devicePixelRatio||1;cw=cv.clientWidth;ch=cv.clientHeight;cv.width=cw*dpr;cv.height=ch*dpr;
 document.documentElement.style.setProperty('--bh',bar.offsetHeight+'px');fit();render()}).observe(cv);
cv.addEventListener('wheel',e=>{e.preventDefault();zoomAt(e.clientX,e.clientY,Math.exp(-e.deltaY*.0015));render()},{passive:false});
cv.addEventListener('contextmenu',e=>e.preventDefault());

// ---------- input: pen/mouse draw, touch pans + pinch-zooms, palm rejection ----------
const pushH=()=>{hist.push(JSON.stringify(shapes));if(hist.length>100)hist.shift();redo=[]};
function distTo(s,x,y){
 if(s.type==='line')return seg(x,y,s).d;
 if(s.type==='circle')return Math.abs(hyp(x-s.cx,y-s.cy)-s.r);
 const dx=Math.abs(x-s.cx)-s.hw,dy=Math.abs(y-s.cy)-s.hh;
 return Math.abs(hyp(Math.max(dx,0),Math.max(dy,0))+Math.min(Math.max(dx,dy),0))}
function eraseAt(sx,sy){eraser={x:sx,y:sy};const x=(sx-v.ox)/v.k,y=(sy-v.oy)/v.k;let b=null,bd=12/v.k;
 for(const s of shapes){const d=distTo(s,x,y)-s.width/2;if(d<bd){bd=d;b=s}} // nearest shape within 12 px
 if(b){if(!erP){pushH();erP=1}shapes=shapes.filter(s=>s!==b);shapes.forEach(s=>{if(s.joins)s.joins=s.joins.filter(j=>j.otherId!==b.id)})}
 render()}
function tapAt(x,y){let b=null,bd=14;
 for(const h of hits){const d=hyp(Math.max(Math.abs(h.x-x)-h.w/2,0),h.y-y);if(d<bd){bd=d;b=h}}
 if(b){pushH();b.o[b.k]=b.o[b.k]===false}} // hide <-> show, kept until tapped again
cv.addEventListener('pointerdown',e=>{
 const now=performance.now(),t=e.pointerType==='touch';
 if(e.pointerType==='pen'){pen=1;penT=now}else if(t&&(pen||now-penT<300))return;
 if(e.pointerType==='mouse'&&e.button)return;
 closePops();cv.setPointerCapture(e.pointerId);
 const p={x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,t,role:'pan',multi:0};P.set(e.pointerId,p);
 const ts=[...P.values()].filter(q=>q.t);
 if(t&&ts.length>1){draw=eraser=null;ts.forEach(q=>{q.role='pan';q.multi=1})}
 else if(!t||S.finger){p.role='draw';lastKey='';
  if(S.tool==='erase'){erP=0;eraseAt(e.clientX,e.clientY)}
  else{const a=snapAt(e.clientX,e.clientY,null);draw={tool:S.tool,a,b:a};render()}}});
cv.addEventListener('pointermove',e=>{
 if(e.pointerType==='pen')penT=performance.now();
 const p=P.get(e.pointerId);if(!p)return;
 const ts=[...P.values()].filter(q=>q.t);
 if(p.role==='draw'){if(S.tool==='erase')eraseAt(e.clientX,e.clientY);else if(draw){draw.b=snapAt(e.clientX,e.clientY,S.tool==='line'?draw.a:null);hap(draw.b);render()}}
 else if(ts.length>1){const q=ts.find(o=>o!==p),f=hyp(e.clientX-q.x,e.clientY-q.y)/(hyp(p.x-q.x,p.y-q.y)||1),
  ox=(p.x+q.x)/2,oy=(p.y+q.y)/2,nx=(e.clientX+q.x)/2,ny=(e.clientY+q.y)/2;
  zoomAt(ox,oy,f);v.ox+=nx-ox;v.oy+=ny-oy;render()}
 else{v.ox+=e.clientX-p.x;v.oy+=e.clientY-p.y;render()}
 p.x=e.clientX;p.y=e.clientY});
function end(e){const p=P.get(e.pointerId);if(!p)return;P.delete(e.pointerId);
 if(e.pointerType==='pen'){pen=0;penT=performance.now()}
 if(p.role==='draw'&&S.tool==='erase'){eraser=null;save();render();return}
 const d=draw,up=e.type==='pointerup';if(p.role==='draw')draw=null;
 if(up&&!p.multi&&hyp(e.clientX-p.sx,e.clientY-p.sy)<5){render();tapAt(e.clientX,e.clientY)} // a tap never makes a shape
 else if(up&&d&&p.role==='draw'){const s=mk(d);if(s){pushH();s.id=uid();shapes.push(s)}}
 lastKey='';save();render()}
cv.addEventListener('pointerup',end);cv.addEventListener('pointercancel',end);

// ---------- UI wiring ----------
const closePops=()=>$$('.pop').forEach(x=>x.hidden=true);
function sync(){
 $$('[data-k]').forEach(el=>{const x=S[el.dataset.k];if(el.type==='checkbox')el.checked=!!x;else el.value=x??''});
 $$('[data-t]').forEach(b=>b.classList.toggle('on',b.dataset.t===S.tool));
 $$('.sw').forEach(b=>b.classList.toggle('on',b.dataset.c===S.color));
 $$('[data-w]').forEach(b=>b.classList.toggle('on',+b.dataset.w===S.width));
 $('#cc').value=S.color;$('#pre').value=PRE.includes(S.ps+':'+S.pr)?S.ps+':'+S.pr:''}
COLS.forEach(c=>{const b=document.createElement('button');b.className='sw';b.dataset.c=c;b.style.background=c;$('#cols').insertBefore(b,$('#cc'))});
PRE.forEach(p=>$('#pre').add(new Option(p,p)));
Object.keys(MPU).forEach(u=>$('#unit').add(new Option(u,u)));
bar.onclick=e=>{const b=e.target.closest('button'),d=b&&b.dataset;if(!d)return;
 if(d.t)S.tool=d.t;if(d.c)S.color=d.c;if(d.w)S.width=+d.w;sync();save()};
$('#cc').oninput=e=>{S.color=e.target.value;sync();save()};
$('#pre').onchange=e=>{if(!e.target.value)return;[S.ps,S.pr]=e.target.value.split(':').map(Number);sync();save();render()};
$$('[data-k]').forEach(el=>el.onchange=()=>{const k=el.dataset.k;
 let x=el.type==='checkbox'?el.checked:el.type==='number'?parseFloat(el.value):el.value;
 if(el.type==='number'&&!(x>0))x=['gridStep','stepLen'].includes(k)?null:S[k];
 S[k]=x;sync();if(k==='orient')fit();save();render()});
$$('[data-p]').forEach(b=>b.onclick=()=>{const p=$('#'+b.dataset.p),open=p.hidden;closePops();p.hidden=!open});
$('#bUndo').onclick=()=>{if(!hist.length)return;redo.push(JSON.stringify(shapes));shapes=JSON.parse(hist.pop());save();render()};
$('#bRedo').onclick=()=>{if(!redo.length)return;hist.push(JSON.stringify(shapes));shapes=JSON.parse(redo.pop());save();render()};
$('#bClear').onclick=()=>{if(shapes.length&&confirm('Clear the whole page?')){pushH();shapes=[];save();render()}};
$('#bFit').onclick=()=>{fit();render()};
function setUI(on){ui=on;document.body.classList.toggle('noui',!on);closePops();
 if(!on)Promise.resolve(document.documentElement.requestFullscreen?.()).catch(()=>{});
 else if(document.fullscreenElement)document.exitFullscreen?.();
 fit();render()}
$('#bHide').onclick=()=>setUI(false);$('#bShow').onclick=()=>setUI(true);
addEventListener('beforeinstallprompt',e=>{e.preventDefault();dp=e;$('#bInst').hidden=false});
$('#bInst').onclick=()=>dp&&dp.prompt();
// ---------- snip: drag a box, the area is copied to the clipboard as a clean PNG ----------
const snapEl=$('#snap'),selEl=$('#sel');let sel=null,tt=0;
const toast=m=>{const t=$('#toast');t.textContent=m;t.hidden=false;clearTimeout(tt);tt=setTimeout(()=>t.hidden=true,2600)};
function snapMode(on){document.body.classList.toggle('snapping',on);snapEl.hidden=!on;selEl.hidden=true;snapEl.classList.remove('drag');sel=null;closePops()}
const selRect=()=>({x:Math.min(sel.x,sel.x2),y:Math.min(sel.y,sel.y2),w:Math.abs(sel.x2-sel.x),h:Math.abs(sel.y2-sel.y)});
function drawSel(){const r=selRect();Object.assign(selEl.style,{left:r.x+'px',top:r.y+'px',width:r.w+'px',height:r.h+'px'});selEl.hidden=false}
snapEl.addEventListener('pointerdown',e=>{if(!e.isPrimary||e.target.closest('#sbar'))return;snapEl.setPointerCapture(e.pointerId);
 sel={x:e.clientX,y:e.clientY,x2:e.clientX,y2:e.clientY};snapEl.classList.add('drag');drawSel()});
snapEl.addEventListener('pointermove',e=>{if(!sel||!e.isPrimary)return;sel.x2=e.clientX;sel.y2=e.clientY;drawSel()});
snapEl.addEventListener('pointerup',e=>{if(!sel||!e.isPrimary)return;sel.x2=e.clientX;sel.y2=e.clientY;const r=selRect();sel=null;
 if(r.w<16||r.h<16){selEl.hidden=true;snapEl.classList.remove('drag');return}
 capture(r.x,r.y,r.w,r.h)});
function capture(x,y,w,h){ // runs inside the pointerup gesture so the clipboard write is allowed
 const x2=Math.min(cw,x+w),y2=Math.min(ch,y+h);x=Math.max(0,x);y=Math.max(0,y);w=x2-x;h=y2-y;if(w<4||h<4){snapMode(false);return}
 const sUi=ui,sDraw=draw,sEr=eraser,q=Math.max(dpr,2); // re-render sharper (min 2x) and without ghost dots, rings or toolbar
 ui=false;draw=eraser=null;dpr=q;cv.width=cw*q;cv.height=ch*q;render();
 const o=document.createElement('canvas');o.width=Math.round(w*q);o.height=Math.round(h*q);
 const c=o.getContext('2d');c.fillStyle='#c9d0d8';c.fillRect(0,0,o.width,o.height);c.drawImage(cv,x*q,y*q,w*q,h*q,0,0,o.width,o.height);
 ui=sUi;draw=sDraw;eraser=sEr;dpr=devicePixelRatio||1;cv.width=cw*dpr;cv.height=ch*dpr;render();
 snapMode(false);deliver(o)}
async function deliver(o){
 const bp=new Promise(r=>o.toBlob(r,'image/png'));
 try{await navigator.clipboard.write([new ClipboardItem({'image/png':bp})]);toast('Copied. Paste it anywhere.');return}catch(e){}
 const b=await bp,f=new File([b],'linesim.png',{type:'image/png'});
 try{if(navigator.canShare&&navigator.canShare({files:[f]})){await navigator.share({files:[f]});return}}catch(e){if(e.name==='AbortError')return}
 const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='linesim.png';a.click();toast('Clipboard blocked, saved as linesim.png')}
$('#bSnip').onclick=()=>snapMode(true);$('#sCancel').onclick=()=>snapMode(false);
$('#sPage').onclick=()=>capture(X(0),Y(0),PW()*v.k,PH()*v.k);
addEventListener('keydown',e=>{if(e.key==='Escape')snapMode(false)});
sync();
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js');
