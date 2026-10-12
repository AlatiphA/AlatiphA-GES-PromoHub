/* Read-only reports. All financial data comes from administrator-only callables. */
let adminOverviewGeneration=0,adminOverviewReport=null,adminOverviewExporting=false;
function adminOverviewReset(){adminOverviewGeneration++;adminOverviewReport=null;adminOverviewExporting=false;}
function overviewMoney(v){return typeof v==='number'&&Number.isFinite(v)?'GH₵ '+v.toFixed(2):'Unavailable';}
function overviewDate(v){return Number(v)>0?new Date(Number(v)).toLocaleString('en-GB',{timeZone:'Africa/Accra',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'Unavailable';}
function overviewCsv(rows){return '\uFEFF'+rows.map(row=>row.map(value=>{let text=value===null||value===undefined?'':String(value);if(typeof value==='string'&&(/^[\t\r\n]/.test(text)||/^\s*[=+@-]/.test(text)))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';}).join(',')).join('\r\n')+'\r\n';}
function overviewDownload(name,rows){const blob=new Blob([overviewCsv(rows)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function overviewEl(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
function overviewTable(host,title,rows,columns){
 const section=overviewEl('section',undefined,'overviewSection');section.append(overviewEl('h3',title));
 if(!rows.length){section.append(overviewEl('p','No matching records.'));host.append(section);return;}
 const scroll=overviewEl('div',undefined,'overviewTableScroll'),table=overviewEl('table'),caption=overviewEl('caption','Preview of up to 20 records. Export the full list below.');table.append(caption);
 const head=overviewEl('thead'),hrow=overviewEl('tr');for(const c of columns){const th=overviewEl('th',c.label);th.scope='col';hrow.append(th);}head.append(hrow);table.append(head);
 const body=overviewEl('tbody');for(const row of rows){const tr=overviewEl('tr');for(const c of columns)tr.append(overviewEl('td',c.format?c.format(row[c.key]):String(row[c.key]??'')));body.append(tr);}table.append(body);scroll.append(table);section.append(scroll);host.append(section);
}
async function adminOverview(){
 if(!securityIsAdmin())return;adminCancelSearch();adminOverviewReset();const epoch=adminOverviewGeneration,state=securityAdminStart('overview','Administration overview');securityMessage('');
 try{
  const report=await securityCall('getPromoHubAdminOverview');if(epoch!==adminOverviewGeneration||!securityAdminCurrent(state))return;adminOverviewReport=report;state.host.replaceChildren();
  const root=overviewEl('div',undefined,'overviewRoot'),tools=overviewEl('div',undefined,'overviewTools'),refresh=overviewEl('button','Refresh overview');refresh.type='button';refresh.addEventListener('click',adminOverview);tools.append(refresh,overviewEl('p','Generated '+overviewDate(report.asOfMs)+' (Ghana time). Refresh after approvals or renewals.'));root.append(tools);
  const cards=overviewEl('div',undefined,'overviewCards'),s=report.summary;
  for(const [label,value,note] of [['Active paid subscriptions',s.activeSubscriptions,'Active, verified non-admin accounts with dated paid access.'],['Expiring within 7 days',s.expiringSubscriptions,'Subset of active paid subscriptions.'],['Pending payments',s.pendingPayments,'Requests awaiting review; excluded from verified totals.'],['Verified total, all time',overviewMoney(s.verifiedTotalGhs),s.verifiedPayments+' approved ledger payments.'],['Verified total, this month',overviewMoney(s.verifiedMonthTotalGhs),s.verifiedMonthPayments+' approved payments since '+overviewDate(report.monthStartMs)+'.']]){
   const card=overviewEl('article',undefined,'overviewCard');card.append(overviewEl('h3',label),overviewEl('strong',String(value)),overviewEl('p',note));cards.append(card);
  }root.append(cards);
  if(s.invalidLedgerRecords)root.append(overviewEl('p',s.invalidLedgerRecords+' ledger entries excluded because approval data is invalid or later than the report cutoff.','overviewWarning'));
  root.append(overviewEl('p','Verified totals use the approved-payment ledger, including past renewals and retained payments for deleted accounts. Pending/rejected requests, audit events and unrecorded donations are excluded. This is not a live MoMo wallet balance.','overviewNote'));
  const exports=overviewEl('section',undefined,'overviewSection');exports.append(overviewEl('h3','Export CSV'));
  const actions=overviewEl('div',undefined,'overviewExportActions'),period=overviewEl('select');period.setAttribute('aria-label','Verified payment export period');for(const [value,label] of [['month','This month'],['all','All time']]){const o=overviewEl('option',label);o.value=value;period.append(o);}actions.append(period);
  const exportStatus=overviewEl('p','Exports contain names, emails and payment details. Keep these files private.');exportStatus.setAttribute('role','status');
  const cancel=overviewEl('button','Cancel export');cancel.type='button';cancel.hidden=true;const controls=[];let cancelRequested=false;
  cancel.addEventListener('click',()=>{cancelRequested=true;exportStatus.textContent='Cancelling export…';});
  async function exportReport(kind){
   if(adminOverviewExporting||!securityAdminCurrent(state))return;adminOverviewExporting=true;cancelRequested=false;controls.forEach(b=>b.disabled=true);period.disabled=true;cancel.hidden=false;
   const current=()=>epoch===adminOverviewGeneration&&securityAdminCurrent(state)&&!cancelRequested;
   try{
    let rows;
    if(kind==='summary')rows=[['Metric','Value','Generated at (Ghana time)'],['Active paid subscriptions',s.activeSubscriptions,overviewDate(report.asOfMs)],['Expiring within 7 days',s.expiringSubscriptions,overviewDate(report.asOfMs)],['Pending payments',s.pendingPayments,overviewDate(report.asOfMs)],['Verified total all time (GHS)',s.verifiedTotalGhs,overviewDate(report.asOfMs)],['Verified total this month (GHS)',s.verifiedMonthTotalGhs,overviewDate(report.asOfMs)],['Verified payments all time',s.verifiedPayments,overviewDate(report.asOfMs)],['Excluded ledger entries',s.invalidLedgerRecords,overviewDate(report.asOfMs)]];
    else{
     const records=[];let cursor=null,pages=0;const selected=period.value;
     do{if(!current())return;exportStatus.textContent='Preparing export… '+records.length+' matching records loaded.';
      const result=await securityCall('getPromoHubAdminExport',{kind,period:selected,cursor,asOfMs:report.asOfMs});if(!current())return;
      records.push(...result.rows);cursor=result.cursor;if(++pages>500)throw new Error('Export is too large for this browser. No partial file was downloaded.');
     }while(cursor);
     if(kind==='active'||kind==='expiring')rows=[['Name','Email','Plan','Expiry (Ghana time)','Days remaining at report time'],...records.map(r=>[r.name,r.email,r.plan,overviewDate(r.expiresAtMs),r.daysRemaining])];
     else if(kind==='pending')rows=[['Name','Email','Plan','Requested amount (GHS)','MoMo transaction ID','Requested at (Ghana time)','Waiting days'],...records.map(r=>[r.name,r.email,r.plan,r.amountGhs,r.transactionId,overviewDate(r.requestedAtMs),r.waitingDays])];
     else rows=[['Name','Email','Plan','Verified amount (GHS)','MoMo transaction ID','Approved at (Ghana time)','Approved by','Approver email'],...records.map(r=>[r.name,r.email,r.plan,r.amountGhs,r.transactionId,overviewDate(r.approvedAtMs),r.approvedByName,r.approvedByEmail])];
    }
    if(!current())return;const date=new Date(report.asOfMs).toISOString().slice(0,10);overviewDownload('promohub-'+kind+(kind==='verified'?'-'+period.value:'')+'-'+date+'.csv',rows);exportStatus.textContent='CSV prepared. '+(rows.length-1)+' rows exported.';
   }catch(e){if(epoch===adminOverviewGeneration&&securityAdminCurrent(state))exportStatus.textContent=e.message||'Export failed.';}
   finally{if(epoch===adminOverviewGeneration){adminOverviewExporting=false;if(securityAdminCurrent(state)){controls.forEach(b=>b.disabled=false);period.disabled=false;cancel.hidden=true;if(cancelRequested)exportStatus.textContent='Export cancelled. No file downloaded.';}}}
  }
  for(const [kind,label] of [['summary','Overview summary'],['active','Active subscriptions'],['expiring','Expiring subscriptions'],['pending','Pending payments'],['verified','Verified payments']]){const b=overviewEl('button',label);b.type='button';b.addEventListener('click',()=>exportReport(kind));controls.push(b);actions.append(b);}actions.append(cancel);exports.append(actions,exportStatus);root.append(exports);
  const identity=[{label:'Name',key:'name'},{label:'Email',key:'email'}];
  overviewTable(root,'Soonest expiries',report.expiring,[...identity,{label:'Plan',key:'plan'},{label:'Expiry (Ghana time)',key:'expiresAtMs',format:overviewDate},{label:'Days remaining',key:'daysRemaining'}]);
  overviewTable(root,'Oldest pending payments',report.pending,[...identity,{label:'Plan',key:'plan'},{label:'Requested amount',key:'amountGhs',format:overviewMoney},{label:'Requested at (Ghana time)',key:'requestedAtMs',format:overviewDate}]);
  overviewTable(root,'Latest verified payments',report.verified,[...identity,{label:'Plan',key:'plan'},{label:'Verified amount',key:'amountGhs',format:overviewMoney},{label:'Approved at (Ghana time)',key:'approvedAtMs',format:overviewDate}]);
  state.host.append(root);document.getElementById('securitySummary').textContent='Overview is read-only. Use Subscription payments to review and approve actual MoMo receipts.';
 }catch(e){if(epoch===adminOverviewGeneration&&securityAdminCurrent(state)){securityMessage(e.message||'Unable to load overview.');state.host.textContent='Unable to load overview. Select Overview to retry.';}}
}
