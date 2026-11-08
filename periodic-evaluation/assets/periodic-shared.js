/* Periodic subject evaluation: one source of KHDH truth and no comment bank. */
(function(root){
'use strict';
const bridge=()=>{
  try{const b=root.parent?.__GVCNPeriodicKHDHBridge;if(b)return b;}catch(_){}
  throw Error('Không kết nối được KHDH dùng chung. Vui lòng mở phân hệ từ ứng dụng GVCN.');
};
const grade=v=>Number(String(v).match(/[1-5]/)?.[0])||null;
const periodCodes={'Giữa kì 1':'GK1','Cuối kì 1':'CK1','Giữa kì 2':'GK2','Cuối kì 2':'CK2'};
function levelCode(value){
 const v=String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toUpperCase().replace(/\s+/g,' ').trim();
 if(['T','TOT','HTT','HOAN THANH TOT'].includes(v))return 'T';
 if(['D','H','DAT','HT','HOAN THANH'].includes(v))return 'D';
 if(['C','CHT','CHUA DAT','CHUA HOAN THANH'].includes(v))return 'C';
 return '';
}
function classCode(v){const code=String(v||'').replace(/^\s*(lớp|lop)\s*/i,'').replace(/\s+/g,'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9]/g,'').toUpperCase();return /^[1-5][A-Z][A-Z0-9]*$/.test(code)?code:'';}
function code({subject,period,level,className,studentOrder}){
 const sc=bridge().subjectCode(subject),pc=periodCodes[period]||period,lc=levelCode(level),cl=classCode(className),n=Number(studentOrder);
 return sc&&['GK1','CK1','GK2','CK2'].includes(pc)&&lc&&cl&&Number.isInteger(n)&&n>0 ? `${sc}${pc}${lc}${cl}${n}` : '';
}
function cleanComment(value){return String(value||'').trim().replace(/\s+/g,' ');}
function normalize(value){return cleanComment(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase();}
function validateComment(value,existing=[]){
 const text=cleanComment(value),plain=normalize(text);
 if(!text)return 'Chưa có nội dung';
 if(text.length>250)return 'Vượt quá 250 ký tự';
 const pronouns=[...text.matchAll(/(^|[\s.,;:!?"“”()])(em|con|bạn|cháu|học sinh)(?=$|[\s.,;:!?"“”()])/giu)];
 if(pronouns.some(x=>!((x[2].toLowerCase()==='con'&&/^(con đường|con số)(?:\s|[.,;:]|$)/iu.test(text.slice(x.index+x[1].length)))||(x[2].toLowerCase()==='bạn'&&/^bạn bè(?:\s|[.,;:]|$)/iu.test(text.slice(x.index+x[1].length))))))return 'Có đại từ xưng hô';
 if(/^nắm(?:\s|$)/iu.test(text))return 'Mở đầu bằng “Nắm”';
 if(/\b(khdh|kế hoạch dạy học|điểm\s*\d+|\d+\/10)\b/iu.test(text))return 'Lộ dữ liệu kỹ thuật';
 if(!/[;.]\s*\S/.test(text))return 'Thiếu định hướng tiếp tục duy trì hoặc củng cố';
 if(existing.some(x=>normalize(x)===plain))return 'Trùng nhận xét';
 return '';
}
const defaultCutoffs=()=>({GK1:9,CK1:18,GK2:27,CK2:35});
function cutoffValues(){
 try{return {...defaultCutoffs(),...JSON.parse(root.localStorage.getItem('gvcn_periodic_cutoff_weeks_v1')||'{}')};}
 catch{return defaultCutoffs();}
}
function setCutoff(period,value){
 const n=Number(value),cutoffs=cutoffValues();if(!Number.isInteger(n)||n<1||n>53)throw Error('Tuần phải từ 1 đến 53.');
 cutoffs[period]=n;root.localStorage.setItem('gvcn_periodic_cutoff_weeks_v1',JSON.stringify(cutoffs));
}
const context=(g,subject,term)=>bridge().context({grade:grade(g),subject,period:term,cutoffs:cutoffValues()});
const importKHDH=(file,ctx)=>bridge().importFile(file,{grade:grade(ctx.grade),subject:ctx.subject});
function classify(data,{subject,term,grade:gradeLabel,className}){
 const g=grade(gradeLabel),rows=(data||[]).map((row,index)=>{
  const resolvedClass=className||bridge().className();const stt=index+1;
  const level=levelCode(row.mucDo); // Periodic levels are explicit: never infer from a score or regular-evaluation data.
  return {...row,stt,level,maNhanXet:code({subject,period:term,level,className:resolvedClass,studentOrder:stt})};
 });
 return rows;
}
async function generate({rows,subject,grade:gradeLabel,term,className,apiKey,onBatch,onlyOrders=null,force=false}){
 if(!apiKey)throw Error('Chưa cấu hình Gemini API.');
 const knowledge=context(gradeLabel,subject,term);
 if(!knowledge.lessonCount)throw Error(`Chưa có bài học KHDH phù hợp ${subject} · ${term}. Hãy Nhập KHDH hoặc kiểm tra tuần kết thúc giai đoạn.`);
 const inputs=classify(rows,{subject,term,grade:gradeLabel,className});
 const allowed=Array.isArray(onlyOrders)?new Set(onlyOrders.map(Number)):null;
 const active=inputs.filter(x=>(!allowed||allowed.has(x.stt))&&x.level&&(force||x.needsRegenerate||!x.noiDung||validateComment(x.noiDung)));
 const used=inputs.filter(x=>x.noiDung&&!validateComment(x.noiDung)&&(!force||!active.some(a=>a.stt===x.stt))).map(x=>x.noiDung);
 const queue=[];for(let i=0;i<active.length;i+=5)queue.push(active.slice(i,i+5));
 const changes=new Map(),errors=[];let ptr=0;
 const request=async items=>{
  const contextText=knowledge.text;
  const idKey=i=>String(i.maDinhDanh||i.id||`stt-${i.stt}`);
  const prompt=`KHỐI: ${knowledge.grade}; MÔN: ${subject}; GIAI ĐOẠN: ${knowledge.period} (tuần ${knowledge.weekStart}–${knowledge.weekEnd}).\nKHDH ĐÃ HỌC:\n${contextText}\nHỌC SINH (chỉ dùng studentId, KHÔNG ghi tên):\n${JSON.stringify(items.map(x=>({studentId:idKey(x),evaluationLevel:x.level,score:x.diem||null,previousComment:x.noiDung||''})))}\nYêu cầu tạo 1 nhận xét riêng, cụ thể cho từng studentId, chỉ dựa KHDH trên. Không thêm kiến thức khác. Chỉ xuất JSON mảng [{studentId,comment}].`;
  const resp=await fetch('/api/gemini',{method:'POST',headers:{'Content-Type':'application/json','x-gemini-api-key':apiKey},body:JSON.stringify({action:'periodic-evaluation-batch',prompt})});
  const json=await resp.json();if(!resp.ok||!json.ok)throw Error(json.error||'Gemini trả lỗi');
  if(!Array.isArray(json.result))throw Error('Gemini không trả danh sách.');
  return json.result;
 };
 const worker=async()=>{for(;;){const batch=queue[ptr++];if(!batch)return;
  let results=[];try{results=await request(batch);}catch(err){errors.push(err.message);continue;}
  for(const student of batch){
   const key=String(student.maDinhDanh||student.id||`stt-${student.stt}`);
   let result=results.find(x=>String(x.studentId)===key);
   let candidate=cleanComment(result?.comment);let issue=validateComment(candidate,[...used,...changes.values()]);
   // Retry only this student's invalid output; never regenerate the entire class.
   for(let retry=0;issue && retry<2;retry++){
    try{const fresh=await request([student]);candidate=cleanComment(fresh.find(x=>String(x.studentId)===key)?.comment);issue=validateComment(candidate,[...used,...changes.values()]);}
    catch(err){issue=err.message;}
   }
   if(issue){errors.push(`STT ${student.stt}: ${issue}`);continue;}
   changes.set(student.stt,candidate);used.push(candidate);
  }
  if(onBatch)onBatch(changes.size,errors.length);
 }};
 await Promise.all([worker(),worker()]);
 const updated=inputs.map(x=>changes.has(x.stt)?{...x,noiDung:changes.get(x.stt),needsRegenerate:false}:x);
 return {rows:updated,updated:changes.size,errors};
}
root.GVCNPeriodicEnhancement={grade,code,levelCode,context,importKHDH,cutoffValues,setCutoff,classify,generate,validateComment};
})(window);
