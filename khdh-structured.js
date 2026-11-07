/* KHDH structured scheduling, v2. Independent of student records and evaluation scores. */
(function(root){
'use strict';
const trim = value => String(value??'').replace(/\s+/g,' ').trim();
const fold = value => trim(value).replace(/[đĐ]/g,'d').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const iso = (y,m,d) => { const n=new Date(Date.UTC(+y,+m-1,+d));return n.getUTCFullYear()===+y && n.getUTCMonth()===+m-1 && n.getUTCDate()===+d?`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`:null;};
function date(value,schoolYear=''){
 if(value==null || value==='')return null;
 if(value instanceof Date&&!isNaN(value))return iso(value.getFullYear(),value.getMonth()+1,value.getDate());
 if(typeof value==='number'&&value>20000&&value<90000)return new Date(Date.UTC(1899,11,30)+Math.round(value)*86400000).toISOString().slice(0,10);
 const v=trim(value);let m;
 if((m=v.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})$/)))return iso(m[1],m[2],m[3]);
 if((m=v.match(/(?:^|\D)(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(20\d{2})(?:$|\D)/)))return iso(m[3],m[2],m[1]);
 if((m=fold(v).match(/ngay\s*(\d{1,2})\s*thang\s*(\d{1,2})\s*nam\s*(20\d{2})/)))return iso(m[3],m[2],m[1]);
 if((m=v.match(/^(\d{1,2})\s*[\/.\-]\s*(\d{1,2})$/))){const yr=Number(String(schoolYear).match(/20\d{2}/)?.[0]);return yr?iso(+m[2]>=8?yr:yr+1,m[2],m[1]):null;}
 return null;
}
const number=v=>{if(v===null||v===undefined||trim(v)==='')return null;const m=trim(v).match(/^(\d{1,3})(?:\s*(?:tiết|tiet))?$/i);const n=m?+m[1]:NaN;return Number.isInteger(n)&&n>0&&n<=500?n:null;};
const week=v=>{if(v===null||v===undefined)return null;const s=fold(v),m=s.match(/(?:tuan|week|\bw\s*)(?:\s*(?:thu|so))?\s*[:.]?\s*(\d{1,2})/)||s.match(/^(\d{1,2})(?:\s*[-–]\s*\d{1,2})?$/);const n=m?+m[1]:null;return n&&n<=53?n:null;};
function weeks(v){if(v===null||v===undefined)return [null,null];const s=fold(v),m=s.match(/(?:tuan|week)?\s*(\d{1,2})\s*[-–—]\s*(\d{1,2})/);if(m){let a=+m[1],b=+m[2];return a>0&&b>=a&&b<=53?[a,b]:[null,null];}const w=week(v);return [w,w];}
const normSubject=v=>fold(v).replace(/[^a-z0-9]+/g,'');
function subjectId(v,available=[]){const f=normSubject(v);if(!f)return null;return (available||[]).find(s=>[s.id,s.name,s.sheetName,...(s.aliases||[])].some(alias=>normSubject(alias)===f))?.id||null;}
// Official fallback totals supplied by teacher. These combined curricula cannot be split by assumption.
const PERIODS_PER_WEEK=Object.freeze({
 tiengviet:Object.freeze({1:12,2:10,3:7,4:7,5:7}),
 toan:Object.freeze({1:3,2:5,3:5,4:5,5:5}),
 ngoaingu:Object.freeze({1:4,2:4,3:4,4:2,5:2}),
 daoduc:Object.freeze({1:1,2:1,3:1,4:1,5:1}),
 tnxh:Object.freeze({1:2,2:2,3:2}),
 lichsuvadiali:Object.freeze({4:2,5:2}),
 khoahoc:Object.freeze({4:2,5:2}),
 tinhoccongnghe:Object.freeze({3:2,4:2,5:2}),
 gdtc:Object.freeze({1:2,2:2,3:2,4:2,5:2}),
 nghethuat:Object.freeze({1:2,2:2,3:2,4:3,5:3}),
 hdtg:Object.freeze({1:3,2:3,3:3,4:3,5:3})
});
const SPLIT_SUBJECTS=new Set(['tinhoc','congnghe','amnhac','mithuat']);
function periodsPerWeek(subject,grade,explicit){
 const fromFile=number(explicit);
 // An explicit single-subject weekly allocation in the document overrides nothing: it is that subject's own timetable.
 if(fromFile)return fromFile;
 if(SPLIT_SUBJECTS.has(subject))return null;
 return PERIODS_PER_WEEK[subject]?.[Number(grade)]||null;
}
function periodRange(v){
 if(v==null)return [null,null];const s=fold(v);let m=s.match(/(?:tiet|ppct|period|thu tu tiet)\s*(?:thu|so)?\s*[:.]?\s*(\d{1,3})\s*[-–—]\s*(\d{1,3})/)||s.match(/^(\d{1,3})\s*[-–—]\s*(\d{1,3})$/);
 if(m){const a=number(m[1]),b=number(m[2]);return a&&b&&b>=a?[a,b]:[null,null];}
 m=s.match(/(?:tiet|ppct|period)\s*(?:thu|so)?\s*[:.]?\s*(\d{1,3})$/)||s.match(/^(\d{1,3})$/);const a=m?number(m[1]):null;return [a,a];
}
function normalizeRecord(raw,ctx={}){
 if(!raw||typeof raw!=='object')return null;
 const lessonName=trim(raw.lessonName??raw.lesson??raw.tenBai??raw.baiHoc??raw.bai);
 if(!lessonName)return null;
 const grade=Number(raw.grade??raw.khoi??ctx.grade)||null;
 const explicitSubject=trim(raw.subjectId||raw.subject||raw.monHoc||'');
 const sid=explicitSubject?(subjectId(explicitSubject,ctx.subjects)||((ctx.subjects||[]).some(s=>s.id===explicitSubject)?explicitSubject:null)):ctx.subjectId||null;
 const w=weeks(raw.week??raw.tuan??null);
 const firstWeek=weeks(raw.weekStart??raw.tuanBatDau??null),lastWeek=weeks(raw.weekEnd??raw.tuanKetThuc??null);
 const weekStart=firstWeek[0]||w[0],weekEnd=lastWeek[1]||firstWeek[1]||w[1]||weekStart;
 const weekEndExplicit=!!(lastWeek[1]||firstWeek[1]&&firstWeek[1]!==firstWeek[0]||w[1]&&w[1]!==w[0]||raw.weekEndExplicit);
 const sessions=Array.isArray(raw.sessions)?raw.sessions.map(s=>({date:date(s.date??s.ngay,ctx.schoolYear),periods:number(s.periods??s.soTiet),week:week(s.week??s.tuan)})).filter(s=>s.date||s.week):[];
 const monthsInput=raw.explicitMonths??raw.months??(raw.month==null?[]:[raw.month]);
 const explicitMonths=Array.isArray(monthsInput)?[...new Set(monthsInput.map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=12))]:[];
 const firstDate=date(raw.startDate??raw.ngayBatDau??raw.date??raw.ngay,ctx.schoolYear);
 const lastDate=date(raw.endDate??raw.ngayKetThuc,ctx.schoolYear)||firstDate;
 let p=number(raw.periods??raw.soTiet??raw.thoiLuong),ps=number(raw.periodStart??raw.tietBatDau),pe=number(raw.periodEnd??raw.tietKetThuc);
 const periodToken=raw.periodRange??raw.thuTuTiet??raw.tietThu??raw.tietPPCT??raw.ordinalPeriod??null;
 if(periodToken!=null){const rg=periodRange(periodToken);ps=ps||rg[0];pe=pe||(rg[1]!==rg[0]?rg[1]:null);}
 // Do not interpret the column 'Số tiết' as an ordinal period.
 if(!p&&ps&&pe&&pe>=ps)p=pe-ps+1;
 if(ps&&p&&!pe)pe=ps+p-1;
 if(pe&&p&&!ps)ps=pe-p+1;
 const weekly=number(raw.weeklyPeriods??raw.tietMoiTuan??raw.soTietMoiTuan??ctx.weeklyPeriods);
 const rawLessonNumber=trim(raw.lessonNumber??raw.soBai??'');
 return {
  id:trim(raw.id)||null, schoolYear:trim(raw.schoolYear||ctx.schoolYear),grade,subjectId:sid,
  topic:trim(raw.topic??raw.chuDe??raw.chuDiem??'')||'Chưa xác định chủ đề',
  lessonNumber:rawLessonNumber,lessonName,periods:p,periodStart:ps,periodEnd:pe,
  weekStart,weekEnd,weekSource:raw.weekSource||(weekStart?'file':null),weekEndExplicit,weeklyPeriods:weekly,
  startDate:firstDate,endDate:lastDate,sessions,focus:trim(raw.focus??raw.trongTam??raw.knowledge??''),
  source:trim(raw.source??ctx.source??''), explicitMonths, scheduleWarning:trim(raw.scheduleWarning??'')
 };
}
function weekdayISO(isoDate,delta=0){const d=new Date(isoDate+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+delta);return d.toISOString().slice(0,10);}
function monday(isoDate){const d=new Date(isoDate+'T00:00:00Z');return weekdayISO(isoDate,1-(d.getUTCDay()||7));}
function getAnchor(records,configured){
 const preferred=configured?date(configured):null;
 const candidates=[];
 for(const r of records){
  for(const sess of r.sessions||[])if(sess.date&&sess.week)candidates.push(weekdayISO(monday(sess.date),-7*(sess.week-1)));
  if(r.weekStart&&r.startDate&&r.weekSource==='file')candidates.push(weekdayISO(monday(r.startDate),-7*(r.weekStart-1)));
 }
 if(!candidates.length)return preferred?{date:monday(preferred),source:'calendar'}:{date:null,source:'missing'};
 const count=new Map();for(const d of candidates)count.set(d,(count.get(d)||0)+1);
 const ranked=[...count].sort((a,b)=>b[1]-a[1]);
 return {date:ranked[0][0],source:ranked.length>1||(preferred&&monday(preferred)!==ranked[0][0])?'derived-conflict':'derived'};
}
// Derive calendar weeks from period ordinals, never from a topic's first lesson.
function enrichRecords(records,ctx={}){
 const output=(records||[]).map((r,i)=>({...r,periods:r.periods??null,periodStart:r.periodStart??null,periodEnd:r.periodEnd??null,weekStart:r.weekStart??null,weekEnd:r.weekEnd??null,weekSource:r.weekSource||((r.weekStart!=null)?'file':null),sourceOrder:i}));
 const groups=new Map();for(const r of output){const key=[r.schoolYear,r.grade,r.subjectId].join('|');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
 for(const list of groups.values()){
  let lastEnd=0;
  const first=list[0];
  // A supplementary file starting at Bài 9 without dates, weeks, ordinals cannot be assumed to begin at period 1.
  let knownStart=!!(first.periodStart||first.periodEnd||first.weekStart===1);
  const firstNo=number(first.lessonNumber);
  if(!knownStart&&!first.weekStart&&(firstNo==null||firstNo===1))knownStart=true;
  for(const r of list){
   const p=number(r.periods),periodRate=periodsPerWeek(r.subjectId,r.grade,r.weeklyPeriods??ctx.weeklyPeriods?.[r.subjectId]);
   if(r.periodStart!=null){const start=number(r.periodStart),end=number(r.periodEnd);if(start&&p&&!end)r.periodEnd=start+p-1;else if(start&&end&&!p)r.periods=end-start+1;if(start)lastEnd=Math.max(lastEnd,r.periodEnd||start);knownStart=true;}
   else if(r.periodEnd&&p){r.periodStart=r.periodEnd-p+1;lastEnd=Math.max(lastEnd,r.periodEnd);knownStart=true;}
   else if(p&&knownStart){r.periodStart=lastEnd+1;r.periodEnd=lastEnd+p;lastEnd=r.periodEnd;r.periodSource='cumulative';}
   else if(!p){r.scheduleWarning=r.scheduleWarning||'Không xác định số tiết; không thể cộng dồn tiết.';}
   else{r.scheduleWarning=r.scheduleWarning||'Tài liệu có thể chỉ là một phần KHDH; thiếu mốc tiết/tuần đầu.';}
   if(!r.weekStart){
    const day=r.sessions?.find(s=>s.date)?.date||r.startDate;
    const configDay=date(ctx.weekOneDate);
    if(day&&configDay){
     const diff=Math.round((Date.parse(monday(day)+'T00:00:00Z')-Date.parse(monday(configDay)+'T00:00:00Z'))/604800000);
     if(diff>=0&&diff<53){
      r.weekStart=diff+1;r.weekEnd=r.weekStart;r.weekSource='date';
      const finalDay=r.endDate||r.sessions?.filter(s=>s.date).at(-1)?.date;
      if(finalDay){const endDiff=Math.round((Date.parse(monday(finalDay)+'T00:00:00Z')-Date.parse(monday(configDay)+'T00:00:00Z'))/604800000);if(endDiff>=diff&&endDiff<53)r.weekEnd=endDiff+1;}
     }
    }
    if(!r.weekStart&&periodRate&&r.periodStart&&r.periodEnd){r.weekStart=Math.ceil(r.periodStart/periodRate);r.weekEnd=Math.ceil(r.periodEnd/periodRate);r.weekSource=r.periodSource==='cumulative'?'cumulative':'period';}
    else if(!r.weekStart&&!periodRate&&SPLIT_SUBJECTS.has(r.subjectId))r.scheduleWarning=r.scheduleWarning||'Phân môn tách riêng: thiếu số tiết/tuần thực tế; không tự chia định mức môn ghép.';
    else if(!r.weekStart&&!periodRate)r.scheduleWarning=r.scheduleWarning||'Không có định mức tiết/tuần phù hợp.';
   } else if(!r.weekEndExplicit&&periodRate&&r.periodStart&&r.periodEnd&&Math.ceil(r.periodStart/periodRate)===r.weekStart){
    r.weekEnd=Math.max(r.weekStart,Math.ceil(r.periodEnd/periodRate));
   }
   if(r.weekStart&&(!r.weekEnd||r.weekEnd<r.weekStart))r.weekEnd=r.weekStart;
   // Date is authoritative for month. Week in the file is authoritative for week numbers.
   if(r.periodStart&&r.periodEnd&&r.periodEnd<r.periodStart){r.scheduleWarning='Thứ tự tiết cuối nhỏ hơn tiết đầu.';r.periodStart=null;r.periodEnd=null;}
   r.id=r.id||[r.schoolYear,r.grade,r.subjectId,fold(r.topic),fold(r.lessonName),r.periodStart??'',r.weekStart??''].join('|');
  }
 }
 const anchor=getAnchor(output,ctx.weekOneDate);
 for(const r of output){r.months=[...new Set(recordMonths(r,anchor.date).map(v=>v.month))].sort((a,b)=>a-b);delete r.sourceOrder;}
 return output;
}
// Return one entry per month. Periods are null where a week straddles months without lesson-day evidence.
function recordMonths(record,anchorDate){
 const hits=new Map(),add=(mon,periods,source,ambiguous=false)=>{
  if(!mon)return;const old=hits.get(mon);
  if(!old)hits.set(mon,{month:mon,periods:periods??null,source,ambiguous});
  else{old.periods=old.periods===null||periods==null?null:old.periods+periods;old.ambiguous=old.ambiguous||ambiguous;old.source=old.source===source?source:old.source+','+source;}
 };
 const sessions=Array.isArray(record.sessions)?record.sessions:[];
 if(sessions.length&&sessions.every(s=>s.date)){
  for(const s of sessions)add(+s.date.slice(5,7),s.periods,'session');
  return [...hits.values()];
 }
 if(record.startDate){
  const start=record.startDate,end=record.endDate||start;
  if(end<start)return [];
  const cur=new Date(start+'T00:00:00Z'),stop=new Date(end+'T00:00:00Z'),mons=new Set();let n=0;
  while(cur<=stop&&n++<367){mons.add(cur.getUTCMonth()+1);cur.setUTCDate(cur.getUTCDate()+1);}
  for(const m of mons)add(m,mons.size===1?record.periods:null,mons.size===1?'date':'date-range-ambiguous',mons.size>1);
  return [...hits.values()];
 }
 if(Array.isArray(record.explicitMonths)&&record.explicitMonths.length){
  for(const m of record.explicitMonths)add(m,record.explicitMonths.length===1?record.periods:null,'source-month',record.explicitMonths.length>1);
  return [...hits.values()];
 }
 if(!record.weekStart||!anchorDate)return [];
 const wStart=record.weekStart,wEnd=Math.min(record.weekEnd||wStart,wStart+52);
 const rate=periodsPerWeek(record.subjectId,record.grade,record.weeklyPeriods);
 const aligned=rate&&record.periodStart&&record.periodEnd&&Math.ceil(record.periodStart/rate)===wStart&&Math.ceil(record.periodEnd/rate)===wEnd;
 const hasPeriodAllocation=!!aligned;
 const weeks=[];
 for(let w=wStart;w<=wEnd;w++){
  const start=weekdayISO(anchorDate,(w-1)*7),days=new Map();
  for(let i=0;i<5;i++){const m=+weekdayISO(start,i).slice(5,7);days.set(m,(days.get(m)||0)+1);}
  weeks.push({w,months:[...days.keys()],crossMonth:days.size>1});
 }
 const allMonths=new Set(weeks.flatMap(w=>w.months));
 // If all weeks have just one shared month, this lesson's complete period count is known for it.
 if(allMonths.size===1){add([...allMonths][0],record.periods,'calendar-week');return [...hits.values()];}
 for(const w of weeks){
  let count=null;
  if(hasPeriodAllocation){const a=Math.max(record.periodStart,(w.w-1)*rate+1),b=Math.min(record.periodEnd,w.w*rate);count=Math.max(0,b-a+1);}
  for(const mon of w.months)add(mon,w.crossMonth?null:count,w.crossMonth?'cross-month-week':'calendar-week',w.crossMonth);
 }
 // If the full period count is known but cannot allocate to weeks, never emit fictitious zero periods.
 return [...hits.values()];
}
function viewMonth(records,month,anchorConfig){
 const anchor=getAnchor(records,anchorConfig),wanted=Number(month),groups=new Map(),unresolved=[];
 for(const r of records){const all=recordMonths(r,anchor.date);if(!all.length){unresolved.push(r);continue;}
  const hits=all.filter(x=>x.month===wanted);if(!hits.length)continue;
  const amount=hits.some(x=>x.periods==null)?null:hits.reduce((n,x)=>n+x.periods,0);
  const name=r.topic||'Chưa xác định chủ đề';if(!groups.has(name))groups.set(name,[]);
  groups.get(name).push({...r,periodsInMonth:amount,confidence:hits.map(x=>x.source).join(','),crossMonth:hits.some(x=>x.ambiguous)});
 }
 const topics=[...groups].map(([name,lessons])=>({name,lessons,periods:lessons.some(x=>x.periodsInMonth==null)?null:lessons.reduce((sum,x)=>sum+x.periodsInMonth,0)}));
 return {topics,unresolved,anchor,month:wanted};
}
function aiContext(view){
 const lines=[];for(const t of view.topics){lines.push(`Chủ đề: ${t.name}`);for(const l of t.lessons){
  lines.push(`- ${l.lessonNumber?`Bài ${l.lessonNumber}: `:''}${l.lessonName}; ${l.weekStart?`tuần ${l.weekStart}${l.weekEnd!==l.weekStart?'-'+l.weekEnd:''}; `:''}${l.periodsInMonth!=null?l.periodsInMonth+' tiết; ':''}${l.crossMonth?'tuần giao tháng, ngày dạy chưa xác định; ':''}${l.focus||''}`);
 }}return lines.join('\n').slice(0,16000);
}
function rowsToRecords(sheetRows,ctx={}){
 const result=[];let headers=null,topic='',lastWeek=null,grade=Number(ctx.grade)||null,weeklyPeriods=null;
 const aliases={subject:/^(mon hoc|mon|phan mon|ten mon)$/,grade:/^(khoi|lop|khoi lop)$/,weekly:/^(so tiet moi tuan|tiet moi tuan|so tiet tuan|tiet tren tuan|so tiet\/tuan|tiet\/tuan)$/,topic:/^(chu de|chu diem|mach noi dung|mach kien thuc)$/,lesson:/^(ten bai|ten bai hoc|bai hoc|noi dung|ten tiet|noi dung day hoc|bai day|ten bai day)$/,week:/^(tuan|tuan hoc|tuan thu|thoi gian|tuan day)$/,periods:/^(so tiet|thoi luong|tong so tiet)$/,periodStart:/^(tiet bat dau|tiet dau|tiet tu|tiet ppct bat dau)$/,periodEnd:/^(tiet ket thuc|tiet cuoi|tiet den|tiet ppct ket thuc)$/,periodRange:/^(thu tu tiet|tiet thu|tiet ppct|tiet theo ppct|phan phoi chuong trinh|so thu tu tiet)$/,date:/^(ngay|ngay day|ngay thuc hien|thoi gian thuc hien)$/,number:/^(bai|bai so|stt|so bai)$/,focus:/^(yeu cau can dat|noi dung trong tam|trong tam|ghi chu)$/};
 for(const sourceRow of sheetRows||[]){const row=Array.isArray(sourceRow)?sourceRow.map(v=>trim(v)):[];const filled=row.filter(Boolean);if(!filled.length)continue;
  const joined=filled.join(' '),normalized=row.map(fold);
  const configured=fold(joined),configMatch=configured.match(/(?:so\s*)?tiet\s*(?:moi|\/|tren)\s*tuan\s*[:=]?\s*(\d{1,2})/)||configured.match(/(\d{1,2})\s*tiet\s*(?:\/|moi|tren)\s*tuan/);
  if(configMatch){weeklyPeriods=number(configMatch[1]);continue;}
  const gradeMatch=fold(joined).match(/(?:khoi|lop)\s*([1-5])\b/);if(gradeMatch)grade=+gradeMatch[1];
  const detected={};for(const [field,re] of Object.entries(aliases)){const i=normalized.findIndex(v=>re.test(v));if(i>=0)detected[field]=i;}
  if(detected.lesson!==undefined && Object.keys(detected).some(k=>!['lesson','number'].includes(k))){headers=detected;continue;}
  if(!headers){
   const wk=weeks(joined);if(/(?:tuần|tuan)\s*\d+/i.test(joined)&&wk[0])lastWeek=wk;
   const top=joined.match(/^(?:chủ đề|chủ điểm)\s*(?:\d+\s*[:.\-–])?\s*(.+)$/i);if(top){topic=trim(top[1]);continue;}
   const direct=joined.match(/^(?:bài|bai)\s*(\d{1,3})\s*[:.\-–]\s*(.+)$/i);
   if(direct){const n=number(joined.match(/(\d+)\s*tiết/i)?.[1]);const name=direct[2].replace(/\s+\d+\s*tiết.*$/i,'');const range=periodRange(joined);const rec=normalizeRecord({grade,lessonName:name,lessonNumber:direct[1],topic,weekStart:lastWeek?.[0],weekEnd:lastWeek?.[1],periods:n,periodStart:range[0],periodEnd:range[1]!==range[0]?range[1]:null,weeklyPeriods},ctx);if(rec)result.push(rec);}
   continue;
  }
  const c=field=>headers[field]!==undefined?row[headers[field]]||'':'';
  if(!c('lesson')){if(c('topic'))topic=c('topic');if(c('week'))lastWeek=weeks(c('week'));continue;}
  const currentTopic=c('topic')||topic,wr=weeks(c('week'));
  if(currentTopic)topic=currentTopic;
  const dateTokens=c('date').match(/\d{1,2}\s*[\/.\-]\s*\d{1,2}(?:\s*[\/.\-]\s*20\d{2})?/g)||[];
  const startDate=date(dateTokens[0]||c('date'),ctx.schoolYear),endDate=date(dateTokens[1],ctx.schoolYear);
  const range=periodRange(c('periodRange'));
  const rec=normalizeRecord({topic,grade:number(c('grade'))||grade,subject:c('subject')||undefined,lessonName:c('lesson'),lessonNumber:c('number'),periods:c('periods'),periodStart:c('periodStart')||range[0],periodEnd:c('periodEnd')||(range[1]!==range[0]?range[1]:null),weekStart:wr[0]||lastWeek?.[0],weekEnd:wr[1]||lastWeek?.[1],startDate,endDate,weeklyPeriods:number(c('weekly'))||weeklyPeriods,focus:c('focus')},ctx);
  if(rec)result.push(rec);if(wr[0])lastWeek=wr;
 }
 return result;
}
function mergeUnique(records){const seen=new Set();return (records||[]).filter(r=>{const key=[r.schoolYear,r.grade,r.subjectId,fold(r.topic),fold(r.lessonName),r.lessonNumber||'',r.periodStart||'',r.weekStart||'',r.startDate||''].join('|');if(seen.has(key))return false;seen.add(key);return true;});}
root.KHDHStructured={PERIODS_PER_WEEK,periodsPerWeek,date,week,weeks,periodRange,number,normalizeRecord,subjectId,getAnchor,recordMonths,viewMonth,aiContext,rowsToRecords,mergeUnique,enrichRecords,fold};
})(typeof window!=='undefined'?window:globalThis);
