/* Import/export KHDH JSON. Strict, synchronous validation; no AI calls or student-data changes. */
(function(root){
'use strict';
const core=()=>{if(!root.KHDHStructured)throw Error('Bộ xử lý lịch KHDH chưa được tải.');return root.KHDHStructured;};
const clean=v=>String(v??'').trim();
const norm=v=>core().fold(v).replace(/[^a-z0-9]/g,'');
const ALIASES=Object.freeze({
 tiengviet:['tieng viet','tieng-viet','tv'],toan:['toan'],
 tnxh:['tu nhien va xa hoi','tu nhien xa hoi','tnxh'],
 lichsuvadiali:['lich su va dia li','lich su va dia ly','lich su dia li','lich su - dia li','lsdl'],
 khoahoc:['khoa hoc'],ngoaingu:['ngoai ngu','ngoai ngu 1','tieng anh','english'],
 daoduc:['dao duc'],hdtg:['hoat dong trai nghiem','hdtn','hdtn-hn'],
 gdtc:['giao duc the chat','the duc','gdtc'],
 tinhoc:['tin hoc','th-cn (tin hoc)','thcn tin hoc'],
 congnghe:['cong nghe','th-cn (cong nghe)','thcn cong nghe'],
 amnhac:['am nhac','nghe thuat am nhac','nghe thuat (am nhac)'],
 mithuat:['mi thuat','my thuat','nghe thuat mi thuat','nghe thuat (mi thuat)']
});
function resolveSubject(source,available){
 const s=clean(source),f=norm(s);if(!f)return null;
 const direct=core().subjectId(s,available);
 if(direct)return direct;
 for(const [id,aliases] of Object.entries(ALIASES))if([id,...aliases].some(v=>norm(v)===f)&&available.some(x=>x.id===id))return id;
 return null;
}
function gradeValue(v,label){
 const raw=clean(v),match=raw.match(/^(?:khối|khoi|lớp|lop)?\s*([1-5])$/i);
 if(!match)throw Error(`${label}: thiếu hoặc sai khối lớp (phải từ 1 đến 5).`);
 return Number(match[1]);
}
function positive(v,label,max=500){
 if(v===undefined||v===null||v==='')return null;
 const text=clean(v);if(!/^\d+$/.test(text)||Number(text)<1||Number(text)>max)throw Error(`${label}: phải là số nguyên từ 1 đến ${max}.`);
 return Number(text);
}
function monthValue(v,label){const n=positive(v,label,12);if(n===null)throw Error(`${label}: tháng không hợp lệ.`);return n;}
function dateValue(v,label,sy){if(v===undefined||v===null||v==='')return null;const d=core().date(v,sy);if(!d)throw Error(`${label}: ngày không hợp lệ (dùng YYYY-MM-DD).`);return d;}
function yearValue(v,defaultYear,label){const s=clean(v||defaultYear),m=s.match(/^(20\d{2})\s*[-–/]\s*(20\d{2})$/);if(!m||+m[2]!==+m[1]+1)throw Error(`${label}: năm học không hợp lệ (ví dụ 2026-2027).`);return `${m[1]}-${m[2]}`;}
function validateKHDHJson(data,ctx={}){
 const available=ctx.subjects||[];
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('JSON phải là một đối tượng có grade, subject và topics hoặc subjects.');
 if(!available.length)throw Error('Chưa có danh sách môn học để đối chiếu JSON.');
 const globalYear=yearValue(data.schoolYear,ctx.schoolYear,'JSON');
 const groups=Array.isArray(data.subjects)?data.subjects:[data];
 if(!groups.length)throw Error('JSON không có môn học trong subjects.');
 const records=[],warnings=[];
 for(let si=0;si<groups.length;si++){
  const group=groups[si];if(!group||typeof group!=='object'||Array.isArray(group))throw Error(`Môn thứ ${si+1}: không đúng cấu trúc.`);
  const year=yearValue(group.schoolYear,globalYear,`Môn thứ ${si+1}`);
  const grade=gradeValue(group.grade??data.grade,`Môn thứ ${si+1}`);
  const fromId=group.subjectId?resolveSubject(group.subjectId,available):null;
  const fromName=group.subject?resolveSubject(group.subject,available):null;
  if(group.subjectId&&!fromId)throw Error(`Không nhận diện được mã môn "${clean(group.subjectId)}".`);
  if(group.subject&&!fromName)throw Error(`Không nhận diện được môn "${clean(group.subject)}".`);
  if(fromId&&fromName&&fromId!==fromName)throw Error(`Môn "${group.subject}" không khớp subjectId "${group.subjectId}".`);
  const subjectId=fromId||fromName;
  if(!subjectId)throw Error(`Môn thứ ${si+1}: Thiếu thông tin môn học.`);
  const topics=group.topics;
  if(!Array.isArray(topics))throw Error(`Môn ${group.subject||group.subjectId}: thiếu mảng topics.`);
  if(!topics.length){warnings.push(`Môn ${group.subject||group.subjectId} không có bài học, bỏ qua và giữ KHDH cũ.`);continue;}
  for(let ti=0;ti<topics.length;ti++){
   const topic=topics[ti],topicLabel=`${group.subject||group.subjectId}, chủ đề ${ti+1}`;
   if(!topic||typeof topic!=='object'||Array.isArray(topic))throw Error(`${topicLabel}: dữ liệu không hợp lệ.`);
   const topicName=clean(topic.topicName??topic.name??topic.topic??topic.chuDe);
   if(!topicName)throw Error(`${topicLabel}: thiếu tên Chủ đề.`);
   if(!Array.isArray(topic.lessons)||!topic.lessons.length)throw Error(`Chủ đề "${topicName}": chưa có danh sách bài học.`);
   for(let li=0;li<topic.lessons.length;li++){
    const lesson=topic.lessons[li],label=`Chủ đề "${topicName}", bài ${li+1}`;
    if(!lesson||typeof lesson!=='object'||Array.isArray(lesson))throw Error(`${label}: dữ liệu không hợp lệ.`);
    const name=clean(lesson.lessonName??lesson.name??lesson.tenBai);
    if(!name)throw Error(`${label}: thiếu tên bài học.`);
    const itemLabel=`Bài "${name}"`;
    const p=positive(lesson.periods??lesson.soTiet,`${itemLabel} - số tiết`),start=positive(lesson.periodStart,`${itemLabel} - tiết đầu`),end=positive(lesson.periodEnd,`${itemLabel} - tiết cuối`);
    if(start&&end&&end<start)throw Error(`${itemLabel}: tiết kết thúc nhỏ hơn tiết bắt đầu.`);
    if(!p&&!(start&&end))throw Error(`${itemLabel} chưa có số tiết hoặc thứ tự tiết bắt đầu/kết thúc.`);
    if(p&&start&&end&&end-start+1!==p)throw Error(`${itemLabel}: số tiết không khớp khoảng tiết ${start}–${end}.`);
    const ws=positive(lesson.weekStart,`${itemLabel} - tuần đầu`,53),we=positive(lesson.weekEnd,`${itemLabel} - tuần cuối`,53);
    if(we&&!ws)throw Error(`${itemLabel}: thiếu tuần bắt đầu.`);
    if(ws&&we&&we<ws)throw Error(`${itemLabel}: tuần kết thúc nhỏ hơn tuần bắt đầu.`);
    const startDate=dateValue(lesson.startDate??lesson.date,`${itemLabel} - ngày bắt đầu`,year),endDate=dateValue(lesson.endDate,`${itemLabel} - ngày kết thúc`,year);
    if(startDate&&endDate&&endDate<startDate)throw Error(`${itemLabel}: ngày kết thúc trước ngày bắt đầu.`);
    if(endDate&&!startDate)throw Error(`${itemLabel}: thiếu ngày bắt đầu.`);
    let explicitMonths=[];
    if(lesson.month!==undefined&&lesson.month!==null&&lesson.month!=='')explicitMonths.push(monthValue(lesson.month,`${itemLabel} - tháng`));
    if(lesson.months!==undefined&&lesson.months!==null){
     if(!Array.isArray(lesson.months))throw Error(`${itemLabel}: months phải là mảng tháng.`);
     explicitMonths.push(...lesson.months.map(v=>monthValue(v,`${itemLabel} - tháng`)));
    }
    if(lesson.explicitMonths!==undefined&&lesson.explicitMonths!==null){
     if(!Array.isArray(lesson.explicitMonths))throw Error(`${itemLabel}: explicitMonths phải là mảng.`);
     explicitMonths.push(...lesson.explicitMonths.map(v=>monthValue(v,`${itemLabel} - tháng`)));
    }
    explicitMonths=[...new Set(explicitMonths)];
    const sessions=[];
    if(lesson.sessions!==undefined&&lesson.sessions!==null){
     if(!Array.isArray(lesson.sessions))throw Error(`${itemLabel}: sessions phải là mảng.`);
     for(let ix=0;ix<lesson.sessions.length;ix++){
      const session=lesson.sessions[ix],label=`${itemLabel}, buổi ${ix+1}`;
      if(!session||typeof session!=='object'||Array.isArray(session))throw Error(`${label}: dữ liệu sai.`);
      const sd=dateValue(session.date,label,year),sp=positive(session.periods,`${label} - số tiết`),sw=positive(session.week,`${label} - tuần`,53);
      if(!sd&&!sw)throw Error(`${label}: cần ngày dạy hoặc tuần.`);
      sessions.push({date:sd,periods:sp,week:sw});
     }
    }
    const record=core().normalizeRecord({...lesson,grade,schoolYear:year,subjectId,topic:topicName,lessonName:name,periods:p||undefined,periodStart:start||undefined,periodEnd:end||undefined,weekStart:ws||undefined,weekEnd:we||undefined,startDate:startDate||undefined,endDate:endDate||undefined,sessions,explicitMonths,source:ctx.source||'JSON'},
      {schoolYear:year,grade,subjectId,subjects:available,source:ctx.source||'JSON'});
    if(!record)throw Error(`${itemLabel}: không thể chuẩn hóa dữ liệu.`);
    record.explicitMonths=explicitMonths;
    records.push(record);
   }
  }
 }
 if(!records.length)throw Error('JSON chưa có bài học hợp lệ để nhập; KHDH hiện tại được giữ nguyên.');
 return {records,warnings,groupCount:new Set(records.map(r=>`${r.schoolYear}|${r.grade}|${r.subjectId}`)).size};
}
function exportKHDHJson(doc,subjectName){
 if(!doc||!Array.isArray(doc.records)||!doc.records.length)throw Error('Chưa có KHDH cấu trúc để xuất JSON.');
 const topics=new Map();
 for(const record of doc.records){
  const topic=clean(record.topic)||'Chưa xác định chủ đề';if(!topics.has(topic))topics.set(topic,[]);
  const l={};
  for(const key of ['lessonNumber','lessonName','periods','periodStart','periodEnd','weekStart','weekEnd','startDate','endDate','focus','weeklyPeriods','sessions']){
   const val=record[key];if(val!==null&&val!==undefined&&val!==''&&(!Array.isArray(val)||val.length))l[key]=val;
  }
  if(Array.isArray(record.explicitMonths)&&record.explicitMonths.length)l.months=record.explicitMonths;
  topics.get(topic).push(l);
 }
 return {schoolYear:doc.schoolYear,grade:doc.grade,subjectId:doc.subjectId,subject:subjectName,topics:[...topics].map(([topicName,lessons])=>({topicName,lessons}))};
}
root.KHDHJson={validateKHDHJson,resolveSubject,exportKHDHJson};
})(typeof window!=='undefined'?window:globalThis);
