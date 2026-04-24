import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

const DOC_ID = "shared";

const MS_DAY = 864e5;
const RAIL_DEFAULT = 240;
const RAIL_MIN = 180;
const RAIL_MAX = 520;
const HEAD = 48;
const RULER_H = 60;
const AXIS_H = 6;
const BAR_H = 30;
const ROW_H = 44;
const ROW_PAD = 10;
const PROJ_HEAD = 34;
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const ORIGIN = new Date(2024, 0, 1).getTime();
const uid = () => Math.random().toString(36).slice(2, 9);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const todayTs = () => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); };
const snap = ts => { const d = new Date(ts + MS_DAY/2); d.setHours(0,0,0,0); return d.getTime(); };

const IO = "#FF4F00";
const IO_LIGHT = "#FFF0E8";

function isLight(h){if(!h||h.length<7)return true;const r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16);return(r*.299+g*.587+b*.114)>150;}
function hexRgba(h,a){if(!h||h.length<7)return`rgba(0,0,0,${a})`;return`rgba(${parseInt(h.slice(1,3),16)},${parseInt(h.slice(3,5),16)},${parseInt(h.slice(5,7),16)},${a})`;}

const STYLE_KEYS=["default","active","tentative","hold","soft","filled","muted","custom"];
function getVis(si,tc,phc,projColor){
  /* custom/rainbow: phase-level color override */
  if(si===7){const cc=phc||tc||"#1A1A1A";const on=isLight(cc)?"#1A1A1A":"#fff";return{border:`1.5px solid ${cc}`,bg:cc,color:on,numColor:isLight(cc)?"rgba(0,0,0,0.4)":"rgba(255,255,255,0.5)",fw:600};}
  const fallback=tc||projColor||"#1A1A1A"; /* fall back to project color if no track color */
  const c=fallback;
  const onC=isLight(c)?"#1A1A1A":"#fff";
  const onCsub=isLight(c)?"rgba(0,0,0,0.5)":"rgba(255,255,255,0.6)";
  switch(si){
    case 0:return{border:`1.5px solid ${fallback}`,bg:"#fff",color:fallback,numColor:fallback,fw:500};
    case 1:return{border:`1.5px solid ${c}`,bg:c,color:onC,numColor:onCsub,fw:600};
    case 2:return{border:`1.5px dashed ${fallback}`,bg:"#fff",color:fallback,numColor:fallback,fw:400};
    case 3:return{border:`1.5px dashed ${c}`,bg:"#fff",color:c,numColor:c,fw:500,bgi:`repeating-linear-gradient(-45deg,transparent,transparent 4px,${hexRgba(c,.1)} 4px,${hexRgba(c,.1)} 5px)`};
    case 4:return{border:`1.5px dotted ${fallback}`,bg:"#fff",color:fallback,numColor:fallback,fw:400,fs:"italic"};
    case 5:return{border:"none",bg:c,color:onC,numColor:onCsub,fw:600};
    case 6:return{border:"none",bg:hexRgba(c,.25),color:c,numColor:hexRgba(c,.5),fw:500};
    default:return getVis(0,tc,phc,projColor);
  }
}

function stackRows(ph){const s=[...ph].sort((a,b)=>a.start-b.start||(a.end-a.start)-(b.end-b.start));const ends=[],map=new Map();s.forEach(p=>{let r=0;while(r<ends.length&&ends[r]>p.start)r++;ends[r]=p.end;map.set(p.id,r);});return{rowFor:map,count:Math.max(1,ends.length)};}
function stackMs(ms,toX,widthFor){const s=[...ms].sort((a,b)=>a.date-b.date);const ends=[],map=new Map();s.forEach(m=>{const x=toX(m.date);const w=widthFor?widthFor(m):90;let r=0;while(r<ends.length&&ends[r]>=x-4)r++;ends[r]=x+w+8;map.set(m.id,r);});return{rowFor:map,count:Math.max(1,ends.length)};}

const SEED={milestones:[
  {id:uid(),name:"CL cutoff",date:new Date(2026,3,24).getTime()},
  {id:uid(),name:"Dossier lock",date:new Date(2026,3,25).getTime()},
  {id:uid(),name:"Sample deadline",date:new Date(2026,4,2).getTime()},
],imageNotes:[],linkNotes:[],projects:[{id:"yoshi",name:"Yoshi",color:"#E8562A",tracks:[
  {id:"t1",name:"Build",color:"#002FA7",phases:[
    {id:uid(),name:"Plan & Dossier",start:new Date(2026,3,17).getTime(),end:new Date(2026,3,22).getTime(),style:1},
    {id:uid(),name:"Sample & Order",start:new Date(2026,3,22).getTime(),end:new Date(2026,3,29).getTime(),style:0},
    {id:uid(),name:"Body Prep",start:new Date(2026,3,29).getTime(),end:new Date(2026,4,5).getTime(),style:0},
    {id:uid(),name:"Soundproofing",start:new Date(2026,4,5).getTime(),end:new Date(2026,4,12).getTime(),style:5},
    {id:uid(),name:"Cabinet Build",start:new Date(2026,4,12).getTime(),end:new Date(2026,4,26).getTime(),style:0},
    {id:uid(),name:"Finish",start:new Date(2026,4,26).getTime(),end:new Date(2026,4,31).getTime(),style:2},
  ]},
  {id:"t2",name:"Procurement",phases:[
    {id:uid(),name:"Waiting · vendor",start:new Date(2026,3,17).getTime(),end:new Date(2026,3,24).getTime(),style:3},
    {id:uid(),name:"Decide path",start:new Date(2026,3,22).getTime(),end:new Date(2026,3,27).getTime(),style:2},
    {id:uid(),name:"Order · receive",start:new Date(2026,3,26).getTime(),end:new Date(2026,4,3).getTime(),style:0},
  ]},
]}]};

function Edit({value,onDone,style:s}){
  const r=useRef(null);const[v,setV]=useState(value);
  useEffect(()=>{r.current?.focus();r.current?.select();},[]);
  const c=()=>onDone(v.trim()||value);
  return <input ref={r} value={v} onChange={e=>setV(e.target.value)} onBlur={c}
    onKeyDown={e=>{if(e.key==="Enter")c();if(e.key==="Escape")onDone(value);}}
    onClick={e=>e.stopPropagation()} onPointerDown={e=>e.stopPropagation()}
    style={{border:"none",outline:"none",background:"transparent",font:"inherit",color:"inherit",padding:0,margin:0,width:"100%",minWidth:40,...s}}/>;
}

function ItemPopover({type,name,color,onRename,onColor,onClearColor,onDelete,onClose,canDelete}){
  const[nm,setNm]=useState(name);const[hex,setHex]=useState(color||"");const[del,setDel]=useState(0);const ref=useRef(null);
  useEffect(()=>setHex(color||""),[color]);useEffect(()=>{ref.current?.focus();ref.current?.select();},[]);
  const commit=()=>{const v=nm.trim();if(v&&v!==name)onRename(v);};
  const done=()=>{commit();onClose();};
  return(
    <div onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}
      style={{position:"absolute",left:"100%",top:-4,marginLeft:8,zIndex:200,
        background:"#fff",border:"1px solid #E8E6E1",borderRadius:8,padding:"14px 16px",
        boxShadow:"0 8px 28px rgba(0,0,0,0.1)",minWidth:190,display:"flex",flexDirection:"column",gap:10}}>
      <input ref={ref} value={nm} onChange={e=>setNm(e.target.value)}
        onKeyDown={e=>{if(e.key==="Enter"){done();}if(e.key==="Escape")onClose();}}
        style={{fontFamily:"'Geist',sans-serif",fontSize:13,fontWeight:600,border:"1px solid #E8E6E1",borderRadius:4,
          padding:"7px 10px",color:"#1A1A1A",background:"#fff",outline:"none",width:"100%",boxSizing:"border-box"}}/>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <input type="color" value={color||"#888888"} onChange={e=>{onColor(e.target.value);setHex(e.target.value);}}
          style={{width:28,height:28,border:"none",padding:0,cursor:"pointer",borderRadius:4,background:"none"}}/>
        <input type="text" value={hex} placeholder="#hex"
          onChange={e=>{const v=e.target.value;setHex(v);if(/^#([0-9a-fA-F]{3}){1,2}$/.test(v))onColor(v);}}
          style={{flex:1,fontFamily:"'Geist Mono',monospace",fontSize:11,border:"1px solid #E8E6E1",borderRadius:4,padding:"6px 8px",color:"#1A1A1A",background:"#fff",outline:"none"}}/>
      </div>
      {color&&<div onClick={()=>{onClearColor();setHex("");}} style={{fontFamily:"'Geist Mono',monospace",fontSize:10,color:"#8A8780",cursor:"pointer",fontWeight:500}}>Clear color</div>}
      {canDelete&&<div style={{borderTop:"1px solid #F0EDEA",paddingTop:8}}>
        {del===0?<div onClick={()=>setDel(1)} style={{fontFamily:"'Geist Mono',monospace",fontSize:10,color:"#C5C2BC",cursor:"pointer",fontWeight:500}} onMouseEnter={e=>e.currentTarget.style.color=IO} onMouseLeave={e=>e.currentTarget.style.color="#C5C2BC"}>Delete {type}</div>
        :<div onClick={()=>{onDelete();onClose();}} style={{fontFamily:"'Geist Mono',monospace",fontSize:10,color:IO,cursor:"pointer",fontWeight:600}}>Click again to confirm</div>}
      </div>}
      <div style={{borderTop:"1px solid #F0EDEA",paddingTop:8,display:"flex",justifyContent:"flex-end",gap:12}}>
        <span onClick={onClose} style={{fontFamily:"'Geist Mono',monospace",fontSize:10,color:"#8A8780",cursor:"pointer",fontWeight:500,letterSpacing:"0.06em",textTransform:"uppercase"}}>Cancel</span>
        <span onClick={done} style={{fontFamily:"'Geist Mono',monospace",fontSize:10,color:"#1A1A1A",cursor:"pointer",fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase"}}>Done</span>
      </div>
    </div>
  );
}

export default function App(){
  const[data,setData]=useState(SEED);
  const[loaded,setLoaded]=useState(false);
  const[sx,setSx]=useState(0);
  const[ppd,setPpd]=useState(16);
  const[rail,setRail]=useState(()=>{try{const v=parseInt(localStorage.getItem("tl.rail")||"",10);if(!isNaN(v))return clamp(v,RAIL_MIN,RAIL_MAX);}catch(e){}return RAIL_DEFAULT;});
  useEffect(()=>{try{localStorage.setItem("tl.rail",String(rail));}catch(e){}if(cRef.current)vw.current=cRef.current.offsetWidth-rail;},[rail]);
  const railDrag=useRef(null);
  const[sel,setSel]=useState(null);
  const[ed,setEd]=useState(null);
  const[popup,setPopup]=useState(null);
  const[pv,setPv]=useState(null);
  const[hover,setHover]=useState(null);
  const[hoverPos,setHoverPos]=useState({x:0,y:0});
  const[clock,setClock]=useState("");
  const[saveStatus,setSaveStatus]=useState("");
  const[showMenu,setShowMenu]=useState(false);
  const[msDel,setMsDel]=useState(0);
  const[imgMode,setImgMode]=useState(false);
  const fileInputRef=useRef(null);
  const imgDrag=useRef(null);
  const[imgSel,setImgSel]=useState(null);
  const linkDrag=useRef(null);
  const[linkSel,setLinkSel]=useState(null);
  const cRef=useRef(null);const dr=useRef(null);const vw=useRef(1200);const saveTimer=useRef(null);
  const msDrag=useRef(null);
  const sideRef=useRef(null);const laneRef=useRef(null);const scrollLock=useRef(false);
  const skipNextSave=useRef(false);
  useEffect(()=>{setMsDel(0);},[sel?.id]);

  /* ─── Undo/Redo ─── */
  const history=useRef([]);const future=useRef([]);const MAX_HIST=50;
  const mut=useCallback(fn=>{
    setData(prev=>{
      history.current.push(JSON.stringify(prev));
      if(history.current.length>MAX_HIST)history.current.shift();
      future.current=[];
      const n=JSON.parse(JSON.stringify(prev));fn(n);return n;
    });
  },[]);
  const undo=useCallback(()=>{
    if(!history.current.length)return;
    setData(prev=>{future.current.push(JSON.stringify(prev));return JSON.parse(history.current.pop());});
    setSel(null);setEd(null);setPopup(null);
  },[]);
  const redo=useCallback(()=>{
    if(!future.current.length)return;
    setData(prev=>{history.current.push(JSON.stringify(prev));return JSON.parse(future.current.pop());});
    setSel(null);setEd(null);setPopup(null);
  },[]);

  /* ─── Storage ─── */
  /* ─── Cloud Storage + Realtime sync (shared across browsers) ─── */
  useEffect(()=>{
    let mounted=true;
    (async()=>{
      try{
        const{data:row}=await supabase.from("timeline_docs").select("data").eq("id",DOC_ID).maybeSingle();
        if(mounted&&row?.data&&row.data.projects){skipNextSave.current=true;setData(row.data);}
        else if(mounted){
          // seed the empty shared doc with the demo data so first visitor sees something
          await supabase.from("timeline_docs").upsert({id:DOC_ID,data:SEED});
          skipNextSave.current=true;setData(SEED);
        }
      }catch(e){}
      if(mounted)setLoaded(true);
    })();
    const ch=supabase.channel("timeline_docs:"+DOC_ID)
      .on("postgres_changes",{event:"*",schema:"public",table:"timeline_docs",filter:`id=eq.${DOC_ID}`},
        payload=>{
          const next=payload.new?.data;
          if(next&&next.projects){
            // Don't apply remote updates while user is mid-drag — would reset drag origin refs.
            if(dr.current)return;
            const incoming=JSON.stringify(next);
            setData(prev=>{
              if(JSON.stringify(prev)===incoming)return prev;
              skipNextSave.current=true;
              return next;
            });
          }
        })
      .subscribe();
    return()=>{mounted=false;supabase.removeChannel(ch);};
  },[]);
  useEffect(()=>{
    if(!loaded)return;
    if(skipNextSave.current){skipNextSave.current=false;return;}
    setSaveStatus("saving");
    if(saveTimer.current)clearTimeout(saveTimer.current);
    saveTimer.current=setTimeout(()=>{(async()=>{
      try{
        const{error}=await supabase.from("timeline_docs").upsert({id:DOC_ID,data,updated_at:new Date().toISOString()});
        if(error)throw error;
        setSaveStatus("saved");setTimeout(()=>setSaveStatus(""),2000);
      }catch(e){setSaveStatus("");}
    })();},400);
    return()=>{if(saveTimer.current)clearTimeout(saveTimer.current);};
  },[data,loaded]);

  const syncScroll=useCallback(src=>{if(scrollLock.current)return;scrollLock.current=true;const f=src==="s"?sideRef.current:laneRef.current;const t=src==="s"?laneRef.current:sideRef.current;if(f&&t)t.scrollTop=f.scrollTop;requestAnimationFrame(()=>{scrollLock.current=false;});},[]);

  useEffect(()=>{if(!document.getElementById("tf")){const l=document.createElement("link");l.id="tf";l.rel="stylesheet";l.href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&display=swap";document.head.appendChild(l);}},[]);
  useEffect(()=>{const tick=()=>{const n=new Date();setClock(`${MONTHS[n.getMonth()]} ${n.getDate()}, ${n.getFullYear()}  ${String(n.getHours()).padStart(2,"0")}:${String(n.getMinutes()).padStart(2,"0")}`);};tick();const iv=setInterval(tick,30000);return()=>clearInterval(iv);},[]);
  useEffect(()=>{const m=()=>{if(cRef.current)vw.current=cRef.current.offsetWidth-rail;};m();window.addEventListener("resize",m);return()=>window.removeEventListener("resize",m);},[rail]);
  useEffect(()=>{if(cRef.current){const w=cRef.current.offsetWidth-rail;setSx(((todayTs()-ORIGIN)/MS_DAY)*ppd-w/3);}},[]);

  const toX=useCallback(ts=>((ts-ORIGIN)/MS_DAY)*ppd-sx,[sx,ppd]);
  const toDate=useCallback(x=>((x+sx)/ppd)*MS_DAY+ORIGIN,[sx,ppd]);

  /* Non-passive wheel: must use addEventListener to call preventDefault and block browser back/forward swipe */
  useEffect(()=>{
    const el=cRef.current;if(!el)return;
    const handler=e=>{
      if(e.metaKey||e.ctrlKey){
        e.preventDefault();
        const r=el.getBoundingClientRect();const mx=e.clientX-r.left-rail;const db=toDate(mx);
        const f=e.deltaY>0?.92:1.08;const np=clamp(ppd*f,1.5,60);
        setSx(((db-ORIGIN)/MS_DAY)*np-mx);setPpd(np);return;
      }
      /* always preventDefault so horizontal trackpad swipes don't trigger browser back/forward */
      e.preventDefault();
      setSx(p=>p+e.deltaX+e.deltaY*.5);
    };
    el.addEventListener("wheel",handler,{passive:false});
    return()=>el.removeEventListener("wheel",handler);
  },[ppd,toDate,rail]);

  const gid=el=>({id:el.dataset.id,pid:el.dataset.pid,tid:el.dataset.tid});
  const moveMilestoneToClientX=useCallback((clientX,id)=>{
    const rect=cRef.current?.getBoundingClientRect();
    if(!rect)return;
    const nextDate=snap(toDate(clientX-rect.left-rail));
    mut(d=>{const ms=d.milestones.find(m=>m.id===id);if(ms)ms.date=nextDate;});
  },[toDate,mut,rail]);

  const stopMilestoneDrag=useCallback(()=>{
    msDrag.current=null;
  },[]);

  const startMilestoneDrag=useCallback((e,id,sc="g")=>{
    if(e.button!==0)return;
    e.preventDefault();
    e.stopPropagation();
    const next={type:"ms",id,sc};
    setSel(next);
    msDrag.current={id};
  },[]);

  const onDown=useCallback(e=>{
    if(e.button!==0)return;const r=cRef.current.getBoundingClientRect();const x=e.clientX-r.left-rail;
    if(x<0)return;
    const t=e.target.closest("[data-r]");const ro=t?.dataset.r;
    if(ro==="phl"||ro==="phr"){dr.current={type:ro==="phl"?"rl":"rr",...gid(t),x0:e.clientX};return e.stopPropagation();}
    if(ro==="ph"){setSel({type:"ph",...gid(t)});dr.current={type:"mph",...gid(t),x0:e.clientX};return e.stopPropagation();}
    if(ro==="ms"){e.stopPropagation();return;}
    if(ro==="tbg"){const s=snap(toDate(x));dr.current={type:"cr",pid:t.dataset.pid,tid:t.dataset.tid,s,c:s,x0:e.clientX};setSel(null);return e.stopPropagation();}
    if(ro==="mbg"){const dt=snap(toDate(x));const id=uid();mut(d=>d.milestones.push({id,name:"Milestone",date:dt}));setEd({type:"ms",id});setSel({type:"ms",id,sc:"g"});return;}
    dr.current={type:"pan",x0:e.clientX,sx0:sx};setSel(null);setPopup(null);setShowMenu(false);setImgSel(null);setLinkSel(null);
  },[sx,ppd,toDate,mut,rail]);

  const onMove=useCallback(e=>{const d=dr.current;if(!d)return;const dx=e.clientX-d.x0;
    if(d.type==="pan")return setSx(d.sx0-dx);
    if(d.type==="cr"){const r=cRef.current.getBoundingClientRect();d.c=snap(toDate(e.clientX-r.left-rail));setPv({pid:d.pid,tid:d.tid,s:Math.min(d.s,d.c),e:Math.max(d.s,d.c)});return;}
    if(d.type==="mph"){const dd=Math.round(dx/ppd);mut(D=>{const tr=D.projects.find(p=>p.id===d.pid)?.tracks.find(t=>t.id===d.tid);const ph=tr?.phases.find(p=>p.id===d.id);if(!ph)return;if(!d.os){d.os=ph.start;d.oe=ph.end;}ph.start=d.os+dd*MS_DAY;ph.end=d.oe+dd*MS_DAY;});return;}
    if(d.type==="rl"||d.type==="rr"){const dd=Math.round(dx/ppd);mut(D=>{const tr=D.projects.find(p=>p.id===d.pid)?.tracks.find(t=>t.id===d.tid);const ph=tr?.phases.find(p=>p.id===d.id);if(!ph)return;if(!d.os){d.os=ph.start;d.oe=ph.end;}if(d.type==="rl")ph.start=Math.min(d.os+dd*MS_DAY,d.oe-MS_DAY);else ph.end=Math.max(d.oe+dd*MS_DAY,d.os+MS_DAY);});return;}
  },[ppd,toDate,mut,rail]);

  const onUp=useCallback(()=>{const d=dr.current;
    if(d?.type==="cr"){const s=Math.min(d.s,d.c),en=Math.max(d.s,d.c);if(en-s>=MS_DAY*.5){const id=uid();mut(D=>{const tr=D.projects.find(p=>p.id===d.pid)?.tracks.find(t=>t.id===d.tid);if(tr)tr.phases.push({id,name:"",start:s,end:Math.max(en,s+MS_DAY),style:0});});setEd({type:"ph",id,pid:d.pid,tid:d.tid});setSel({type:"ph",id,pid:d.pid,tid:d.tid});}}
    dr.current=null;setPv(null);
    stopMilestoneDrag();
  },[mut,stopMilestoneDrag]);

  useEffect(()=>{
    window.addEventListener("pointermove",onMove);
    window.addEventListener("pointerup",onUp);
    window.addEventListener("mousemove",onMove);
    window.addEventListener("mouseup",onUp);
    return()=>{
      window.removeEventListener("pointermove",onMove);
      window.removeEventListener("pointerup",onUp);
      window.removeEventListener("mousemove",onMove);
      window.removeEventListener("mouseup",onUp);
    };
  },[onMove,onUp]);

  useEffect(()=>{
    const handlePointerMove=e=>{if(msDrag.current)moveMilestoneToClientX(e.clientX,msDrag.current.id);};
    const handlePointerUp=()=>stopMilestoneDrag();
    const handleMouseMove=e=>{if(msDrag.current)moveMilestoneToClientX(e.clientX,msDrag.current.id);};
    const handleMouseUp=()=>stopMilestoneDrag();
    window.addEventListener("pointermove",handlePointerMove);
    window.addEventListener("pointerup",handlePointerUp);
    window.addEventListener("mousemove",handleMouseMove);
    window.addEventListener("mouseup",handleMouseUp);
    return()=>{
      window.removeEventListener("pointermove",handlePointerMove);
      window.removeEventListener("pointerup",handlePointerUp);
      window.removeEventListener("mousemove",handleMouseMove);
      window.removeEventListener("mouseup",handleMouseUp);
    };
  },[moveMilestoneToClientX,stopMilestoneDrag]);

  /* Image-note drag */
  useEffect(()=>{
    const move=e=>{
      const d=imgDrag.current;if(!d)return;
      const rect=cRef.current?.getBoundingClientRect();
      const lrect=laneRef.current?.getBoundingClientRect();
      if(!rect||!lrect)return;
      const xPx=e.clientX-rect.left-rail-d.offX;
      const yPx=e.clientY-lrect.top-d.offY+(laneRef.current?.scrollTop||0);
      const newDate=toDate(xPx);
      mut(D=>{const n=(D.imageNotes||[]).find(x=>x.id===d.id);if(n){n.date=newDate;n.y=Math.max(20,yPx);}});
    };
    const up=()=>{imgDrag.current=null;};
    window.addEventListener("pointermove",move);
    window.addEventListener("pointerup",up);
    return()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",up);};
  },[toDate,mut,rail]);

  const onImagePicked=useCallback((file)=>{
    if(!file)return;
    const reader=new FileReader();
    reader.onload=()=>{
      const dataUrl=reader.result;
      const img=new Image();
      img.onload=()=>{
        const max=75;const r=Math.min(max/img.width,max/img.height,1);
        const w=Math.round(img.width*r),h=Math.round(img.height*r);
        // place near current view center
        const wpx=(cRef.current?.offsetWidth||1200)-rail;
        const date=toDate(wpx/2);
        const id=uid();
        mut(D=>{D.imageNotes=D.imageNotes||[];D.imageNotes.push({id,src:dataUrl,date,y:120,w,h});});
        setImgSel(id);
      };
      img.src=dataUrl;
    };
    reader.readAsDataURL(file);
  },[mut,rail,toDate]);

  /* Link-note drag */
  useEffect(()=>{
    const move=e=>{
      const d=linkDrag.current;if(!d)return;
      const rect=cRef.current?.getBoundingClientRect();
      const lrect=laneRef.current?.getBoundingClientRect();
      if(!rect||!lrect)return;
      const xPx=e.clientX-rect.left-rail-d.offX;
      const yPx=e.clientY-lrect.top-d.offY+(laneRef.current?.scrollTop||0);
      mut(D=>{const n=(D.linkNotes||[]).find(x=>x.id===d.id);if(n){n.date=toDate(xPx);n.y=Math.max(20,yPx);}});
    };
    const up=()=>{linkDrag.current=null;};
    window.addEventListener("pointermove",move);
    window.addEventListener("pointerup",up);
    return()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",up);};
  },[toDate,mut,rail]);

  const onAddLink=useCallback(()=>{
    const raw=prompt("Paste a URL:");
    if(!raw)return;
    let url=raw.trim();if(!url)return;
    if(!/^https?:\/\//i.test(url))url="https://"+url;
    let label="Link";try{label=new URL(url).hostname.replace(/^www\./,"");}catch(e){}
    const wpx=(cRef.current?.offsetWidth||1200)-rail;
    const date=toDate(wpx/2);
    const id=uid();
    mut(D=>{D.linkNotes=D.linkNotes||[];D.linkNotes.push({id,url,label,date,y:80});});
    setLinkSel(id);
  },[mut,rail,toDate]);

  useEffect(()=>{const fn=e=>{
    if(e.key==="z"&&(e.metaKey||e.ctrlKey)&&!e.shiftKey){e.preventDefault();undo();return;}
    if((e.key==="z"&&(e.metaKey||e.ctrlKey)&&e.shiftKey)||(e.key==="y"&&(e.metaKey||e.ctrlKey))){e.preventDefault();redo();return;}
    if((e.key==="Backspace"||e.key==="Delete")&&!ed&&!popup&&sel){
      if(sel.type==="ph")mut(d=>{const tr=d.projects.find(p=>p.id===sel.pid)?.tracks.find(t=>t.id===sel.tid);if(tr)tr.phases=tr.phases.filter(p=>p.id!==sel.id);});
      else if(sel.type==="ms"&&sel.sc==="g")mut(d=>{d.milestones=d.milestones.filter(m=>m.id!==sel.id);});
      setSel(null);}
    if(e.key==="Escape"){setSel(null);setEd(null);setPopup(null);setShowMenu(false);setImgSel(null);setLinkSel(null);}
    if((e.key==="Backspace"||e.key==="Delete")&&!ed&&!popup&&imgSel){
      mut(d=>{d.imageNotes=(d.imageNotes||[]).filter(x=>x.id!==imgSel);});setImgSel(null);
    }
    if((e.key==="Backspace"||e.key==="Delete")&&!ed&&!popup&&linkSel){
      mut(d=>{d.linkNotes=(d.linkNotes||[]).filter(x=>x.id!==linkSel);});setLinkSel(null);
    }
  };window.addEventListener("keydown",fn);return()=>window.removeEventListener("keydown",fn);},[sel,ed,popup,mut,undo,redo,imgSel,linkSel]);

  const ticks=useMemo(()=>{const w=vw.current||1200;const s=toDate(0),e=toDate(w);const out=[];
    let d=new Date(new Date(s).getFullYear(),new Date(s).getMonth(),1);
    while(d.getTime()<=e+MS_DAY*35){
      const prev=new Date(d.getFullYear(),d.getMonth()-1,1);
      out.push({t:"mo",ts:d.getTime(),l:MONTHS[d.getMonth()],yr:d.getFullYear(),prev:MONTHS[prev.getMonth()]});
      d=new Date(d.getFullYear(),d.getMonth()+1,1);
    }
    if(ppd>3.5){const iv=ppd>18?1:ppd>9?7:14;let day=new Date(new Date(s).getFullYear(),new Date(s).getMonth(),new Date(s).getDate());
      while(day.getTime()<=e+MS_DAY*2){const dn=day.getDate();const f=dn===1;const wk=dn===8||dn===15||dn===22||dn===29;if(iv===1||f||(iv<=7&&wk))out.push({t:"d",ts:day.getTime(),l:dn,f,wk});day=new Date(day.getTime()+MS_DAY);}}
    if(ppd>3.5){let day=new Date(new Date(s).getFullYear(),new Date(s).getMonth(),new Date(s).getDate());
      while(day.getTime()<=e+MS_DAY*2){if(day.getDay()===0)out.push({t:"sun",ts:day.getTime()});day=new Date(day.getTime()+MS_DAY);}}
    return out;},[sx,ppd,toDate]);

  const layout=useMemo(()=>data.projects.map(proj=>{
    const stacks=proj.tracks.map(tr=>stackRows(tr.phases));
    const trackRows=stacks.reduce((s,st)=>s+st.count,0);
    const height=PROJ_HEAD+Math.max(1,trackRows)*ROW_H+ROW_PAD;
    let off=0;const trackLayout=proj.tracks.map((track,ti)=>{const st=stacks[ti];const top=PROJ_HEAD+off*ROW_H;off+=st.count;return{track,st,top,height:st.count*ROW_H};});
    return{proj,stacks,height,trackLayout};
  }),[data]);

  const msWidth=useCallback(m=>{const name=m.name||"";return 17+(String(new Date(m.date).getDate()).length)*7+11+name.length*7+12;},[]);
  const msS=useMemo(()=>stackMs(data.milestones,toX,msWidth),[data.milestones,toX,msWidth]);
  const msH=msS.count*32+20;
  const todayX=toX(todayTs());
  const BG="#fff";const SIDE_BG="#F8F7F5";

  return(
    <div ref={cRef} onPointerDown={onDown} style={{
      position:"fixed",inset:0,overflow:"hidden",background:BG,
      fontFamily:"'Geist','Helvetica Neue',system-ui,sans-serif",fontSize:13,color:"#1A1A1A",
      userSelect:"none",WebkitUserSelect:"none",WebkitFontSmoothing:"antialiased",
    }}>

      {/* HEADER */}
      <div style={{height:HEAD,borderBottom:"1px solid #E8E6E1",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 20px 0 24px",background:BG,zIndex:20,position:"relative"}}>
        <div style={{display:"flex",alignItems:"baseline",gap:12}}>
          <span style={{fontFamily:"'Instrument Serif',Georgia,serif",fontStyle:"italic",fontSize:23,fontWeight:400}}>Timeline</span>
          <span style={{fontFamily:"'Geist Mono',monospace",fontSize:11,color:"#8A8780",letterSpacing:"0.05em"}}>{clock}</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={()=>{const w=(cRef.current?.offsetWidth||1400)-rail;setSx(((todayTs()-ORIGIN)/MS_DAY)*ppd-w/3);}}
            style={{fontFamily:"'Geist Mono',monospace",fontSize:10,letterSpacing:"0.07em",textTransform:"uppercase",color:"#8A8780",background:"none",border:"1px solid #E0DDD7",padding:"5px 14px",cursor:"pointer",borderRadius:3,fontWeight:500}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=IO;e.currentTarget.style.color=IO;}} onMouseLeave={e=>{e.currentTarget.style.borderColor="#E0DDD7";e.currentTarget.style.color="#8A8780";}}>Today</button>
          <div style={{display:"inline-flex",border:"1px solid #E0DDD7",borderRadius:3,overflow:"hidden"}}>
            {[{l:"D",v:28},{l:"W",v:14},{l:"M",v:5},{l:"Q",v:2}].map(z=>(
              <button key={z.l} onClick={()=>{const w=(cRef.current?.offsetWidth||1400)-rail;const cx=w/2;const dm=toDate(cx);setSx(((dm-ORIGIN)/MS_DAY)*z.v-cx);setPpd(z.v);}}
                style={{fontFamily:"'Geist Mono',monospace",fontSize:10,textTransform:"uppercase",
                  color:Math.abs(ppd-z.v)<1?"#fff":"#8A8780",background:Math.abs(ppd-z.v)<1?"#1A1A1A":"transparent",
                  padding:"5px 11px",border:"none",borderRight:"1px solid #E0DDD7",cursor:"pointer",fontWeight:500}}>{z.l}</button>))}
          </div>
          <div style={{position:"relative"}}>
            <button onClick={()=>setShowMenu(!showMenu)} style={{fontFamily:"'Geist Mono',monospace",fontSize:10,color:"#8A8780",background:"none",border:"1px solid #E0DDD7",padding:"5px 10px",cursor:"pointer",borderRadius:3}}>⋯</button>
            {showMenu&&(<div onPointerDown={e=>e.stopPropagation()} style={{position:"absolute",top:"100%",right:0,marginTop:4,background:"#fff",border:"1px solid #E0DDD7",borderRadius:6,padding:4,minWidth:170,boxShadow:"0 8px 24px rgba(0,0,0,0.1)",zIndex:100}}>
              <button onClick={()=>{navigator.clipboard?.writeText(JSON.stringify(data,null,2));setSaveStatus("saved");setShowMenu(false);}} style={{display:"block",width:"100%",padding:"8px 12px",border:"none",background:"transparent",color:"#1A1A1A",fontSize:12,fontFamily:"'Geist',sans-serif",textAlign:"left",cursor:"pointer",borderRadius:4}} onMouseEnter={e=>e.target.style.background="rgba(0,0,0,0.04)"} onMouseLeave={e=>e.target.style.background="transparent"}>Copy JSON</button>
              <button onClick={()=>{const j=prompt("Paste JSON:");if(j){try{const p=JSON.parse(j);if(p?.projects)setData(p);}catch(e){}}setShowMenu(false);}} style={{display:"block",width:"100%",padding:"8px 12px",border:"none",background:"transparent",color:"#1A1A1A",fontSize:12,fontFamily:"'Geist',sans-serif",textAlign:"left",cursor:"pointer",borderRadius:4}} onMouseEnter={e=>e.target.style.background="rgba(0,0,0,0.04)"} onMouseLeave={e=>e.target.style.background="transparent"}>Import JSON</button>
              <div style={{height:1,background:"#E8E6E1",margin:"2px 8px"}}/>
              <button onClick={()=>{if(confirm("Reset?")){setData(SEED);setSel(null);setEd(null);}setShowMenu(false);}} style={{display:"block",width:"100%",padding:"8px 12px",border:"none",background:"transparent",color:IO,fontSize:12,fontFamily:"'Geist',sans-serif",textAlign:"left",cursor:"pointer",borderRadius:4}} onMouseEnter={e=>e.target.style.background="rgba(255,79,0,0.04)"} onMouseLeave={e=>e.target.style.background="transparent"}>Reset to demo</button>
            </div>)}
          </div>
        </div>
      </div>

      {/* SIDEBAR */}
      <div style={{position:"absolute",top:HEAD,left:0,width:rail,bottom:0,borderRight:"1px solid #E0DDD7",zIndex:10,background:SIDE_BG,display:"flex",flexDirection:"column"}} onPointerDown={e=>e.stopPropagation()}>
        {/* Ruler/axis area is transparent so the continuous black axis line spans full width */}
        <div style={{height:RULER_H+AXIS_H,background:"transparent",pointerEvents:"none"}}/>
        <div style={{height:msH,borderBottom:"1px solid #E0DDD7",display:"flex",alignItems:"center",justifyContent:"flex-end",padding:"0 20px"}}>
          <span style={{fontFamily:"'Geist Mono',monospace",fontSize:9.5,color:"#A09E98",letterSpacing:"0.12em",textTransform:"uppercase",fontWeight:500}}>Milestones</span>
        </div>

        <div ref={sideRef} onScroll={()=>syncScroll("s")} style={{flex:1,overflowY:"auto",overflowX:"hidden"}}>
          {layout.map(({proj,trackLayout,height})=>(
            <div key={proj.id} style={{height,borderBottom:"1px solid #E8E6E1",position:"relative"}}>
              {/* Project header */}
              <div style={{position:"absolute",top:0,left:0,right:0,height:PROJ_HEAD,display:"flex",alignItems:"center",gap:8,padding:"0 20px"}}>
                <div style={{width:3,height:16,background:proj.color||"#1A1A1A",borderRadius:1,flexShrink:0,cursor:"pointer"}}
                  onClick={()=>setPopup(popup?.type==="proj"&&popup.pid===proj.id?null:{type:"proj",pid:proj.id})}/>
                <span style={{fontSize:15,fontWeight:600,letterSpacing:"-0.02em",cursor:"pointer",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:proj.color||"#1A1A1A"}}
                  onDoubleClick={()=>setPopup(popup?.type==="proj"&&popup.pid===proj.id?null:{type:"proj",pid:proj.id})}>{proj.name||<span style={{color:"#C5C2BC",fontStyle:"italic",fontWeight:400}}>Untitled</span>}</span>
                {popup?.type==="proj"&&popup.pid===proj.id&&(
                  <ItemPopover type="project" name={proj.name} color={proj.color}
                    onRename={v=>mut(d=>{const p=d.projects.find(pp=>pp.id===proj.id);if(p)p.name=v;})}
                    onColor={c=>mut(d=>{const p=d.projects.find(pp=>pp.id===proj.id);if(p)p.color=c;})}
                    onClearColor={()=>mut(d=>{const p=d.projects.find(pp=>pp.id===proj.id);if(p)delete p.color;})}
                    onDelete={()=>mut(d=>{d.projects=d.projects.filter(p=>p.id!==proj.id);})}
                    onClose={()=>setPopup(null)} canDelete={true}/>
                )}
              </div>

              {/* Track labels — color only on dot, name always neutral */}
              {trackLayout.map(({track,top,height:th})=>(
                <div key={track.id} style={{position:"absolute",top,left:0,right:0,height:th,display:"flex",alignItems:"center",gap:8,padding:"0 20px 0 32px"}}>
                  <div onClick={()=>setPopup(popup?.type==="trk"&&popup.tid===track.id?null:{type:"trk",pid:proj.id,tid:track.id})}
                    style={{width:10,height:10,borderRadius:"50%",background:track.color||"#D5D2CC",border:track.color?`2px solid ${track.color}`:"2px solid #D5D2CC",flexShrink:0,cursor:"pointer"}}/>
                  <span style={{fontFamily:"'Geist Mono',monospace",fontSize:11,color:"#7A7770",letterSpacing:"0.05em",textTransform:"uppercase",cursor:"pointer",fontWeight:500,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}
                    onDoubleClick={()=>setPopup(popup?.type==="trk"&&popup.tid===track.id?null:{type:"trk",pid:proj.id,tid:track.id})}>{track.name||"—"}</span>
                  {popup?.type==="trk"&&popup.tid===track.id&&(
                    <ItemPopover type="track" name={track.name||""} color={track.color}
                      onRename={v=>mut(d=>{const t=d.projects.find(p=>p.id===proj.id)?.tracks.find(tt=>tt.id===track.id);if(t)t.name=v;})}
                      onColor={c=>mut(d=>{const t=d.projects.find(p=>p.id===proj.id)?.tracks.find(tt=>tt.id===track.id);if(t)t.color=c;})}
                      onClearColor={()=>mut(d=>{const t=d.projects.find(p=>p.id===proj.id)?.tracks.find(tt=>tt.id===track.id);if(t)delete t.color;})}
                      onDelete={()=>mut(d=>{const p=d.projects.find(pp=>pp.id===proj.id);if(p)p.tracks=p.tracks.filter(t=>t.id!==track.id);})}
                      onClose={()=>setPopup(null)} canDelete={proj.tracks.length>1}/>
                  )}
                </div>
              ))}

              <div style={{position:"absolute",bottom:8,left:32,right:8}}>
                <span style={{fontFamily:"'Geist Mono',monospace",fontSize:10,color:"#C5C2BC",cursor:"pointer",letterSpacing:"0.05em",fontWeight:500}}
                  onClick={()=>{const id=uid();mut(d=>{const p=d.projects.find(pp=>pp.id===proj.id);if(p)p.tracks.push({id,name:"",phases:[]});});setPopup({type:"trk",pid:proj.id,tid:id});}}
                  onMouseEnter={e=>e.currentTarget.style.color=IO} onMouseLeave={e=>e.currentTarget.style.color="#C5C2BC"}>+ track</span>
              </div>
            </div>
          ))}

          <div style={{padding:"16px 20px",cursor:"pointer",display:"flex",alignItems:"center",gap:8,fontFamily:"'Geist Mono',monospace",fontSize:11,color:"#C5C2BC",letterSpacing:"0.05em",fontWeight:500}}
            onClick={()=>{const id=uid(),tid=uid();mut(d=>d.projects.push({id,name:"",tracks:[{id:tid,name:"",phases:[]}]}));setPopup({type:"proj",pid:id});}}
            onMouseEnter={e=>e.currentTarget.style.color=IO} onMouseLeave={e=>e.currentTarget.style.color="#C5C2BC"}>
            <div style={{width:12,height:12,border:"1.5px solid currentColor",borderRadius:2,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,lineHeight:1}}>+</div>
            PROJECT
          </div>
        </div>
      </div>

      {/* Continuous black axis line under ruler — spans full width across sidebar + timeline */}
      <div style={{position:"absolute",top:HEAD+RULER_H+AXIS_H-1,left:0,right:0,height:1,background:"#1A1A1A",zIndex:11,pointerEvents:"none"}}/>

      {/* GLOBAL RULER — spans full container width (sidebar + timeline) */}
      <div style={{position:"absolute",top:HEAD,left:0,right:0,height:RULER_H,background:BG,overflow:"hidden",zIndex:12,pointerEvents:"none"}}>
        {(()=>{
          const cur=new Date(toDate(0));
          const cms=new Date(cur.getFullYear(),cur.getMonth(),1).getTime();
          const stickyOn=toX(cms)+rail<=rail+60;
          const stickyLeft=rail+8;
          return(<>
            {/* sticky current month label */}
            {stickyOn&&(
              <div style={{position:"absolute",top:8,left:stickyLeft,fontFamily:"'Geist',sans-serif",fontSize:13,fontWeight:500,color:"#1A1A1A",whiteSpace:"nowrap",zIndex:2}}>{MONTHS[cur.getMonth()]} <span style={{color:"#A09E98",fontWeight:400}}>{cur.getFullYear()}</span></div>
            )}
            {ticks.map((t,i)=>{
              const x=toX(t.ts)+rail;
              if(x<rail-140||x>(cRef.current?.offsetWidth||1400)+40)return null;
              if(t.t==="sun")return null;
              if(t.t==="mo"){
                const showLabel=x>=rail+60;
                /* Hide preceding-month label when sticky is active to avoid layering */
                const showPrec=x>rail+40 && !(stickyOn && x<rail+120);
                return(<div key={`m${i}`} style={{position:"absolute",left:x,top:0,bottom:0}}>
                  <div style={{position:"absolute",top:0,height:RULER_H,width:1,background:"#1A1A1A"}}/>
                  {showPrec&&<div style={{position:"absolute",top:8,right:6,fontFamily:"'Geist',sans-serif",fontSize:11,fontWeight:400,color:"#C5C2BC",whiteSpace:"nowrap"}}>{t.prev}</div>}
                  {showLabel&&<div style={{position:"absolute",top:8,left:8,fontFamily:"'Geist',sans-serif",fontSize:13,fontWeight:500,color:"#1A1A1A",whiteSpace:"nowrap"}}>{t.l} <span style={{color:"#A09E98",fontWeight:400}}>{t.yr}</span></div>}
                </div>);
              }
              if(x<rail)return null;
              if(t.f)return <div key={`d${i}`} style={{position:"absolute",left:x,bottom:0}}><div style={{position:"absolute",bottom:0,width:1,height:RULER_H,background:"#1A1A1A"}}/></div>;
              return(<div key={`d${i}`} style={{position:"absolute",left:x,bottom:0}}><div style={{position:"absolute",bottom:0,width:1,height:t.wk?24:12,background:t.wk?"#A09E98":"#D5D2CC"}}/>{(ppd>5||t.wk)&&<div style={{position:"absolute",bottom:t.wk?28:16,left:0,transform:"translateX(-50%)",fontFamily:"'Geist Mono',monospace",fontSize:10.5,color:t.wk?"#5A5850":"#A09E98",fontWeight:t.wk?500:400,fontVariantNumeric:"tabular-nums",whiteSpace:"nowrap"}}>{t.l}</div>}</div>);
            })}
          </>);
        })()}
      </div>

      {/* RESIZE HANDLE */}
      <div onPointerDown={e=>{
          if(e.button!==0)return;
          e.stopPropagation();e.preventDefault();
          railDrag.current={startX:e.clientX,startRail:rail};
          try{e.currentTarget.setPointerCapture(e.pointerId);}catch(_){}
        }}
        onPointerMove={e=>{if(!railDrag.current)return;const d=railDrag.current;setRail(clamp(d.startRail+(e.clientX-d.startX),RAIL_MIN,RAIL_MAX));}}
        onPointerUp={e=>{railDrag.current=null;try{e.currentTarget.releasePointerCapture(e.pointerId);}catch(_){}}}
        onClick={e=>e.stopPropagation()}
        style={{position:"absolute",top:HEAD,left:rail-3,width:6,bottom:0,cursor:"col-resize",zIndex:30,background:"transparent"}}/>

      {/* TIMELINE */}
      <div style={{position:"absolute",top:HEAD,left:rail,right:0,bottom:0,overflow:"hidden"}}>
        {todayX>-2&&todayX<(vw.current||1200)+2&&(
          <div style={{position:"absolute",top:0,bottom:0,left:todayX,width:1.5,background:IO,opacity:.7,zIndex:6,pointerEvents:"none"}}>
            <div style={{position:"absolute",top:-1,left:-3,width:8,height:8,background:IO,borderRadius:"50%"}}/>
          </div>
        )}

        {/* spacer for ruler+axis (the actual ruler is rendered globally so it spans full width) */}
        <div style={{height:RULER_H,background:BG,zIndex:3,position:"relative"}}/>
        <div style={{height:AXIS_H,borderBottom:"1px solid #1A1A1A",position:"relative",background:BG,zIndex:3}}>
          {todayX>-4&&todayX<(vw.current||1200)+4&&(<div style={{position:"absolute",top:-1,left:todayX,width:8,height:8,background:IO,borderRadius:"50%",transform:"translateX(-50%)",zIndex:4}}/>)}
        </div>

        {/* MILESTONES */}
        <div data-r="mbg" style={{height:msH,borderBottom:"1px solid #E0DDD7",position:"relative",cursor:"crosshair",background:BG}}>
          {data.milestones.length===0&&<div style={{position:"absolute",left:20,top:"50%",transform:"translateY(-50%)",fontFamily:"'Geist Mono',monospace",fontSize:11,color:"#C5C2BC",letterSpacing:"0.06em",pointerEvents:"none",fontWeight:500}}>Click to place milestone</div>}
          {data.milestones.map(ms=>{
            const x=toX(ms.date);if(x<-100||x>(vw.current||1200)+100)return null;
            const row=msS.rowFor.get(ms.id)||0;const isSel=sel?.type==="ms"&&sel.id===ms.id;const isEd=ed?.type==="ms"&&ed.id===ms.id;
            const handlers={
              onPointerDown:e=>{if(!isEd)startMilestoneDrag(e,ms.id,"g");},
              onMouseDown:e=>{if(!isEd)startMilestoneDrag(e,ms.id,"g");},
              onDoubleClick:e=>{e.stopPropagation();if(!isEd)setEd({type:"ms",id:ms.id});},
              onDragStart:e=>e.preventDefault(),
            };
            return(<div key={ms.id} style={{position:"absolute",left:0,top:10+row*32,height:24,zIndex:isSel?10:1,pointerEvents:"none"}}>
              {/* diamond — centered exactly on the date tick */}
              <div data-r="ms" data-id={ms.id} data-sc="g" {...handlers}
                style={{position:"absolute",left:x-7,top:1,width:14,height:22,display:"flex",alignItems:"center",justifyContent:"center",cursor:isEd?"text":"grab",pointerEvents:"auto",touchAction:"none"}}>
                <div style={{width:10,height:10,transform:"rotate(45deg)",background:isSel?(ms.color||IO):BG,border:`1.5px solid ${ms.color||IO}`,boxShadow:isSel?`0 0 0 3px ${IO_LIGHT}`:"none",pointerEvents:"none"}}/>
              </div>
              {/* label — starts to the right of the diamond */}
              <div data-r="ms" data-id={ms.id} data-sc="g" {...handlers}
                style={{position:"absolute",left:x+10,top:0,height:24,display:"flex",alignItems:"center",cursor:isEd?"text":"grab",whiteSpace:"nowrap",padding:"0 6px",borderRadius:4,pointerEvents:"auto",touchAction:"none"}}>
                {isEd?(<Edit value={ms.name} onDone={v=>{mut(d=>{const m=d.milestones.find(mm=>mm.id===ms.id);if(m)m.name=v;});setEd(null);}} style={{fontFamily:"'Geist Mono',monospace",fontSize:12,width:110}}/>
                ):(<span style={{fontFamily:"'Geist Mono',monospace",fontSize:12,pointerEvents:"none"}}>
                  <span style={{color:"#8A8780",fontWeight:500}}>{new Date(ms.date).getDate()}</span>
                  <span style={{color:"#C5C2BC",margin:"0 5px"}}>·</span>
                  <span style={{color:"#1A1A1A",fontWeight:isSel?600:500}}>{ms.name}</span></span>)}
              </div>
            </div>);
          })}
        </div>

        {/* PROJECT LANES */}
        <div ref={laneRef} onScroll={()=>syncScroll("l")} style={{position:"relative",overflowY:"auto",overflowX:"hidden",height:`calc(100% - ${RULER_H+AXIS_H+msH+34}px)`}}>
          {/* IMAGE NOTES — anchored by date+y, free-floating, non-blocking */}
          {(data.imageNotes||[]).map(n=>{
            const x=toX(n.date);
            if(x<-100||x>(vw.current||1200)+100)return null;
            const isSel=imgSel===n.id;
            return(<div key={n.id}
              onPointerDown={e=>{
                if(e.button!==0)return;
                e.stopPropagation();
                setImgSel(n.id);
                const rect=cRef.current.getBoundingClientRect();
                imgDrag.current={id:n.id,offX:e.clientX-(rect.left+rail+x),offY:e.clientY-(rect.top+HEAD+RULER_H+AXIS_H+msH+(n.y-(laneRef.current?.scrollTop||0)))};
              }}
              style={{position:"absolute",left:x-(n.w||75)/2,top:n.y-(n.h||75)/2,width:n.w||75,height:n.h||75,cursor:"grab",zIndex:isSel?20:7,
                border:isSel?`1.5px solid ${IO}`:"1px solid transparent",borderRadius:4,padding:0,background:"transparent",
                boxShadow:isSel?`0 0 0 3px ${IO_LIGHT}`:"none"}}>
              <img src={n.src} alt="" draggable={false} style={{width:"100%",height:"100%",objectFit:"contain",pointerEvents:"none",display:"block"}}/>
              {isSel&&<div onPointerDown={e=>{e.stopPropagation();mut(d=>{d.imageNotes=(d.imageNotes||[]).filter(x=>x.id!==n.id);});setImgSel(null);}}
                style={{position:"absolute",top:-9,right:-9,width:18,height:18,borderRadius:"50%",background:"#fff",border:`1.5px solid ${IO}`,color:IO,fontSize:11,lineHeight:"15px",textAlign:"center",cursor:"pointer",fontFamily:"'Geist Mono',monospace",fontWeight:600}}>×</div>}
            </div>);
          })}
          {/* LINK NOTES — pill-style anchored notes */}
          {(data.linkNotes||[]).map(n=>{
            const x=toX(n.date);
            if(x<-200||x>(vw.current||1200)+200)return null;
            const isSel=linkSel===n.id;
            return(<div key={n.id}
              onPointerDown={e=>{
                if(e.button!==0)return;e.stopPropagation();setLinkSel(n.id);
                const rect=cRef.current.getBoundingClientRect();
                const lrect=laneRef.current.getBoundingClientRect();
                linkDrag.current={id:n.id,offX:e.clientX-(rect.left+rail+x),offY:e.clientY-(lrect.top+(n.y-(laneRef.current?.scrollTop||0)))};
              }}
              onDoubleClick={e=>{e.stopPropagation();window.open(n.url,"_blank","noopener");}}
              style={{position:"absolute",left:x,top:n.y,transform:"translate(-50%,-50%)",
                display:"inline-flex",alignItems:"center",gap:4,padding:"2px 7px",borderRadius:999,
                background:"#fff",border:`1.25px solid ${isSel?IO:"#002FA7"}`,color:isSel?IO:"#002FA7",
                fontFamily:"'Geist Mono',monospace",fontSize:7.2,fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase",
                cursor:"grab",zIndex:isSel?20:7,whiteSpace:"nowrap",boxShadow:isSel?`0 0 0 3px ${IO_LIGHT}`:"0 1px 3px rgba(0,0,0,0.04)"}}>
              <span style={{maxWidth:108,overflow:"hidden",textOverflow:"ellipsis"}}>{n.label||"Link"}</span>
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
                <path d="M7 17L17 7"/><path d="M8 7h9v9"/>
              </svg>
              {isSel&&<div onPointerDown={e=>{e.stopPropagation();mut(d=>{d.linkNotes=(d.linkNotes||[]).filter(x=>x.id!==n.id);});setLinkSel(null);}}
                style={{position:"absolute",top:-9,right:-9,width:18,height:18,borderRadius:"50%",background:"#fff",border:`1.5px solid ${IO}`,color:IO,fontSize:11,lineHeight:"15px",textAlign:"center",cursor:"pointer",fontWeight:600}}>×</div>}
            </div>);
          })}
          {layout.length===0&&(<div style={{position:"absolute",top:"40%",left:"50%",transform:"translate(-50%,-50%)",textAlign:"center",pointerEvents:"none"}}>
            <div style={{fontFamily:"'Instrument Serif',serif",fontStyle:"italic",fontSize:28,color:"rgba(0,0,0,0.06)",marginBottom:6}}>Start building</div>
            <div style={{fontFamily:"'Geist Mono',monospace",fontSize:11,color:"#C5C2BC"}}>Add a project, then drag to create phases</div>
          </div>)}
          {layout.map(({proj,trackLayout,height})=>(
            <div key={proj.id} style={{height,borderBottom:"1px solid #E8E6E1",position:"relative"}}>
              {/* project color stripe */}
              <div style={{position:"absolute",top:0,bottom:0,left:0,width:2,background:proj.color||"transparent",pointerEvents:"none",zIndex:1}}/>
              {ticks.filter(t=>t.t==="d"||t.t==="sun").map((t,i)=>{const x=toX(t.ts);if(x<-2||x>(vw.current||1200)+2)return null;const bg=t.t==="sun"?"#D5D2CC":(t.f?"#E0DDD7":"#F2F0ED");return <div key={i} style={{position:"absolute",top:0,bottom:0,left:x,width:1,background:bg,pointerEvents:"none"}}/>;})}

              {trackLayout.map(({track,st,top,height:th},ti)=>{const tc=track.color;let firstShown=false;return(
                <div key={track.id} data-r="tbg" data-pid={proj.id} data-tid={track.id}
                  style={{position:"absolute",top,left:0,right:0,height:th,cursor:"crosshair",borderBottom:ti<trackLayout.length-1?"1px solid #F2F0ED":"none"}}>
                  {track.phases.map(ph=>{
                    const x1=toX(ph.start),x2=toX(ph.end),w=x2-x1;
                    if(x2<-60||x1>(vw.current||1200)+60)return null;
                    const row=st.rowFor.get(ph.id)||0;const isSel2=sel?.type==="ph"&&sel.id===ph.id;const isEd2=ed?.type==="ph"&&ed.id===ph.id;
                    const v=getVis(ph.style||0,tc,ph.color,proj.color);
                    const isTrackKind=ph.kind==="track";
                    /* sequential number ignores track-kind phases */
                    const numbered=[...track.phases].filter(p=>p.kind!=="track").sort((a,b)=>a.start-b.start);
                    const sortedIdx=numbered.findIndex(p=>p.id===ph.id)+1;
                    const showTrackTag=!isTrackKind&&!firstShown&&w>90&&!!track.name;if(showTrackTag)firstShown=true;
                     const isHover=hover?.id===ph.id;
                     const fmtMd=ts=>{const d=new Date(ts);return`${d.getMonth()+1}/${d.getDate()}`;};
                     return(<div key={ph.id} data-r="ph" data-id={ph.id} data-pid={proj.id} data-tid={track.id}
                       onMouseEnter={e=>{setHover({id:ph.id,w:Math.max(w,12)});setHoverPos({x:e.clientX,y:e.clientY});}}
                       onMouseMove={e=>{if(hover?.id===ph.id)setHoverPos({x:e.clientX,y:e.clientY});}}
                       onMouseLeave={()=>setHover(h=>h?.id===ph.id?null:h)}
                      style={{position:"absolute",left:x1,top:row*ROW_H+(ROW_H-BAR_H)/2,width:Math.max(w,12),height:BAR_H,
                        background:v.bg,backgroundImage:v.bgi||"none",border:isSel2?`1.5px solid ${IO}`:v.border,borderRadius:3,
                        color:v.color,fontWeight:v.fw,fontStyle:v.fs||"normal",display:"flex",alignItems:"center",padding:"0 10px 0 12px",
                        fontSize:13,cursor:"grab",zIndex:isSel2?5:1,boxShadow:isSel2?`0 0 0 2px ${BG}, 0 0 0 3.5px ${IO}`:"0 1px 3px rgba(0,0,0,0.04)",
                        overflow:"hidden",whiteSpace:"nowrap",transition:"box-shadow 0.08s",gap:6}}
                      onDoubleClick={e=>{e.stopPropagation();setEd({type:"ph",id:ph.id,pid:proj.id,tid:track.id});}}>
                      <div data-r="phl" data-id={ph.id} data-pid={proj.id} data-tid={track.id} style={{position:"absolute",top:0,bottom:0,left:0,width:10,cursor:"ew-resize"}}/>
                      <div data-r="phr" data-id={ph.id} data-pid={proj.id} data-tid={track.id} style={{position:"absolute",top:0,bottom:0,right:0,width:10,cursor:"ew-resize"}}/>
                      {isEd2?(<Edit value={ph.name} onDone={vl=>{mut(d=>{const tr2=d.projects.find(p=>p.id===proj.id)?.tracks.find(t=>t.id===track.id);const p2=tr2?.phases.find(p=>p.id===ph.id);if(p2)p2.name=vl;});setEd(null);}} style={{fontSize:13,fontWeight:v.fw,color:v.color}}/>
                       ):(<span style={{overflow:"hidden",textOverflow:"ellipsis",pointerEvents:"none",display:"flex",alignItems:"center",gap:6}}>
                        {showTrackTag&&<span style={{fontFamily:"'Geist Mono',monospace",fontSize:9.5,color:v.numColor,opacity:.6,textTransform:"uppercase",letterSpacing:"0.08em",flexShrink:0,fontWeight:600}}>{track.name} ·</span>}
                        {isTrackKind?(
                          <span style={{fontFamily:"'Geist Mono',monospace",fontSize:11,color:v.numColor,flexShrink:0,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em"}}>{track.name||"—"}</span>
                        ):(
                          <span style={{fontFamily:"'Geist Mono',monospace",fontSize:11,color:v.numColor,flexShrink:0,fontWeight:600}}>{String(sortedIdx).padStart(2,"0")}</span>
                        )}
                        {ph.name}</span>)}
                    </div>);
                  })}
                  {pv&&pv.pid===proj.id&&pv.tid===track.id&&(()=>{const x1=toX(pv.s),x2=toX(pv.e);return <div style={{position:"absolute",left:x1,top:(ROW_H-BAR_H)/2,width:Math.max(x2-x1,4),height:BAR_H,background:IO,opacity:.15,border:`1.5px dashed ${IO}`,borderRadius:3,pointerEvents:"none",zIndex:8}}/>;})()}
                </div>);})}
            </div>
          ))}
        </div>

        {/* STATUS */}
        <div style={{position:"absolute",bottom:0,left:0,right:0,height:34,borderTop:"1px solid #E8E6E1",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 20px",fontFamily:"'Geist Mono',monospace",fontSize:11,color:"#8A8780",letterSpacing:"0.05em",textTransform:"uppercase",background:BG,zIndex:5,fontWeight:500}}>
          <div style={{display:"flex",alignItems:"center",gap:16}}>
            <span>{ppd>15?"Day":ppd>6?"Week":ppd>3?"Month":"Quarter"}</span>
            <span style={{color:"#D5D2CC"}}>·</span>
            <span>{data.projects.length} proj</span>
            {saveStatus==="saved"&&<><span style={{color:"#D5D2CC"}}>·</span><span style={{color:"#2A9D8F"}}>Saved</span></>}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <button onPointerDown={e=>e.stopPropagation()} onClick={onAddLink}
              style={{fontFamily:"'Geist Mono',monospace",fontSize:10,letterSpacing:"0.07em",textTransform:"uppercase",color:"#8A8780",background:"none",border:"1px solid #E0DDD7",padding:"4px 12px",cursor:"pointer",borderRadius:14,fontWeight:500}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=IO;e.currentTarget.style.color=IO;}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="#E0DDD7";e.currentTarget.style.color="#8A8780";}}>Add Link</button>
            <button onPointerDown={e=>e.stopPropagation()} onClick={()=>fileInputRef.current?.click()}
              style={{fontFamily:"'Geist Mono',monospace",fontSize:10,letterSpacing:"0.07em",textTransform:"uppercase",color:"#8A8780",background:"none",border:"1px solid #E0DDD7",padding:"4px 12px",cursor:"pointer",borderRadius:14,fontWeight:500}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=IO;e.currentTarget.style.color=IO;}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="#E0DDD7";e.currentTarget.style.color="#8A8780";}}>Image Note</button>
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/svg+xml" style={{display:"none"}}
              onChange={e=>{const f=e.target.files?.[0];onImagePicked(f);e.target.value="";}}/>
            {sel&&<span style={{color:IO}}>{sel.type==="ph"?"Phase":"Milestone"} — ⌫ del · dbl-click edit</span>}
            {!sel&&<span style={{color:"#C5C2BC"}}>Drag to pan · ⌘Z undo · ⌘⇧Z redo</span>}
          </div>
        </div>
      </div>

      {/* STYLE PICKER — phases */}
      {sel?.type==="ph"&&(()=>{const proj=data.projects.find(p=>p.id===sel.pid);const track=proj?.tracks.find(t=>t.id===sel.tid);const ph=track?.phases.find(p=>p.id===sel.id);
        if(!ph)return null;const tc=track?.color;const pc=proj?.color;const curStyle=ph.style||0;
        const setPhField=(field,val)=>mut(d=>{const p2=d.projects.find(p=>p.id===sel.pid)?.tracks.find(t=>t.id===sel.tid)?.phases.find(p=>p.id===sel.id);if(p2)p2[field]=val;});
        const kind=ph.kind||"phase";
        const kindBtn=(label,val)=>{const on=kind===val;return(
          <button key={val} onClick={()=>setPhField("kind",val)} style={{
            fontFamily:"'Geist Mono',monospace",fontSize:10,letterSpacing:"0.08em",textTransform:"uppercase",fontWeight:600,
            padding:"4px 10px",borderRadius:999,cursor:"pointer",
            background:"#fff",color:on?IO:"#7A7770",
            border:on?`1.5px solid ${IO}`:"1px solid #D5D2CC"
          }}>{label}</button>);};
        return(<div onPointerDown={e=>e.stopPropagation()} style={{position:"fixed",bottom:44,left:"50%",transform:"translateX(-50%)",display:"flex",alignItems:"center",gap:8,zIndex:50}}>
        <div style={{display:"flex",alignItems:"center",gap:5,padding:"6px 8px",background:"#fff",border:"1.5px solid #1A1A1A",borderRadius:4,boxShadow:"0 4px 16px rgba(0,0,0,0.08)"}}>
          <span style={{fontFamily:"'Geist Mono',monospace",fontSize:10,color:"#8A8780",letterSpacing:"0.08em",textTransform:"uppercase",marginRight:2,fontWeight:500,width:38}}>Style</span>
          {STYLE_KEYS.map((k,i)=>{const sv=getVis(i,tc,ph.color,pc);
            if(i===7){/* custom/rainbow swatch */
              return(<button key={i} onClick={()=>mut(d=>{const p2=d.projects.find(p=>p.id===sel.pid)?.tracks.find(t=>t.id===sel.tid)?.phases.find(p=>p.id===sel.id);if(p2){p2.style=7;if(!p2.color)p2.color=tc||"#E8562A";};})}
                title="custom color" style={{width:30,height:20,borderRadius:2,cursor:"pointer",
                  background:"linear-gradient(135deg,#002FA7,#E8562A,#D4A017,#2A9D8F)",
                  border:curStyle===7?`2px solid ${IO}`:"1px solid #D5D2CC",transform:curStyle===7?"scale(1.15)":"scale(1)"}}/>);
            }
            return(<button key={i} onClick={()=>mut(d=>{const p2=d.projects.find(p=>p.id===sel.pid)?.tracks.find(t=>t.id===sel.tid)?.phases.find(p=>p.id===sel.id);if(p2)p2.style=i;})}
              title={k} style={{width:30,height:20,background:sv.bg,backgroundImage:sv.bgi||"none",borderRadius:2,
                border:i===curStyle?`2px solid ${IO}`:(sv.border||"1px solid #D5D2CC"),cursor:"pointer",transform:i===curStyle?"scale(1.15)":"scale(1)"}}/>);})}
          {/* Color picker for custom style */}
          {curStyle===7&&(<>
            <div style={{width:1,height:16,background:"#E8E6E1",margin:"0 2px"}}/>
            <input type="color" value={ph.color||tc||"#E8562A"}
              onChange={e=>mut(d=>{const p2=d.projects.find(p=>p.id===sel.pid)?.tracks.find(t=>t.id===sel.tid)?.phases.find(p=>p.id===sel.id);if(p2)p2.color=e.target.value;})}
              style={{width:26,height:20,border:"none",padding:0,cursor:"pointer",borderRadius:2,background:"none"}}/>
          </>)}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {kindBtn("Track","track")}
          {kindBtn("Phase","phase")}
        </div>
        </div>);
      })()}

      {/* MILESTONE COLOR — when milestone is selected */}
      {sel?.type==="ms"&&(()=>{const ms=data.milestones.find(m=>m.id===sel.id);
        if(!ms)return null;
        // Pull palette from project + track colors actually in use, plus a few defaults.
        const used=[];
        data.projects.forEach(p=>{if(p.color)used.push(p.color);p.tracks.forEach(t=>{if(t.color)used.push(t.color);});});
        const swatches=Array.from(new Set(used.filter(Boolean))).slice(0,12);
        return(<div onPointerDown={e=>e.stopPropagation()} style={{position:"fixed",bottom:44,left:"50%",transform:"translateX(-50%)",background:"#fff",border:"1.5px solid #1A1A1A",borderRadius:4,boxShadow:"0 4px 16px rgba(0,0,0,0.08)",padding:"6px 8px",display:"flex",alignItems:"center",gap:6,zIndex:50}}>
          <span style={{fontFamily:"'Geist Mono',monospace",fontSize:10,color:"#8A8780",letterSpacing:"0.08em",textTransform:"uppercase",marginRight:2,fontWeight:500}}>Color</span>
          {swatches.map(c=>(
            <div key={c} onClick={()=>mut(d=>{const m=d.milestones.find(mm=>mm.id===sel.id);if(m)m.color=c;})}
              style={{width:18,height:18,borderRadius:"50%",background:c,cursor:"pointer",
                border:(ms.color||IO)===c?`2px solid ${IO}`:"2px solid transparent",
                transform:(ms.color||IO)===c?"scale(1.2)":"scale(1)"}}/>
          ))}
          {swatches.length>0&&<div style={{width:1,height:16,background:"#E8E6E1",margin:"0 2px"}}/>}
          <input type="color" value={ms.color||IO}
            onChange={e=>mut(d=>{const m=d.milestones.find(mm=>mm.id===sel.id);if(m)m.color=e.target.value;})}
            style={{width:22,height:18,border:"none",padding:0,cursor:"pointer",borderRadius:2,background:"none"}}/>
          <div style={{width:1,height:16,background:"#E8E6E1",margin:"0 2px"}}/>
          {msDel===0?(
            <span onClick={()=>setMsDel(1)}
              onMouseEnter={e=>e.currentTarget.style.color=IO} onMouseLeave={e=>e.currentTarget.style.color="#C5C2BC"}
              style={{fontFamily:"'Geist Mono',monospace",fontSize:10,color:"#C5C2BC",letterSpacing:"0.05em",fontWeight:500,cursor:"pointer",marginLeft:4,paddingLeft:4,textTransform:"uppercase"}}>Delete</span>
          ):(
            <span onClick={()=>{mut(d=>{d.milestones=d.milestones.filter(m=>m.id!==sel.id);});setSel(null);setMsDel(0);}}
              style={{fontFamily:"'Geist Mono',monospace",fontSize:10,color:IO,letterSpacing:"0.05em",fontWeight:600,cursor:"pointer",marginLeft:4,paddingLeft:4,textTransform:"uppercase"}}>Confirm?</span>
          )}
        </div>);
      })()}

      {/* PHASE HOVER TOOLTIP — follows cursor */}
      {hover&&(()=>{
        let hp=null,htr=null;
        for(const p of data.projects){for(const t of p.tracks){const f=t.phases.find(x=>x.id===hover.id);if(f){hp=f;htr=t;break;}}if(hp)break;}
        if(!hp)return null;
        const fmt=ts=>{const d=new Date(ts);return`${d.getMonth()+1}/${d.getDate()}`;};
        const MAX=42;const nm=hp.name||"";const trim=nm.length>MAX?nm.slice(0,MAX)+"…":nm;
        /* Estimate whether the chip is wide enough to show the full name.
           Chip layout: 12px left pad + ~22px for number/track tag + 6px gap + name + 10px right pad.
           Geist ~6.6px per char at 13px. If full name fits, hide it from the tooltip. */
        const nameFits=nm.length===0||(hp.kind!=="track"&&hover.w-50>=nm.length*6.6);
        const showName=nm&&!nameFits;
        return(<div style={{position:"fixed",left:hoverPos.x+14,top:hoverPos.y+16,padding:"5px 10px",background:"#fff",border:"1px solid #D5D2CC",borderRadius:14,fontFamily:"'Geist Mono',monospace",fontSize:11.5,color:"#1A1A1A",letterSpacing:"0.01em",whiteSpace:"nowrap",pointerEvents:"none",zIndex:100,boxShadow:"0 2px 8px rgba(0,0,0,0.06)",fontWeight:500}}>
          <span style={{fontWeight:600}}>{fmt(hp.start)}–{fmt(hp.end)}</span>
          {showName&&<span style={{marginLeft:8,fontWeight:400}}>{trim}</span>}
        </div>);
      })()}
    </div>
  );
}
