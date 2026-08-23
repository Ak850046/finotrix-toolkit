/* Finotrix Toolkit — chainable PDF operations (PDF bytes -> PDF bytes) for Workflows. Offline. */
(function(){
  const U8 = b => b instanceof Uint8Array ? b : new Uint8Array(b);
  const clone = b => U8(b).slice();
  const hexToRgb = FTX.hexToRgb;

  function parseRanges(s,max){const out=[];for(const part of String(s||'').split(',')){let t=part.trim();if(!t)continue;const m=t.match(/^(\d+)\s*-\s*(\d*)$/);if(m){let a=+m[1],b=m[2]?+m[2]:max;if(a>b)[a,b]=[b,a];for(let i=a;i<=b;i++)if(i>=1&&i<=max)out.push(i-1);}else if(/^\d+$/.test(t)){const n=+t;if(n>=1&&n<=max)out.push(n-1);}}return out;}
  const ascii=s=>String(s).replace(/[^\x20-\x7E]/g,'').trim();
  function parseTsv(tsv){const o=[];for(const line of String(tsv||'').split(/\r?\n/)){const c=line.split('\t');if(c.length<12||c[0]!=='5')continue;const conf=+c[10],text=ascii(c[11]);if(!text||conf<40)continue;o.push({left:+c[6],top:+c[7],w:+c[8],h:+c[9],text});}return o;}

  async function renderPages(bytes,scale,onStatus){
    const pdf=await pdfjsLib.getDocument({data:clone(bytes)}).promise;const pages=[];
    for(let p=1;p<=pdf.numPages;p++){ if(onStatus)onStatus(`page ${p}/${pdf.numPages}`);
      const page=await pdf.getPage(p);const pts=page.getViewport({scale:1});const vp=page.getViewport({scale});
      const cv=document.createElement('canvas');cv.width=Math.ceil(vp.width);cv.height=Math.ceil(vp.height);
      const ctx=cv.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,cv.width,cv.height);
      await page.render({canvasContext:ctx,viewport:vp}).promise; pages.push({page,pts,cv});
    }
    return {pdf,pages};
  }

  const OPS={
    compress:{ label:'Compress (rasterise)', end:false,
      fields:[{k:'dpi',label:'Resolution',type:'select',options:[['96','Small'],['120','Balanced'],['150','Good'],['200','High']],def:'120'},
              {k:'quality',label:'JPEG quality %',type:'number',def:'70'}],
      run:async(bytes,o,ctx)=>{const scale=(+o.dpi||120)/72,q=(+o.quality||70)/100;const {pdf,pages}=await renderPages(bytes,scale,ctx.onStatus);
        const out=await PDFLib.PDFDocument.create();for(const pg of pages){const blob=await new Promise(r=>pg.cv.toBlob(r,'image/jpeg',q));const jpg=await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));const p=out.addPage([pg.pts.width,pg.pts.height]);p.drawImage(jpg,{x:0,y:0,width:pg.pts.width,height:pg.pts.height});}await pdf.destroy();return await out.save();} },

    watermark:{ label:'Watermark (text)', end:false,
      fields:[{k:'text',label:'Text',type:'text',def:'CONFIDENTIAL'},{k:'color',label:'Colour',type:'color',def:'#7a2434'},
              {k:'opacity',label:'Opacity %',type:'number',def:'18'},{k:'rotation',label:'Rotation°',type:'number',def:'45'},
              {k:'size',label:'Size',type:'number',def:'60'},{k:'tile',label:'Tile across page',type:'checkbox',def:false}],
      run:async(bytes,o,ctx)=>{const {PDFDocument,rgb,StandardFonts,degrees}=PDFLib;const doc=await PDFDocument.load(bytes,{ignoreEncryption:true});
        const font=await doc.embedFont(StandardFonts.HelveticaBold);const c=hexToRgb(o.color||'#7a2434');const op=(+o.opacity||18)/100,rot=+o.rotation||0,size=+o.size||60,text=o.text||'';
        for(const pg of doc.getPages()){const {width,height}=pg.getSize();const stamp=(cx,cy)=>{const tw=font.widthOfTextAtSize(text,size);pg.drawText(text,{x:cx-tw/2,y:cy-size/2,size,font,color:rgb(c.r,c.g,c.b),opacity:op,rotate:degrees(rot)});};
          if(o.tile){const sx=width/3,sy=height/4;for(let gx=0;gx<3;gx++)for(let gy=0;gy<4;gy++)stamp(sx*(gx+0.5),sy*(gy+0.5));}else stamp(width/2,height/2);}
        return await doc.save();} },

    pagenumbers:{ label:'Add page numbers', end:false,
      fields:[{k:'pos',label:'Position',type:'select',options:[['bc','Bottom center'],['br','Bottom right'],['bl','Bottom left'],['tc','Top center'],['tr','Top right'],['tl','Top left']],def:'bc'},
              {k:'fmt',label:'Format',type:'select',options:[['{n}','1, 2, 3'],['Page {n}','Page 1'],['{n} of {N}','1 of N']],def:'{n}'},
              {k:'start',label:'Start at',type:'number',def:'1'},{k:'size',label:'Font size',type:'number',def:'10'},{k:'margin',label:'Margin pt',type:'number',def:'24'}],
      run:async(bytes,o,ctx)=>{const {PDFDocument,rgb,StandardFonts}=PDFLib;const doc=await PDFDocument.load(bytes,{ignoreEncryption:true});const font=await doc.embedFont(StandardFonts.Helvetica);
        const pages=doc.getPages();const start=+o.start||1,size=+o.size||10,margin=+o.margin||24,fmt=o.fmt||'{n}',pos=o.pos||'bc',total=start+pages.length-1;
        pages.forEach((pg,i)=>{const {width,height}=pg.getSize();const n=start+i;const t=fmt.replace('{n}',n).replace('{N}',total);const tw=font.widthOfTextAtSize(t,size);
          const x=pos[1]==='l'?margin:pos[1]==='r'?width-margin-tw:(width-tw)/2;const y=pos[0]==='t'?height-margin-size:margin;pg.drawText(t,{x,y,size,font,color:rgb(.2,.2,.2)});});
        return await doc.save();} },

    crop:{ label:'Crop margins', end:false,
      fields:[{k:'t',label:'Top %',type:'number',def:'0'},{k:'b',label:'Bottom %',type:'number',def:'0'},{k:'l',label:'Left %',type:'number',def:'0'},{k:'r',label:'Right %',type:'number',def:'0'}],
      run:async(bytes,o,ctx)=>{const t=(+o.t||0)/100,b=(+o.b||0)/100,l=(+o.l||0)/100,r=(+o.r||0)/100;const doc=await PDFLib.PDFDocument.load(bytes,{ignoreEncryption:true});
        for(const pg of doc.getPages()){const m=pg.getMediaBox();pg.setCropBox(m.x+m.width*l,m.y+m.height*b,m.width*(1-l-r),m.height*(1-t-b));}return await doc.save();} },

    rotate:{ label:'Rotate pages', end:false,
      fields:[{k:'angle',label:'Angle',type:'select',options:[['90','90° right'],['180','180°'],['270','90° left']],def:'90'}],
      run:async(bytes,o,ctx)=>{const {PDFDocument,degrees}=PDFLib;const doc=await PDFDocument.load(bytes,{ignoreEncryption:true});const a=+o.angle||90;
        for(const pg of doc.getPages()){const cur=pg.getRotation().angle||0;pg.setRotation(degrees((cur+a)%360));}return await doc.save();} },

    extract:{ label:'Extract pages', end:false,
      fields:[{k:'ranges',label:'Pages (e.g. 1-3, 5)',type:'text',def:'1-'}],
      run:async(bytes,o,ctx)=>{const {PDFDocument}=PDFLib;const src=await PDFDocument.load(bytes,{ignoreEncryption:true});const idx=parseRanges(o.ranges,src.getPageCount());
        if(!idx.length)throw new Error('No valid pages in range');const out=await PDFDocument.create();const cp=await out.copyPages(src,idx);cp.forEach(p=>out.addPage(p));return await out.save();} },

    unlock:{ label:'Unlock (remove password)', end:false,
      fields:[{k:'password',label:'Password (if any)',type:'password',def:''}],
      run:async(bytes,o,ctx)=>{const {PDFDocument}=PDFLib;
        if(o.password){const pdf=await pdfjsLib.getDocument({data:clone(bytes),password:o.password}).promise;const out=await PDFDocument.create();
          for(let p=1;p<=pdf.numPages;p++){const page=await pdf.getPage(p);const pts=page.getViewport({scale:1});const vp=page.getViewport({scale:2});const cv=document.createElement('canvas');cv.width=Math.ceil(vp.width);cv.height=Math.ceil(vp.height);const c=cv.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,cv.width,cv.height);await page.render({canvasContext:c,viewport:vp}).promise;const blob=await new Promise(r=>cv.toBlob(r,'image/jpeg',.92));const jpg=await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));const pg=out.addPage([pts.width,pts.height]);pg.drawImage(jpg,{x:0,y:0,width:pts.width,height:pts.height});}
          await pdf.destroy();return await out.save();}
        const doc=await PDFDocument.load(bytes,{ignoreEncryption:true});return await doc.save();} },

    ocr:{ label:'OCR (make searchable)', end:false,
      fields:[{k:'dpi',label:'Resolution',type:'select',options:[['150','150 DPI'],['200','200 DPI'],['300','300 DPI']],def:'200'}],
      run:async(bytes,o,ctx)=>{const scale=(+o.dpi||200)/72;const {PDFDocument,StandardFonts,rgb}=PDFLib;const {pdf,pages}=await renderPages(bytes,scale,ctx.onStatus);
        const out=await PDFDocument.create();const font=await out.embedFont(StandardFonts.Helvetica);const worker=await FTX.getOcrWorker();
        for(const pg of pages){const res=await worker.recognize(pg.cv,{},{tsv:true});const ws=parseTsv(res.data&&res.data.tsv);const blob=await new Promise(r=>pg.cv.toBlob(r,'image/jpeg',.85));const jpg=await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));const P=out.addPage([pg.pts.width,pg.pts.height]);P.drawImage(jpg,{x:0,y:0,width:pg.pts.width,height:pg.pts.height});for(const w of ws){const x=w.left/scale,y=pg.pts.height-(w.top+w.h)/scale,size=Math.max(4,w.h/scale*.86);try{P.drawText(w.text,{x,y,size,font,color:rgb(0,0,0),opacity:0});}catch(_){}}}
        await pdf.destroy();return await out.save();} },
  };
  window.FTXOPS=OPS;
})();
