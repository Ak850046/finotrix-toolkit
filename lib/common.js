/* Finotrix Toolkit — shared helpers (offline) */
(function(){
  // Keep animation-frame callbacks firing even when the tab is hidden/backgrounded,
  // so pdf.js page rendering never stalls if the user switches away mid-job.
  // Native rAF fires first when visible; a timer fallback fires when it's throttled.
  try{
    var _raf = window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : null;
    window.requestAnimationFrame = function(cb){
      var called=false; var run=function(t){ if(called) return; called=true; try{ cb(t); }catch(e){ console.error(e); } };
      var id = _raf ? _raf(run) : 0;
      setTimeout(function(){ run(performance.now()); }, 24);
      return id;
    };
  }catch(e){}

  // Theme: apply saved light/dark and inject a floating toggle on every page.
  try{
    var TKEY='ftx-theme';
    var saved=localStorage.getItem(TKEY);
    if(saved==='light'||saved==='dark') document.documentElement.setAttribute('data-theme',saved);
    var mkToggle=function(){
      if(document.getElementById('ftxTheme')) return;
      var cur=function(){ var e=document.documentElement.getAttribute('data-theme'); if(e) return e; return (window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light'; };
      var b=document.createElement('button'); b.id='ftxTheme'; b.type='button'; b.title='Toggle light / dark'; b.setAttribute('aria-label','Toggle light or dark theme');
      b.textContent = cur()==='dark' ? '☀️' : '🌙';
      b.onclick=function(){ var now = cur()==='dark' ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme',now); try{localStorage.setItem(TKEY,now);}catch(_){}
        b.textContent = now==='dark' ? '☀️' : '🌙'; };
      document.body.appendChild(b);
    };
    if(document.body) mkToggle(); else document.addEventListener('DOMContentLoaded',mkToggle);
  }catch(e){}

  window.FTX = window.FTX || {};
  const $ = id => document.getElementById(id);
  FTX.$ = $;
  FTX.toast = function(msg){ let el=$('toast'); if(!el){el=document.createElement('div');el.id='toast';el.className='toast';document.body.appendChild(el);} el.textContent=msg; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),1500); };
  FTX.status = function(id,msg,type){ const el=$(id); if(!el)return; el.className='status show '+(type||'info'); el.textContent=msg; };
  FTX.hideStatus = function(id){ const el=$(id); if(el){el.className='status';el.textContent='';} };
  FTX.progress = function(id,p){ const box=$(id); if(!box)return; box.classList.add('show'); const bar=box.firstElementChild; if(bar) bar.style.width=Math.max(0,Math.min(100,p))+'%'; };
  FTX.hideProgress = function(id){ const box=$(id); if(box){box.classList.remove('show'); const b=box.firstElementChild; if(b)b.style.width='0%';} };
  FTX.formatBytes = function(n){ if(!Number.isFinite(n))return '—'; if(n<1024)return n+' B'; if(n<1048576)return (n/1024).toFixed(1)+' KB'; return (n/1048576).toFixed(2)+' MB'; };
  FTX.extOf = name => { const m=(name||'').toLowerCase().match(/\.([a-z0-9]+)$/); return m?m[1]:''; };
  FTX.stripExt = name => String(name||'file').replace(/\.[a-z0-9]+$/i,'');
  FTX.escapeHtml = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  FTX.saveBlob = function(blob,filename){ const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1500); };
  FTX.saveBytes = function(bytes,filename,mime){ FTX.saveBlob(new Blob([bytes],{type:mime||'application/octet-stream'}),filename); };
  // wire a dropzone+input pair; cb receives a FileList
  FTX.wireDrop = function(zoneId,inputId,cb){
    const zone=$(zoneId), input=$(inputId); if(!zone||!input)return;
    zone.addEventListener('click',()=>input.click());
    zone.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();input.click();}});
    ['dragenter','dragover'].forEach(ev=>zone.addEventListener(ev,e=>{e.preventDefault();zone.classList.add('drag');}));
    ['dragleave','drop'].forEach(ev=>zone.addEventListener(ev,e=>{e.preventDefault();zone.classList.remove('drag');}));
    zone.addEventListener('drop',e=>{ if(e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files.length) cb(e.dataTransfer.files); });
    input.addEventListener('change',e=>{ if(e.target.files&&e.target.files.length){ cb(e.target.files); input.value=''; } });
  };
  // configure pdf.js worker from the local file (works over http/localhost)
  FTX.initPdfWorker = function(){ if(window.pdfjsLib){ pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../lib/pdf.worker.min.js', document.currentScript ? document.currentScript.src : location.href).href; } };
  // OCR worker (offline) — shared
  let _ocr=null,_ocrInit=null;
  FTX.getOcrWorker = function(){
    if(_ocr) return Promise.resolve(_ocr);
    if(_ocrInit) return _ocrInit;
    _ocrInit=(async()=>{
      const base=new URL('../lib/tesseract/', location.href).href;
      _ocr=await Tesseract.createWorker('eng',1,{workerPath:base+'worker.min.js',corePath:base,langPath:base,gzip:true,cacheMethod:'none'});
      return _ocr;
    })();
    return _ocrInit;
  };
  FTX.hexToRgb = hex => { const m=String(hex||'').replace('#','').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i); if(!m)return{r:0,g:0,b:0}; return {r:parseInt(m[1],16)/255,g:parseInt(m[2],16)/255,b:parseInt(m[3],16)/255}; };
  FTX.readAsArrayBuffer = file => file.arrayBuffer();
  FTX.readAsDataURL = file => new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); });
  FTX.loadImage = src => new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=rej; im.src=src; });
})();
