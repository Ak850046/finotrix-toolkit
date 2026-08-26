/* Finotrix Toolkit — shared PDF text/line/table extraction (offline) */
(function(){
  const clean=s=>String(s||'').replace(/ /g,' ').replace(/[ \t]+/g,' ').trim();
  const norm=s=>String(s||'').replace(/\s+/g,' ').trim();
  function median(a){const v=(a||[]).filter(Number.isFinite).sort((x,y)=>x-y);if(!v.length)return 0;const m=Math.floor(v.length/2);return v.length%2?v[m]:(v[m-1]+v[m])/2;}

  async function extractPage(page,pageNum){
    const tc=await page.getTextContent();
    const items=(tc.items||[]).filter(i=>i.str&&i.str.trim()).map(i=>({text:i.str.replace(/ /g,' ').trim(),x:+(i.transform?.[4]||0),y:+(i.transform?.[5]||0),width:+(i.width||0),size:Math.max(1,Math.abs(+(i.transform?.[3]||0))||10)}));
    const rows=[];const tol=3.8;
    for(const it of items){let r=rows.find(r=>Math.abs(r.y-it.y)<=tol);if(!r){r={y:it.y,items:[]};rows.push(r);}r.items.push(it);}
    rows.sort((a,b)=>b.y-a.y);rows.forEach(r=>r.items.sort((a,b)=>a.x-b.x));
    const lines=rows.map(r=>{let text='',le=null,cells=[],cell='',sizes=[];for(const it of r.items){const gap=le===null?0:it.x-le;if(le!==null&&gap>28){if(cell.trim())cells.push(cell.trim());cell=it.text;text+='    '+it.text;}else{cell+=(cell?' ':'')+it.text;text+=(text&&gap>5?' ':'')+it.text;}le=it.x+(it.width||it.text.length*5);sizes.push(it.size);}if(cell.trim())cells.push(cell.trim());return{text:clean(text),size:median(sizes),cells};}).filter(l=>l.text);
    return {pageNum,raw:lines.map(l=>l.text).join('\n'),lines};
  }
  async function ocrPage(page){
    const vp=page.getViewport({scale:1.8});const cv=document.createElement('canvas');cv.width=Math.ceil(vp.width);cv.height=Math.ceil(vp.height);
    const ctx=cv.getContext('2d',{willReadFrequently:true});await page.render({canvasContext:ctx,viewport:vp}).promise;
    const w=await FTX.getOcrWorker();const res=await w.recognize(cv);const t=res.data?.text||'';
    return {lines:String(t).split(/\r?\n/).map(x=>({text:clean(x),size:10,cells:[clean(x)]})).filter(x=>x.text),raw:t};
  }
  async function extract(file,opts){
    opts=opts||{};const pdf=await pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer()),password:opts.password}).promise;
    const pages=[];
    for(let p=1;p<=pdf.numPages;p++){
      if(opts.onStatus)opts.onStatus(`Reading page ${p}/${pdf.numPages}…`);
      const page=await pdf.getPage(p);let rec=await extractPage(page,p);
      const wantOcr = opts.forceOcr || (norm(rec.raw).length<30 && opts.ocr);
      if(wantOcr && window.Tesseract){
        try{if(opts.onStatus)opts.onStatus(`OCR page ${p}/${pdf.numPages}…`);const o=await ocrPage(page);
          if(opts.forceOcr ? norm(o.raw).length>0 : norm(o.raw).length>norm(rec.raw).length) rec={pageNum:p,raw:o.raw,lines:o.lines};}catch(e){console.warn(e);}
      }
      pages.push(rec);
      if(opts.onProgress)opts.onProgress(Math.round(p/pdf.numPages*80)+8);
    }
    try{await pdf.destroy();}catch(e){}
    return pages;
  }
  function medianSize(pages){const all=[];pages.forEach(p=>p.lines.forEach(l=>{if(l.size>0)all.push(l.size);}));return median(all)||10;}
  function headingLevel(line,body){const t=line.text.trim();if(t.length<2||t.length>130)return 0;const r=(line.size||body)/body;if(r>=1.65)return 1;if(r>=1.38)return 2;if(r>=1.18)return 3;const L=t.replace(/[^A-Za-z]/g,'');if(t.length<=70&&L.length>=5&&t===t.toUpperCase()&&!/[.!?]$/.test(t))return 2;return 0;}
  // collect contiguous multi-cell rows into table blocks (array of {rows:[[cells]]})
  function tableBlocks(pages){
    const blocks=[];
    for(const pg of pages){const lines=pg.lines;let i=0;while(i<lines.length){if(lines[i].cells&&lines[i].cells.length>=2){const block=[];let j=i;while(j<lines.length&&lines[j].cells&&lines[j].cells.length>=2&&lines[j].cells.length<=12){block.push(lines[j].cells);j++;}if(block.length>=2)blocks.push({page:pg.pageNum,rows:block});i=j;}else i++;}}
    return blocks;
  }
  window.FTXPDF={extract,extractPage,medianSize,headingLevel,tableBlocks,clean,norm,median};
})();
