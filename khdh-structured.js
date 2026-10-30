/* KHDH structured index - isolated from student profiles and assessment records. */
(function(root){
'use strict';
const trim=v=>String(v??'').replace(/\s+/g,' ').trim();
const fold=v=>trim(v).replace(/[đĐ]/g,'d').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const iso=(y,m,d)=>{ const date=new Date(Date.UTC(Number(y),Number(m)-1,Number(d)));return date.getUTCFullYear()===Number(y)&&date.getUTCMonth()===Number(m)-1&&date.getUTCDate()===Number(d)?`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`:null; };
function date(value,schoolYear=''){
 if(!value)return null;
 if(value instanceof Date&&!isNaN(value))return iso(value.getFullYear(),value.getMonth()+1,value.getDate());
 if(typeof value==='number'&&value>20000&&value<90000){const d=new Date(Date.UTC(1899,11,30)+value*86400000);return d.toISOString().slice(0,10);}
 let v=trim(value),m;
 if((m=v.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})$/)))return iso(m[1],m[2],m[3]);
 if((m=v.match(/(?:^|\D)(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(20\d{2})(?:$|\D)/)))return iso(m[3],m[2],m[1]);
 if((m=v.match(/ngay\s*(\d{1,2})\s*thang\s*(\d{1,2})\s*nam\s*(20\d{2})/i)))return iso(m[3],m[2],m[1]);
 if((m=v.match(/^(\d{1,2})\s*[\/.\-]\s*(\d{1,2})$/))){const yr=Number(String(schoolYear).match(/20\d{2}/)?.[0]);return yr?iso(Number(m[2])>=8?yr:yr+1,m[2],m[1]):null;}
 return null;
}
function number(v){if(v===null||v===undefined||trim(v)==='')return null;const n=Number(String(v).replace(/\s*(?:tiết|tiet)\s*$/i,'').replace(',','.'));return Number.isInteger(n)&&n>0&&n<=300?n:null;}
function week(v){if(v===null||v===undefined)return null;const str=trim(v);const m=str.match(/(?:tuần|tuan|week|^w\s*)\s*(\d{1,2})/i)||str.match(/^(\d{1,2})(?:\s*[-–]\s*\d{1,2})?$/);return m?Number(m[1]):null;}
function weeks(raw){if(raw===null||raw===undefined)return [null,null];const str=trim(raw);const matches=[...str.matchAll(/(?:tuan|tuần|week)\s*(\d{1,2})/gi)];const ranges=str.match(/(?:tuan|tuần|week)?\s*(\d{1,2})\s*[-–]\s*(\d{1,2})/i);if(ranges)return [Number(ranges[1]),Number(ranges[2])];if(matches.length)return [Number(matches[0][1]),Number(matches.at(-1)[1])];let w=week(str);return [w,w];}
const normSubject=v=>fold(v).replace(/[^a-z0-9]+/g,'');
function subjectId(v,available=[]){const f=normSubject(v);if(!f)return null;return available.find(s=>[s.id,s.name,s.sheetName,s.aliases&&s.aliases.join('|')].filter(Boolean).some(t=>normSubject(t)===f))?.id||null;}
function normalizeRecord(raw,ctx={}){
 if(!raw||typeof raw!=='object')return null;
 const lessonName=trim(raw.lessonName??raw.lesson??raw.tenBai??raw.baiHoc??raw.bai);
 if(!lessonName)return null;
 const grade=Number(raw.grade??raw.khoi??ctx.grade)||null;
 const explicitSubject=trim(raw.subjectId||raw.subject||raw.monHoc||'');
 const sId=explicitSubject?subjectId(explicitSubject,ctx.subjects):(ctx.subjectId||null);
 const w1=week(raw.weekStart??raw.tuanBatDau)||week(raw.week??raw.tuan),w2=week(raw.weekEnd??raw.tuanKetThuc)||w1;
 const sessions=Array.isArray(raw.sessions)?raw.sessions.map(s=>({date:date(s.date??s.ngay,ctx.schoolYear),periods:number(s.periods??s.soTiet),week:week(s.week??s.tuan)})).filter(s=>s.date||s.week):[];
 const firstDate=date(raw.startDate??raw.ngayBatDau??raw.date??raw.ngay,ctx.schoolYear);
 const lastDate=date(raw.endDate??raw.ngayKetThuc,ctx.schoolYear)||firstDate;
 const p=number(raw.periods??raw.soTiet??raw.tiet);
 const lessonNumber=trim(raw.lessonNumber??raw.soBai??'');
 return { schoolYear:trim(raw.schoolYear||ctx.schoolYear),grade,subjectId:sId,topic:trim(raw.topic??raw.chuDe??raw.chuDiem??'Chưa phân loại chủ đề'),lessonNumber,lessonName,periods:p,weekStart:w1,weekEnd:w2,startDate:firstDate,endDate:lastDate,sessions,focus:trim(raw.focus??raw.trongTam??raw.knowledge??''),source:trim(raw.source??ctx.source??'')};
}
function weekdayISO(isoDate,delta=0){const d=new Date(`${isoDate}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+delta);return d.toISOString().slice(0,10);}
function monday(isoDate){const d=new Date(`${isoDate}T00:00:00Z`);const day=d.getUTCDay()||7;return weekdayISO(isoDate,1-day);}
function getAnchor(records,configured){const configuredDate=configured?date(configured):null;
 const matches=[];
 for(const r of records){
  for(const sess of r.sessions||[]){if(sess.date&&sess.week)matches.push(weekdayISO(monday(sess.date),-7*(sess.week-1)));}
  if(r.weekStart&&(!r.weekEnd||r.weekStart===r.weekEnd)&&r.startDate)matches.push(weekdayISO(monday(r.startDate),-7*(r.weekStart-1)));
 }
 if(!matches.length)return configuredDate?{date:monday(configuredDate),source:'calendar'}:{date:null,source:'missing'};
 const freq=new Map();matches.forEach(d=>freq.set(d,(freq.get(d)||0)+1));const sorted=[...freq].sort((a,b)=>b[1]-a[1]);return {date:sorted[0][0],source:(sorted.length>1||(configuredDate&&monday(configuredDate)!==sorted[0][0]))?'derived-conflict':'derived'};
}
function recordMonths(record,anchorDate){
 const instances=[];
 if(record.sessions.length&&record.sessions.some(s=>s.date)){for(const s of record.sessions){if(s.date)instances.push({month:Number(s.date.slice(5,7)),date:s.date,periods:s.periods,source:'session'});}return instances;}
 if(record.startDate){
  const start=record.startDate,end=record.endDate||start;
  if(end<start)return [];
  const current=new Date(`${start}T00:00:00Z`),last=new Date(`${end}T00:00:00Z`);
  const months=new Set();let days=0;
  while(current<=last&&days<366){months.add(current.getUTCMonth()+1);current.setUTCDate(current.getUTCDate()+1);days++;}
  for(const mon of months)instances.push({month:mon,periods:months.size===1?record.periods:null,source:months.size===1?'date':'date-range-ambiguous'});
  return instances;
 }
 if(record.weekStart&&anchorDate){
  const start=record.weekStart,end=Math.min(record.weekEnd||start,start+54);
  for(let w=start;w<=end;w++){
   const mondayDate=weekdayISO(anchorDate,(w-1)*7),cnt=new Map();
   for(let day=0;day<5;day++){const mon=Number(weekdayISO(mondayDate,day).slice(5,7));cnt.set(mon,(cnt.get(mon)||0)+1);}
   const mon=[...cnt].sort((a,b)=>b[1]-a[1])[0][0];
   // If several weeks or sessions are involved, exact per-month period count is not provable.
   instances.push({month:mon,periods:start===end?record.periods:null,source:'week-majority'});
  }
 }
 return instances;
}
function viewMonth(records,month,anchorConfig){const wanted=Number(month),anchor=getAnchor(records,anchorConfig);const groups=new Map(),unresolved=[];
 for(const r of records){const dates=recordMonths(r,anchor.date);if(!dates.length){unresolved.push(r);continue;}
 const hits=dates.filter(d=>d.month===wanted);if(!hits.length)continue;
 const periods=(hits.some(h=>h.periods===null))?null:hits.reduce((n,h)=>n+(h.periods||0),0);
 // Date sessions always provide period detail if available; avoid double counting multiweek.
 const actual=hits.some(h=>h.source==='session')?periods:recordMonths(r,anchor.date).length===1?r.periods:periods;
 const name=r.topic||'Chưa phân loại chủ đề';if(!groups.has(name))groups.set(name,[]);
 groups.get(name).push({...r,periodsInMonth:actual,confidence:hits.map(h=>h.source).join(',')});
 }
 const topics=[...groups].map(([name,lessons])=>({name,lessons,periods:lessons.some(x=>x.periodsInMonth===null)?null:lessons.reduce((sum,x)=>sum+(x.periodsInMonth||0),0)}));
 return {topics,unresolved,anchor,month:wanted};
}
function aiContext(view){const lines=[];for(const t of view.topics){lines.push(`Chủ đề: ${t.name}`);for(const l of t.lessons){lines.push(`- ${l.lessonNumber?`Bài ${l.lessonNumber}: `:''}${l.lessonName}; ${l.weekStart?`tuần ${l.weekStart}${l.weekEnd&&l.weekEnd!==l.weekStart?'-'+l.weekEnd:''}; `:''}${l.periodsInMonth!=null?l.periodsInMonth+' tiết; ':''}${l.focus?l.focus:''}`);}}return lines.join('\n').slice(0,16000);}
function rowsToRecords(sheetRows,ctx={}){
 const result=[];let headers=null,topic='',lastWeek=null,lastDate=null;
 const aliases={topic:/^(chu de|chu diem|mach noi dung|chude)$/,lesson:/^(ten bai|ten bai hoc|bai hoc|noi dung|ten tiet|noi dung day hoc)$/,week:/^(tuan|tuan hoc|tuan thu|thoi gian)$/,periods:/^(so tiet|tiet|thoi luong)$/,date:/^(ngay|ngay day|ngay thuc hien|thoi gian thuc hien)$/,number:/^(bai|bai so|stt|so bai)$/,focus:/^(yeu cau can dat|noi dung trong tam|trong tam|ghi chu)$/};
 for(const sourceRow of sheetRows){const row=Array.isArray(sourceRow)?sourceRow.map(v=>trim(v)):[];const filled=row.filter(Boolean);if(!filled.length)continue;
  const key=row.map(fold);const detected={};for(const [name,re] of Object.entries(aliases)){let idx=key.findIndex(k=>re.test(k));if(idx>=0)detected[name]=idx;}
  if(detected.lesson!==undefined&&(detected.week!==undefined||detected.periods!==undefined||detected.topic!==undefined)){headers=detected;continue;}
  const joined=filled.join(' ');
  if(!headers){const w=joined.match(/(?:tuần|tuan)\s*(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?/i);if(w)lastWeek=[Number(w[1]),Number(w[2]||w[1])];
   const top=joined.match(/^(?:chủ đề|chủ điểm)\s*(?:\d+\s*[:.\-–])?\s*(.+)$/i);if(top){topic=trim(top[1]);continue;}
   const lesson=joined.match(/^(?:bài|bai)\s*(\d{1,3})\s*[:.\-–]\s*(.+)$/i);
   if(lesson){const x=normalizeRecord({lessonName:lesson[2].replace(/\s+\d+\s*tiết.*$/i,''),lessonNumber:lesson[1],topic,weekStart:lastWeek?.[0],weekEnd:lastWeek?.[1],startDate:null,periods:Number(joined.match(/(\d+)\s*tiết/i)?.[1])||null},ctx);if(x)result.push(x);}
   continue;
  }
  const c=name=>row[headers[name]]||'';
  if(!c('lesson')){if(c('topic'))topic=c('topic');if(c('week'))lastWeek=weeks(c('week'));continue;}
  const currentTopic=c('topic')||topic,ws=weeks(c('week'));if(currentTopic)topic=currentTopic;
  const dateTokens=(c('date').match(/\d{1,2}\s*[\/.\-]\s*\d{1,2}\s*[\/.\-]\s*20\d{2}/g)||[]);
  const explicitDate=date(dateTokens[0]||c('date'),ctx.schoolYear),lastExplicitDate=date(dateTokens[1],ctx.schoolYear);
  const record=normalizeRecord({topic,lessonName:c('lesson'),lessonNumber:c('number'),periods:c('periods'),weekStart:ws[0]||lastWeek?.[0],weekEnd:ws[1]||lastWeek?.[1],startDate:explicitDate,endDate:lastExplicitDate,focus:c('focus')},ctx);
  if(record)result.push(record);if(ws[0])lastWeek=ws;
 }
 return result;
}
function mergeUnique(records){const seen=new Set();return records.filter(r=>{const key=[r.schoolYear,r.grade,r.subjectId,fold(r.topic),fold(r.lessonName),r.weekStart,r.weekEnd,r.startDate,r.endDate].join('|');if(seen.has(key))return false;seen.add(key);return true;});}
root.KHDHStructured={date,week,weeks,normalizeRecord,subjectId,getAnchor,recordMonths,viewMonth,aiContext,rowsToRecords,mergeUnique,fold};
})(typeof window!=='undefined'?window:globalThis);
