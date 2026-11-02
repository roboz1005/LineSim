'use strict';
// LineSim — all geometry is stored in real page millimetres (y down, origin top-left).
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],hyp=Math.hypot;
const cv=$('#c'),ctx=cv.getContext('2d'),bar=$('#bar'),chip=$('#chip'),panL=$('#panL'),panR=$('#panR'),fLen=$('#fLen'),fAng=$('#fAng');
const MPU={nm:1e-6,'µm':1e-3,mm:1,cm:10,m:1e3,km:1e6,in:25.4,ft:304.8,yd:914.4,mi:1609344};
const COLS=['#111111','#dc2626','#2563eb'];
const PRE='1:1 1:2 1:5 1:10 1:20 1:50 1:100 1:200 1:500 1:1000 2:1 5:1 10:1 20:1 50:1 100:1'.split(' ');
const S={tool:'line',color:COLS[0],width:.8,orient:'p',unit:'mm',ps:1,pr:1,snapPt:true,snapLn:true,snapAng:true,grid:false,gridStep:null,meas:true,betw:true,side:'top',dec:'auto',showScale:true,finger:false,step:'off',dash:false,track:false,stepLen:null,stepAng:5,autoHide:false,angColor:'#c026d3'};
let shapes=[],hist=[],redo=[],pages=[{}],cur=0,draw=null,ui=true,cw=0,ch=0,dpr=1,fk=1,pen=0,penT=0,lastKey='',hits=[],dp=null,eraser=null,erP=0,selId=0,numEl=null,fresh=1,hd=null,sc=null;
const v={k:3,ox:0,oy:0},P=new Map();
const PG=['ps','pr','unit','orient']; // settings that belong to a page (scale, unit, orientation)
try{const d=JSON.parse(localStorage.getItem('linesim'));if(d){Object.assign(S,d.S);
 if(d.pages&&d.pages.length){pages=d.pages.map(p=>({hist:[],redo:[],...p}));cur=Math.min(d.cur||0,pages.length-1);const p=pages[cur];shapes=p.shapes;hist=p.hist;redo=p.redo;PG.forEach(k=>S[k]=p[k])}
 else{shapes=d.shapes||[];pages=[{}];stash()}}}catch(e){}
S.step=S.step===true?'both':S.step||'off';
pages.forEach(p=>(p.shapes||[]).forEach(s=>{if(s.type==='line'&&!s.ps){s.ps=p.ps||1;s.pr=p.pr||1}})); // older drawings: freeze the scale they were labelled with
const save=()=>{try{stash();localStorage.setItem('linesim',JSON.stringify({pages:pages.map(({shapes,ps,pr,unit,orient})=>({shapes,ps,pr,unit,orient})),cur,S}))}catch(e){}};
const PW=()=>S.orient==='p'?210:297,PH=()=>S.orient==='p'?297:210;
const X=x=>v.ox+x*v.k,Y=y=>v.oy+y*v.k,RR=()=>S.pr/S.ps,uid=()=>shapes.reduce((m,s)=>Math.max(m,s.id),0)+1;
const D=Math.PI/180,wrap=a=>((a+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;

// ---------- labels: scale, unit, number format ----------
function fmt(mm,o){const r=o&&o.ps?o.pr/o.ps:RR(),u=MPU[S.unit],val=mm*r/u; // a line keeps the scale it was drawn with
 if(S.dec==='auto'){const d=Math.min(3,Math.max(0,Math.ceil(-Math.log10(.1*r/u)-1e-9)));return String(+val.toFixed(d))}
 return val.toFixed(+S.dec)}
// The angle number is the wedge the arc shows: between the dashed horizontal at the line's start
// (pointing the same way the line travels sideways) and the line itself, so it is always 0–90°.
function ang(dx,dy){const ref=dx>=0?0:Math.PI,sw=wrap(Math.atan2(dy,dx)-ref);return{flip:0,ref,sw,val:Math.abs(sw)/D}}
const angTxt=(dx,dy)=>ang(dx,dy).val.toFixed(1)+'°';
const nice=x=>{const e=10**Math.floor(Math.log10(x)),m=x/e;return e*[1,2,5,10].reduce((a,b)=>Math.abs(Math.log(b/m))<Math.abs(Math.log(a/m))?b:a)};
const stepMM=(u,r=RR())=>(u>0?u:nice(5*r/MPU[S.unit]))*MPU[S.unit]/r; // a step typed in the unit, as paper mm
const gstep=()=>stepMM(S.gridStep),lstep=o=>stepMM(S.stepLen,o&&o.ps?o.pr/o.ps:RR());

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
 if(S.track){const t=trackAt(m,an,8/v.k);if(t)return t} // snapping to a track line turns step mode off
 if(an&&S.step!=='off'){const dx=m.x-an.x,dy=m.y-an.y,ls=lstep(),as=S.stepAng>0?S.stepAng:5,A=ang(dx,dy),
   q=Math.min(90,Math.round(A.val/as)*as),lo=S.step==='len'||S.step==='both',ao=S.step==='ang'||S.step==='both',
   f=ao?A.ref+(A.sw<0?-1:1)*q*D:Math.atan2(dy,dx),l=lo?Math.max(ls,Math.round(hyp(dx,dy)/ls)*ls):hyp(dx,dy);
  return{x:an.x+l*Math.cos(f),y:an.y+l*Math.sin(f),k:'s'+(ao?q:'')+'/'+(lo?l.toFixed(3):'')}}
 if(an&&S.snapAng){const dx=m.x-an.x,dy=m.y-an.y,L=hyp(dx,dy);
  if(L>0){const a=Math.atan2(-dy,dx)/D,n=Math.round(a/15)*15;
   if(Math.abs(a-n)<=3)return{x:an.x+L*Math.cos(n*D),y:an.y-L*Math.sin(n*D)}}}
 if(S.grid){const g=gstep();return{x:Math.round(m.x/g)*g,y:Math.round(m.y/g)*g}}
 return m}
function trackAt(m,an,thr){
 const sl=an&&shapes.find(o=>o.id===selId&&o.type==='line'); // parallel + perpendicular to the selected line
 if(sl){const dx=sl.x2-sl.x1,dy=sl.y2-sl.y1,L=hyp(dx,dy),ux=dx/L,uy=dy/L,vx=m.x-an.x,vy=m.y-an.y;
  for(const[tx,ty]of[[ux,uy],[-uy,ux]])if(Math.abs(vx*ty-vy*tx)<thr){const t=vx*tx+vy*ty;
   return{x:an.x+t*tx,y:an.y+t*ty,tr:[{p:[an.x,an.y],d:[tx,ty]}],k:'p'+tx.toFixed(3)+'/'+ty.toFixed(3)}}}
 const refs=pts();if(an)refs.push([an.x,an.y]);let bx=null,by=null,bdx=thr,bdy=thr;
 for(const p of refs){const dx=Math.abs(m.x-p[0]),dy=Math.abs(m.y-p[1]);if(dx<bdx){bdx=dx;bx=p}if(dy<bdy){bdy=dy;by=p}}
 if(bx||by){const x=bx?bx[0]:m.x,y=by?by[1]:m.y,tr=[];if(bx)tr.push({p:bx,d:[0,1]});if(by)tr.push({p:by,d:[1,0]});return{x,y,tr,k:'t'+x.toFixed(2)+'/'+y.toFixed(2)}}
 for(const s of shapes)if(s.type==='line'){const dx=s.x2-s.x1,dy=s.y2-s.y1,L=hyp(dx,dy),c=((m.x-s.x1)*dy-(m.y-s.y1)*dx)/L;
  if(Math.abs(c)<thr){const t=((m.x-s.x1)*dx+(m.y-s.y1)*dy)/(L*L);return{x:s.x1+t*dx,y:s.y1+t*dy,tr:[{p:[s.x1,s.y1],d:[dx/L,dy/L]}],k:'e'+s.id}}}
 return null}
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
 Object.assign(s,{id:0,color:S.color,width:S.width,d:S.dash?1:0});
 if(s.type==='line'){s.joins=calcJoins(s);s.ps=S.ps;s.pr=S.pr;if(S.autoHide){s.sl=s.sa=false;s.joins.forEach(j=>j.show=false)}}
 return s}
const live=d=>{const s=d&&mk(d);if(s&&s.type==='line'){s.sl=s.sa=true;s.joins.forEach(j=>j.show=true)}return s}; // while drawing, labels are always visible

// ---------- parametric edit: set one length/angle, keep every joint and every SHOWN value ----------
// Parent chain (via each line's start) is frozen: parents never move. The edited line and its children follow.
// Joints and horizontal/vertical lines are hard. Shown lengths/angles are kept (weight 100), hidden ones may flex (0.3),
// the edited line's other value is nearly free (0.1), and the edited line's start point stays put.
const parOf=s=>{const j=(s.joins||[]).filter(j=>j.end==='a').pop();return j?j.otherId:0}; // the line this line's START snapped to
function solve(A,b){const n=b.length;
 for(let i=0;i<n;i++){let p=i;for(let r=i+1;r<n;r++)if(Math.abs(A[r][i])>Math.abs(A[p][i]))p=r;[A[i],A[p]]=[A[p],A[i]];[b[i],b[p]]=[b[p],b[i]];
  for(let r=i+1;r<n;r++){const f=A[r][i]/A[i][i];if(f){for(let c=i;c<n;c++)A[r][c]-=f*A[i][c];b[r]-=f*b[i]}}}
 const x=new Array(n).fill(0);for(let i=n-1;i>=0;i--){let t=b[i];for(let c=i+1;c<n;c++)t-=A[i][c]*x[c];x[i]=t/A[i][i]}return x}
function editLine(id,ch,quiet){
 const set=new Set([id]);for(let g=1;g;){g=0;for(const s of shapes)if(s.type==='line')for(const j of s.joins||[])if(set.has(s.id)!==set.has(j.otherId)){set.add(s.id);set.add(j.otherId);g=1}}
 const Ls=shapes.filter(s=>s.type==='line'&&set.has(s.id)),ix=new Map(Ls.map((s,i)=>[s.id,i])),ie=ix.get(id),n=4*Ls.length,
  x=Float64Array.from(Ls.flatMap(s=>[s.x1,s.y1,s.x2,s.y2])),x0=x.slice(),H=1000,sp=[],add=(w,f)=>sp.push({w,f}),
  xi=(i,e)=>4*i+(e==='a'?0:2),len=(x,i)=>hyp(x[xi(i,'b')]-x[xi(i,'a')],x[xi(i,'b')+1]-x[xi(i,'a')+1]),
  dir=(x,i)=>Math.atan2(x[xi(i,'b')+1]-x[xi(i,'a')+1],x[xi(i,'b')]-x[xi(i,'a')]);
 const fz=new Set();for(let p=parOf(shapes.find(s=>s.id===id));p&&!fz.has(p);){fz.add(p);const q=shapes.find(s=>s.id===p);p=q?parOf(q):0}
 let tA=0;if(ch.ang!=null){const A=ang(x0[xi(ie,'b')]-x0[xi(ie,'a')],x0[xi(ie,'b')+1]-x0[xi(ie,'a')+1]);tA=A.ref+(A.sw<0?-1:1)*ch.ang*D}
 Ls.forEach((s,i)=>{
  for(const j of s.joins||[]){const k=ix.get(j.otherId);if(k==null||(ch.free&&i===ie&&j.end==='b'))continue;const o=Ls[k],a=j.end,p=a==='a'?[s.x1,s.y1]:[s.x2,s.y2],
   e=hyp(p[0]-o.x1,p[1]-o.y1)<.05?'a':hyp(p[0]-o.x2,p[1]-o.y2)<.05?'b':0;
   if(e){add(H,x=>x[xi(i,a)]-x[xi(k,e)]);add(H,x=>x[xi(i,a)+1]-x[xi(k,e)+1])} // coincident ends
   else{add(H,x=>{const A=xi(k,'a'),B=xi(k,'b'),dx=x[B]-x[A],dy=x[B+1]-x[A+1];return((x[xi(i,a)]-x[A])*dy-(x[xi(i,a)+1]-x[A+1])*dx)/(hyp(dx,dy)||1)}); // end on a line
    const dx0=o.x2-o.x1,dy0=o.y2-o.y1,Lp=hyp(dx0,dy0),t0=((p[0]-o.x1)*dx0+(p[1]-o.y1)*dy0)/(Lp*Lp); // and keep its place along that line
    add(5,x=>{const A=xi(k,'a'),B=xi(k,'b'),dx=x[B]-x[A],dy=x[B+1]-x[A+1];return(((x[xi(i,a)]-x[A])*dx+(x[xi(i,a)+1]-x[A+1])*dy)/((dx*dx+dy*dy)||1)-t0)*Lp})}}
  if(fz.has(s.id)){for(let q=0;q<4;q++)add(H,x=>x[4*i+q]-x0[4*i+q]);return} // a parent: stays exactly where it is
  const own=i===ie&&ch.ang!=null;
  if(Math.abs(s.y2-s.y1)<1e-6&&!own)add(H,x=>x[xi(i,'b')+1]-x[xi(i,'a')+1]);
  else if(Math.abs(s.x2-s.x1)<1e-6&&!own)add(H,x=>x[xi(i,'b')]-x[xi(i,'a')]);
  const L0=len(x0,i),t0=dir(x0,i),e=i===ie;
  add(e&&ch.len!=null?H:e?.1:s.sl!==false&&!ch.relax?100:.3,x=>len(x,i)-(e&&ch.len!=null?ch.len:L0));
  add(e&&ch.ang!=null?H:e?.1:s.sa!==false&&!ch.relax?100:.3,x=>L0*wrap(dir(x,i)-(e&&ch.ang!=null?tA:t0)))});
 add(H,x=>x[xi(ie,'a')]-x0[xi(ie,'a')]);add(H,x=>x[xi(ie,'a')+1]-x0[xi(ie,'a')+1]);
 for(let q=0;q<n;q++)add(.02,x=>x[q]-x0[q]);
 const m=sp.length,res=x=>sp.map(c=>c.w*c.f(x));let lam=1e-3,r=res(x),f=r.reduce((a,b)=>a+b*b,0);
 for(let it=0;it<40&&f>1e-18;it++){
  const J=[];for(let j=0;j<n;j++){const o=x[j];x[j]=o+1e-6;const r2=res(x);x[j]=o;J.push(r2.map((v,k)=>(v-r[k])/1e-6))}
  const A=Array.from({length:n},(_,a)=>Array.from({length:n},(_,b)=>{let t=0;for(let k=0;k<m;k++)t+=J[a][k]*J[b][k];return t+(a===b?lam:0)})),
   g=J.map(c=>-c.reduce((t,v,k)=>t+v*r[k],0)),d=solve(A,g),xn=x.map((v,i)=>v+d[i]),rn=res(xn),fn=rn.reduce((a,b)=>a+b*b,0);
  if(fn<f){const small=Math.max(...d.map(Math.abs))<1e-10;x.set(xn);r=rn;f=fn;lam=Math.max(lam/4,1e-10);if(small)break}else{lam*=5;if(lam>1e8)break}}
 if(sp.some(c=>c.w>=100&&Math.abs(c.f(x))>.05))return false; // a joint or a shown value would have to break
 if(!quiet)pushH();Ls.forEach((s,i)=>{s.x1=x[4*i];s.y1=x[4*i+1];s.x2=x[4*i+2];s.y2=x[4*i+3]});return true}

// ---------- rendering ----------
const FONT='600 13px system-ui,sans-serif';
// A tappable label. o[k]===false hides it: it becomes a faint ghost dot (drawn only while the UI is showing).
function lab(t,x,y,c,o,k,nx,ny,rot){ // rot: text runs along the line (length labels)
 ctx.font=FONT;ctx.textAlign='center';ctx.textBaseline='middle';const w=ctx.measureText(t).width;
 if(nx!=null){const d=rot==null?7+Math.abs(nx)*w/2+Math.abs(ny)*8:11;x+=nx*d;y+=ny*d}
 if(o[k]===false){if(ui){ctx.save();ctx.strokeStyle=c;ctx.globalAlpha=.5;ctx.lineWidth=1.5;ctx.setLineDash([2,2]);ctx.beginPath();ctx.arc(x,y,6,0,7);ctx.stroke();ctx.restore();hits.push({o,k,x,y,w:0})}return}
 ctx.save();ctx.translate(x,y);ctx.rotate(rot||0);ctx.lineJoin='round';ctx.lineWidth=4;ctx.strokeStyle='#fff';ctx.strokeText(t,0,0);ctx.fillStyle=c;ctx.fillText(t,0,0);ctx.restore();
 hits.push({o,k,x,y,w,r:rot||0})}
function labels(s){
 const ax=X(s.x1),ay=Y(s.y1),dx=X(s.x2)-ax,dy=Y(s.y2)-ay,L=hyp(dx,dy);if(L<3)return;
 // length: "top" side (up the screen; right for vertical lines) unless flipped; uses the line colour
 let nx=dy/L,ny=-dx/L;if(ny>1e-9||(Math.abs(ny)<1e-9&&nx<0)){nx=-nx;ny=-ny}
 if(S.side==='bottom'){nx=-nx;ny=-ny}
 let rot=Math.atan2(dy,dx);if(rot>Math.PI/2+1e-9)rot-=Math.PI;else if(rot<-Math.PI/2+1e-9)rot+=Math.PI; // keep the text upright
 lab(fmt(L/v.k,s),ax+dx/2,ay+dy/2,s.color,s,'sl',nx,ny,rot);
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
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,cw,ch);hits=[];panel();
 const w=PW(),h=PH(),pv=live(draw),all=pv?[...shapes,pv]:shapes;
 ctx.save();ctx.shadowColor='#0006';ctx.shadowBlur=14;ctx.fillStyle='#fff';ctx.fillRect(X(0),Y(0),w*v.k,h*v.k);ctx.restore();
 ctx.save();ctx.beginPath();ctx.rect(X(0),Y(0),w*v.k,h*v.k);ctx.clip();
 if(S.grid){const g=gstep();if(g*v.k>5){ctx.strokeStyle='#0000002e';ctx.lineWidth=1;ctx.beginPath();
  for(let i=0;i*g<=w;i++){ctx.moveTo(X(i*g),Y(0));ctx.lineTo(X(i*g),Y(h))}
  for(let i=0;i*g<=h;i++){ctx.moveTo(X(0),Y(i*g));ctx.lineTo(X(w),Y(i*g))}ctx.stroke()}}
 ctx.lineCap='round';ctx.lineJoin='miter';
 const pid=(o=>o?parOf(o):0)(shapes.find(o=>o.id===selId));
 for(const s of all){
  const hc=ui&&s.id&&s.type==='line'?(s.id===selId?'#e8590c55':s.id===pid?'#2563eb44':0):0;if(hc){ctx.save();ctx.strokeStyle=hc;ctx.lineWidth=Math.max(1,s.width*v.k)+10;ctx.beginPath();ctx.moveTo(X(s.x1),Y(s.y1));ctx.lineTo(X(s.x2),Y(s.y2));ctx.stroke();ctx.restore()}
  ctx.lineCap=s.d?'butt':'round';ctx.setLineDash(s.d?[(s.width*3+3)*v.k,(s.width*1.5+1.5)*v.k]:[]);
  ctx.strokeStyle=s.color;ctx.lineWidth=Math.max(1,s.width*v.k);ctx.beginPath();
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
 sc=null;if(ui){const t=(pages.length>1?'P'+(cur+1)+' · ':'')+S.ps+':'+S.pr+' ▾';ctx.font='600 12px system-ui,sans-serif';ctx.textAlign='left';ctx.textBaseline='middle';
  const w=ctx.measureText(t).width+16,x=X(0)+8,y=Y(0)+8;ctx.fillStyle='#1c2733d9';ctx.beginPath();ctx.roundRect(x,y,w,24,8);ctx.fill();ctx.fillStyle='#fff';ctx.fillText(t,x+8,y+12);sc={x,y,w,h:24}}
 const hh=handle();if(hh){const L=hh.L,a=Math.atan2(Y(L.y2)-Y(L.y1),X(L.x2)-X(L.x1));
  ctx.save();ctx.translate(hh.x,hh.y);ctx.rotate(a);ctx.fillStyle='#e8590c';ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,11,0,7);ctx.fill();ctx.stroke();
  ctx.fillStyle='#fff';ctx.beginPath();ctx.moveTo(-7,0);ctx.lineTo(-3,-4);ctx.lineTo(-3,4);ctx.closePath();ctx.moveTo(7,0);ctx.lineTo(3,-4);ctx.lineTo(3,4);ctx.closePath();ctx.fill();ctx.restore()}
 if(hd&&hd.ring){ctx.strokeStyle='#e8590c';ctx.lineWidth=2;ctx.beginPath();ctx.arc(X(hd.ring[0]),Y(hd.ring[1]),9,0,7);ctx.stroke()}
 if(draw&&draw.b.tr&&ui){ctx.save();ctx.strokeStyle='#e8590c';ctx.globalAlpha=.7;ctx.lineWidth=1;ctx.setLineDash([2,4]);ctx.beginPath();
  for(const t of draw.b.tr){ctx.moveTo(X(t.p[0]-t.d[0]*4e3),Y(t.p[1]-t.d[1]*4e3));ctx.lineTo(X(t.p[0]+t.d[0]*4e3),Y(t.p[1]+t.d[1]*4e3))}ctx.stroke();ctx.restore()}
 if(eraser){ctx.strokeStyle='#e8590c';ctx.lineWidth=2;ctx.beginPath();ctx.arc(eraser.x,eraser.y,12,0,7);ctx.stroke()}
 const cl=pv&&pv.type==='line'?pv:hd?shapes.find(o=>o.id===hd.id):null,ln=cl&&S.meas;chip.hidden=!ln;
 if(ln)chip.textContent=fmt(hyp(cl.x2-cl.x1,cl.y2-cl.y1),cl)+'   ∠ '+angTxt(cl.x2-cl.x1,cl.y2-cl.y1)}

// ---------- view ----------
function fit(){const t=ui?bar.offsetHeight:0,l=ui?panL.offsetWidth:0,r=ui?panR.offsetWidth:0,w=PW(),h=PH();
 fk=Math.min((cw-l-r-24)/w,(ch-t-24)/h);v.k=fk;v.ox=l+(cw-l-r-w*fk)/2;v.oy=t+(ch-t-h*fk)/2}
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
const handle=()=>{const L=ui&&shapes.find(o=>o.id===selId&&o.type==='line');return L?{x:X(L.x2),y:Y(L.y2),L}:null}; // end-of-line handle
function dragHandle(sx,sy){const L=shapes.find(o=>o.id===hd.id);if(!L)return;
 let n=((sx-v.ox)/v.k-L.x1)*hd.ux+((sy-v.oy)/v.k-L.y1)*hd.uy,snap=0; // distance along the line's own direction
 if(S.snapLn){const w=PW(),h=PH();let bd=12/v.k;
  for(const o of[...shapes.filter(q=>q.type==='line'&&q.id!==L.id),{x1:0,y1:0,x2:w,y2:0},{x1:w,y1:0,x2:w,y2:h},{x1:w,y1:h,x2:0,y2:h},{x1:0,y1:h,x2:0,y2:0}]){
   const sx2=o.x2-o.x1,sy2=o.y2-o.y1,den=hd.ux*sy2-hd.uy*sx2;if(Math.abs(den)<1e-9)continue;
   const ax=o.x1-L.x1,ay=o.y1-L.y1,t=(ax*sy2-ay*sx2)/den,u=(ax*hd.uy-ay*hd.ux)/den; // where the ray meets that line
   if(u>=-1e-9&&u<=1+1e-9&&t>.5&&Math.abs(t-n)<bd){bd=Math.abs(t-n);snap=t}}
  if(snap)n=snap}
 if(!snap&&(S.step==='len'||S.step==='both')){const ls=lstep(L);n=Math.round(n/ls)*ls}
 if(editLine(L.id,{len:Math.max(n,.5),ang:ang(L.x2-L.x1,L.y2-L.y1).val,free:1},1)){ // angle locked; its end joins are released while dragging
  hd.ring=snap?[L.x2,L.y2]:null;hap(snap?{ring:1,x:L.x2,y:L.y2}:{});render()}} // same solver: parents stay, children follow, other lines untouched; ignored if it would break something
function rejoin(L){const e=o=>o&&seg(L.x2,L.y2,o).d<.05; // after a drag: keep the snaps the end now has, drop the ones it left
 L.joins=(L.joins||[]).filter(j=>j.end!=='b'||e(shapes.find(q=>q.id===j.otherId)));
 for(const o of shapes)if(o.type==='line'&&o.id!==L.id&&seg(L.x2,L.y2,o).d<.02&&!L.joins.some(j=>j.end==='b'&&j.otherId===o.id))L.joins.push({end:'b',otherId:o.id,show:!S.autoHide})}

function tapAt(x,y){if(sc&&x>=sc.x&&x<=sc.x+sc.w&&y>=sc.y&&y<=sc.y+sc.h){closePops();$('#pScale').hidden=false;return} // top-left scale chip
 let b=null,bd=14;
 for(const h of hits){const c=Math.cos(h.r||0),n=Math.sin(h.r||0),px=x-h.x,py=y-h.y,d=hyp(Math.max(Math.abs(px*c+py*n)-h.w/2,0),-px*n+py*c);if(d<bd){bd=d;b=h}}
 if(b){pushH();b.o[b.k]=b.o[b.k]===false;return} // hide <-> show, kept until tapped again
 const mx=(x-v.ox)/v.k,my=(y-v.oy)/v.k;let q=null,qd=12/v.k;
 for(const o of shapes)if(o.type==='line'){const d=seg(mx,my,o).d;if(d<qd){qd=d;q=o}}
 selId=q?q.id:0;numEl=null;$$('.fld').forEach(f=>f.classList.remove('act'))}
cv.addEventListener('pointerdown',e=>{
 const now=performance.now(),t=e.pointerType==='touch';
 if(e.pointerType==='pen'){pen=1;penT=now}else if(t&&(pen||now-penT<300))return;
 if(e.pointerType==='mouse'&&e.button)return;
 closePops();cv.setPointerCapture(e.pointerId);
 const p={x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,t,role:'pan',multi:0};P.set(e.pointerId,p);
 const ts=[...P.values()].filter(q=>q.t);
 const hh=S.tool!=='erase'&&!(t&&ts.length>1)&&handle();
 if(hh&&hyp(e.clientX-hh.x,e.clientY-hh.y)<20){p.role='handle';pushH();const L=hh.L,dx=L.x2-L.x1,dy=L.y2-L.y1,n=hyp(dx,dy);hd={id:L.id,ux:dx/n,uy:dy/n,ring:null};lastKey='';render()}
 else if(t&&ts.length>1){draw=eraser=hd=null;ts.forEach(q=>{q.role='pan';q.multi=1})}
 else if(!t||S.finger){p.role='draw';lastKey='';
  if(S.tool==='erase'){erP=0;eraseAt(e.clientX,e.clientY)}
  else{const a=snapAt(e.clientX,e.clientY,null);draw={tool:S.tool,a,b:a};render()}}});
cv.addEventListener('pointermove',e=>{
 if(e.pointerType==='pen')penT=performance.now();
 const p=P.get(e.pointerId);if(!p)return;
 if(p.role==='handle'){dragHandle(e.clientX,e.clientY);return}
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
 if(p.role==='handle'){const hl=hd&&shapes.find(o=>o.id===hd.id);hd=null;if(hl)rejoin(hl);if(hist[hist.length-1]===JSON.stringify(shapes))hist.pop();save();render();return} // no change: drop the undo step
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
 $$('[data-d]').forEach(b=>b.classList.toggle('on',(b.dataset.d==='1')===!!S.dash));
 $('#cc').value=S.color;$('#pre').value=PRE.includes(S.ps+':'+S.pr)?S.ps+':'+S.pr:''}
COLS.forEach(c=>{const b=document.createElement('button');b.className='sw';b.dataset.c=c;b.style.background=c;$('#cols').insertBefore(b,$('#cc'))});
PRE.forEach(p=>$('#pre').add(new Option(p,p)));
Object.keys(MPU).forEach(u=>$('#unit').add(new Option(u,u)));
bar.onclick=e=>{const b=e.target.closest('button'),d=b&&b.dataset;if(!d)return;
 if(d.t)S.tool=d.t;if(d.c)S.color=d.c;if(d.w)S.width=+d.w;if(d.d!=null)S.dash=d.d==='1';sync();save()};
$('#cc').oninput=e=>{S.color=e.target.value;sync();save()};
$('#pre').onchange=e=>{if(!e.target.value)return;const[a,b]=e.target.value.split(':').map(Number);setScale(a,b);sync();save();render()};
$$('[data-k]').forEach(el=>el.onchange=()=>{const k=el.dataset.k;
 let x=el.type==='checkbox'?el.checked:el.dataset.n!=null?parseFloat(el.value):el.value;
 if(el.dataset.n!=null&&!(x>0))x=['gridStep','stepLen'].includes(k)?null:S[k];
 if(k==='ps'||k==='pr')setScale(k==='ps'?x:S.ps,k==='pr'?x:S.pr);else S[k]=x;
 sync();if(k==='orient')fit();save();render()});
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
// ---------- pages: each has its own shapes, undo history, scale, unit and orientation ----------
function setScale(a,b){if(a>0&&b>0){S.ps=a;S.pr=b}} // drawn lines keep their own scale; this one is for lines drawn from now on
function stash(){const p=pages[cur];p.shapes=shapes;p.hist=hist;p.redo=redo;PG.forEach(k=>p[k]=S[k]);p.v={k:v.k,ox:v.ox,oy:v.oy}}
function load(n){cur=n;const p=pages[n];shapes=p.shapes;hist=p.hist;redo=p.redo;PG.forEach(k=>S[k]=p[k]);selId=0;numEl=null;hd=draw=null;sync();fit();if(p.v)Object.assign(v,p.v);save();render()} // restore this page's own zoom/position
const goto=n=>{if(n<0||n>=pages.length||n===cur)return;stash();load(n)};
$('#pSet').addEventListener('click',e=>{if(e.target.closest('[data-x]'))closePops()});
$('#bPrev').onclick=()=>goto(cur-1);$('#bNext').onclick=()=>goto(cur+1);
$('#bAdd').onclick=()=>{stash();pages.splice(cur+1,0,{shapes:[],hist:[],redo:[],ps:S.ps,pr:S.pr,unit:S.unit,orient:S.orient,v:{k:v.k,ox:v.ox,oy:v.oy}});load(cur+1);toast('Page '+(cur+1)+' added. Tap the corner chip to set its scale.')};
$('#bDelPg').onclick=()=>{if(pages.length<2)return toast('This is the only page');if(!confirm('Delete page '+(cur+1)+'?'))return;pages.splice(cur,1);load(Math.min(cur,pages.length-1))};
// ---------- side panels: edit the selected line's length / angle with the on-screen keypad (no system keyboard) ----------
function panel(){const L=shapes.find(o=>o.id===selId&&o.type==='line');
 $('#pgN').textContent=(cur+1)+'/'+pages.length;
 $('#pTitle').textContent=L?'Selected line':'Tap a line to edit';
 $('#pInfo').textContent=L?'Parent: '+(parOf(L)?'yes, fixed':'none')+' · Children: '+shapes.filter(o=>o.type==='line'&&parOf(o)===L.id).length:'';$('#uLen').textContent=S.unit;
 if(numEl!==fLen)fLen.value=L?fmt(hyp(L.x2-L.x1,L.y2-L.y1),L):'';
 if(numEl!==fAng)fAng.value=L?ang(L.x2-L.x1,L.y2-L.y1).val.toFixed(1):''}
function setNum(el){numEl=el;fresh=1;$$('.fld').forEach(f=>f.classList.toggle('act',f===el))}
document.addEventListener('click',e=>{const t=e.target.closest('[data-n],.fld');if(t)setNum(t)});
document.addEventListener('focusin',e=>{if(e.target.matches('[data-n],.fld'))setNum(e.target)});
function applyField(f){const L=shapes.find(o=>o.id===selId&&o.type==='line');if(!L)return toast('Tap a line first');
 const n=parseFloat(f==='len'?fLen.value:fAng.value);if(!(n>0)&&!(f==='ang'&&n===0))return toast('Type a value first');
 const c=f==='len'?{len:n*MPU[S.unit]/(L.ps?L.pr/L.ps:RR())}:{ang:Math.min(90,n)};let ok=editLine(L.id,c),rel=0; // keeps every snap; related lines flex too if they must
 if(!ok){ok=editLine(L.id,{...c,relax:1});rel=ok}
 toast(ok?(rel?'Updated. The snapped lines changed too, to keep the snaps.':'Updated'):'Cannot change: its parents stay fixed and the snaps cannot be kept.');save();render()}
function key(c){if(!numEl)return;
 if(c==='ok'){if(numEl.dataset.f)applyField(numEl.dataset.f);else numEl.dispatchEvent(new Event('change'));fresh=1;return}
 let t=fresh&&c!=='del'?'':numEl.value;fresh=0;
 if(c==='del')t=t.slice(0,-1);else if(c==='.'){if(!t.includes('.'))t+=t?'.':'0.'}else t+=c;
 numEl.value=t}
panR.addEventListener('click',e=>{const b=e.target.closest('button');if(b)key(b.dataset.key)});
// physical keyboard: digits . Backspace Enter go to the active field; the on-screen keyboard never opens (inputmode=none)
addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey)return;
 const k=e.key,c=/^[0-9]$/.test(k)?k:k==='.'||k===','?'.':k==='Backspace'?'del':k==='Enter'?'ok':null;if(!c)return;
 if(!numEl&&shapes.some(o=>o.id===selId&&o.type==='line'))setNum(fLen);
 if(numEl){e.preventDefault();key(c)}});
sync();
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js');
