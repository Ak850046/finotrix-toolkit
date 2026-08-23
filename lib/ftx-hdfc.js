/* Finotrix Toolkit — shared HDFC bank-statement parser (PDF bytes -> AOA rows). Offline. */
(function(){
  const DATE=/^\d{2}\/\d{2}\/\d{2,4}$/;
  const numOf=s=>{const t=String(s).replace(/,/g,'').replace(/[^0-9.\-]/g,'');return t&&/\d/.test(t)?parseFloat(t):null;};
  const isHeaderRow=j=>/Narration/i.test(j)&&/Withdrawal/i.test(j)&&/Deposit/i.test(j)&&/Closing/i.test(j);
  const SKIP=/Page\s*No|STATEMENT\s+SUMMARY|Opening\s+Balance|Closing\s+Bal|Dr\s+Count|Cr\s+Count|Generated\s+(On|By)|computer\s+generated|Registered\s+Office|Account\s+Branch|Account\s+No|A\/C\s+Open|Statement\s+From|IFSC|MICR|Cust\s+ID|Nomination|Branch\s+Code|Account\s+(Status|Type)|Currency|Phone\s+no|OD\s+Limit|RTGS\/NEFT|JOINT\s+HOLDERS|Contents\s+of\s+this|HDFC\s+BANK\s+LIMITED|GSTIN|hdfcbank\.com|https?:\/\/|goods-and-service|this\s+statement|The\s+address|Statement\s+of\s+account|Requesting|Sanctioned/i;
  function headerCols(items){const find=re=>{const it=items.find(i=>re.test(i.t));return it?it.x:null;};return {date:find(/^Date/i),narration:find(/Narration/i),ref:find(/Chq|Ref/i),value:find(/Value/i),withdrawal:find(/Withdrawal/i),deposit:find(/Deposit/i),closing:find(/Closing/i)};}
  function colFor2(x,cols){let best=cols[0].key;for(const c of cols){if(x>=c.x-6)best=c.key;else break;}return best;}

  async function parse(bytes,opts){
    opts=opts||{};const onStatus=opts.onStatus;
    const pdf=await pdfjsLib.getDocument({data:(bytes instanceof Uint8Array?bytes.slice():new Uint8Array(bytes)),password:opts.password}).promise;
    let colx=null,nonDate=null;const txns=[];let cur=null;let warn='';
    for(let p=1;p<=pdf.numPages;p++){
      if(onStatus&&(p===1||p%10===0||p===pdf.numPages))onStatus(`page ${p}/${pdf.numPages}`);
      const tc=await (await pdf.getPage(p)).getTextContent();
      const items=(tc.items||[]).filter(i=>i.str&&i.str.trim()).map(i=>({t:i.str.trim(),x:+(i.transform?.[4]||0),y:+(i.transform?.[5]||0)}));
      const rows=[];const tol=4;
      for(const it of items){let r=rows.find(r=>Math.abs(r.y-it.y)<=tol);if(!r){r={y:it.y,items:[]};rows.push(r);}r.items.push(it);}
      rows.sort((a,b)=>b.y-a.y);rows.forEach(r=>r.items.sort((a,b)=>a.x-b.x));
      for(const row of rows){
        const joined=row.items.map(i=>i.t).join(' ');
        if(isHeaderRow(joined)){if(!colx){colx=headerCols(row.items);nonDate=['narration','ref','value','withdrawal','deposit','closing'].filter(k=>colx[k]!=null).map(k=>({key:k,x:colx[k]})).sort((a,b)=>a.x-b.x);}continue;}
        if(!colx)continue;
        if(SKIP.test(joined))continue;
        const first=row.items[0];
        const isNew=first&&DATE.test(first.t)&&first.x<colx.narration-15;
        if(!isNew&&!cur)continue;
        const b={narration:[],ref:[],value:[],withdrawal:[],deposit:[],closing:[]};
        for(let k=(isNew?1:0);k<row.items.length;k++){const it=row.items[k];b[colFor2(it.x,nonDate)].push(it.t);}
        if(isNew){if(cur)txns.push(cur);cur={date:first.t,narr:b.narration.join(' ').trim(),ref:b.ref.join(' ').trim(),vdate:b.value.join(' ').trim(),wd:b.withdrawal.join(' ').trim(),dep:b.deposit.join(' ').trim(),bal:b.closing.join(' ').trim()};}
        else{const nn=b.narration.join(' ').trim();if(nn)cur.narr=(cur.narr+' '+nn).trim();const rr=b.ref.join(' ').trim();if(rr&&!cur.ref)cur.ref=rr;const vv=b.value.join(' ').trim();if(vv&&!cur.vdate)cur.vdate=vv;const ww=b.withdrawal.join(' ').trim();if(ww&&!cur.wd)cur.wd=ww;const dd=b.deposit.join(' ').trim();if(dd&&!cur.dep)cur.dep=dd;const bb=b.closing.join(' ').trim();if(bb&&!cur.bal)cur.bal=bb;}
      }
    }
    if(cur)txns.push(cur);
    await pdf.destroy();
    if(!colx)throw new Error('Could not find HDFC statement columns. Is this a text HDFC e-statement (not a scan)?');
    const head=['Date','Narration','Chq./Ref.No.','Value Date','Withdrawal','Deposit','Closing Balance'];
    const out=[head];
    for(const t of txns)out.push([t.date,t.narr,t.ref,t.vdate,numOf(t.wd),numOf(t.dep),numOf(t.bal)]);
    let mism=0;
    for(let i=2;i<out.length;i++){const prev=out[i-1][6],c2=out[i][6],w=out[i][4]||0,d=out[i][5]||0;if(typeof prev==='number'&&typeof c2==='number'&&Math.abs(prev-(w||0)+(d||0)-c2)>1)mism++;}
    if(mism>0)warn=`(${mism} balance mismatch)`;
    return {rows:out,count:txns.length,warn};
  }
  window.FTXHDFC={parse,cols:()=>[{wch:11},{wch:52},{wch:16},{wch:11},{wch:14},{wch:14},{wch:16}]};
})();
