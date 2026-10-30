/* GVCN PRO - KHDH có cấu trúc. Chỉ hoạt động trong Nhập đánh giá thường xuyên.
 * Dữ liệu: state.regularEvaluation.khdhDocuments[schoolYear|grade|subjectId].
 * Không can thiệp hồ sơ học sinh, điểm, đánh giá hay KHDH văn bản trước đây.
 */
(function () {
    'use strict';
    const runtime=window.regularKHDHRuntime||(window.regularKHDHRuntime={view:'month',from:0,to:0,expanded:{}});
    const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
    const norm=v=>clean(v).replace(/[đĐ]/g,'d').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const integer=(value,min=0,max=9999)=>value!==null&&value!==undefined&&String(value).trim()!==''&&Number.isInteger(Number(value))&&Number(value)>=min&&Number(value)<=max?Number(value):null;
    const yearStart=()=>{const y=String(regularEvalSchoolYear()).match(/(?:19|20)\d{2}/);return y?Number(y[0]):new Date().getFullYear();};
    const currentKey=()=>{const s=regularEvalState().settings;return [regularEvalSchoolYear(),s.grade,s.subjectId].join('|');};
    const monthKey=()=>String(Number(regularEvalState().settings.month));
    const currentDoc=()=>regularEvalState().khdhDocuments?.[currentKey()]||null;
    const dateKey=raw=>{
        if(!raw)return null;
        const text=clean(raw),iso=text.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})/),vn=text.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?$/);
        let year,month,day;
        if(iso){year=Number(iso[1]);month=Number(iso[2]);day=Number(iso[3]);}
        else if(vn){day=Number(vn[1]);month=Number(vn[2]);year=vn[3]?Number(vn[3]):0;if(year&&year<100)year+=2000;if(!year)year=month>=8?yearStart():yearStart()+1;}
        else return null;
        const d=new Date(Date.UTC(year,month-1,day));return d.getUTCFullYear()===year&&d.getUTCMonth()===month-1&&d.getUTCDate()===day?d.toISOString().slice(0,10):null;
    };
    const fromDate=iso=>new Date(`${iso}T00:00:00Z`);
    const plusDays=(iso,amount)=>{const d=fromDate(iso);d.setUTCDate(d.getUTCDate()+amount);return d.toISOString().slice(0,10);};
    const monthRange=m=>{const year=Number(m)>=8?yearStart():yearStart()+1;return {from:`${year}-${String(m).padStart(2,'0')}-01`,to:new Date(Date.UTC(year,Number(m),0)).toISOString().slice(0,10)};};
    const intersects=(a,b,range)=>!!a&&!!b&&a<=range.to&&b>=range.from;
    const weekConfigKey=()=>`${regularEvalSchoolYear()}|${regularEvalState().settings.grade}`;
    const week1Start=()=>dateKey(regularEvalState().settings.khdhWeekOne?.[weekConfigKey()]||'');
    function weekDates(week){const first=week1Start();return first&&integer(week,1,60)?[plusDays(first,(Number(week)-1)*7),plusDays(first,(Number(week)-1)*7+6)]:null;}
    // So khớp theo ngày chính xác trước, sau đó theo lịch tuần được giáo viên cấu hình.
    // Nếu thiếu mốc lịch, trạng thái luôn là không chắc chắn, tuyệt đối không tự gán tháng 9=tuần 1..4.
    function classify(lesson,month=Number(monthKey())){
        const range=monthRange(month);
        const days=(lesson.dates||[]).map(dateKey).filter(Boolean);
        if(days.length){return {status:days.some(d=>d>=range.from&&d<=range.to)?'yes':'no',ambiguous:false,method:'Ngày học thực tế'};}
        const a=dateKey(lesson.startDate),b=dateKey(lesson.endDate)||a;
        if(a){const yes=intersects(a,b,range);return {status:yes?'yes':'no',ambiguous:yes&&a.slice(0,7)!==b.slice(0,7),method:'Ngày thực hiện'};}
        const ws=integer(lesson.weekStart,1,60),we=integer(lesson.weekEnd,1,60)||ws;
        if(ws){const first=weekDates(ws),last=weekDates(Math.max(ws,we));
            if(first&&last){const yes=intersects(first[0],last[1],range);const crossing=yes&&(first[0]<range.from||last[1]>range.to);
                return {status:yes?'yes':'no',ambiguous:crossing,method:crossing?'Tuần giao tháng (kiểm tra ngày dạy)':'Lịch tuần'};
            }
        }
        return {status:'unknown',ambiguous:true,method:'Chưa đủ ngày thực hiện hoặc ngày bắt đầu tuần 1'};
    }
    function activeIds(doc,month=monthKey()){
        if(!doc)return new Set();
        const saved=doc.selections?.[String(month)];
        if(Array.isArray(saved))return new Set(saved.map(String));
        return new Set(doc.topics.flatMap(t=>t.lessons.filter(l=>classify(l,Number(month)).status==='yes').map(l=>l.id)));
    }
    function allLessons(doc){return (doc?.topics||[]).flatMap(topic=>topic.lessons||[]);}
    function selectedContext(){
        const doc=currentDoc();
        if(!doc)return regularEvalState().khdhMap?.[regularEvalKhdhKey()]||''; // tương thích dữ liệu cũ
        const ids=activeIds(doc),lines=[];
        for(const topic of doc.topics){
            const lessons=topic.lessons.filter(l=>ids.has(l.id));
            if(lessons.length){lines.push(`Chủ đề: ${topic.name}`);for(const l of lessons){lines.push(`- ${l.lessonNumber?`Bài ${l.lessonNumber}: `:''}${l.lessonName}${l.focus?`; trọng tâm: ${l.focus}`:''}${l.weekStart?`; tuần ${l.weekStart}${l.weekEnd&&l.weekEnd!==l.weekStart?`–${l.weekEnd}`:''}`:''}`);}}
        }
        return lines.join('\n');
    }
    window.regularEvalSelectedKHDHContext=selectedContext;
    function periodsFromProgramOrder(value){
        const text=norm(value).replace(/tiet|ppct|so|thu|tu/g,'').trim();
        const match=text.match(/^(\d{1,3})\s*[-–]\s*(\d{1,3})$/);
        if(match&&Number(match[2])>=Number(match[1])&&Number(match[2])-Number(match[1])<50)return Number(match[2])-Number(match[1])+1;
        if(/^(?:\d{1,3}\s*[,;]\s*)+\d{1,3}$/.test(text))return new Set(text.split(/[,;]/).map(x=>x.trim())).size;
        if(/^\d{1,3}$/.test(text))return 1;
        return null;
    }
    function normalizeDocument(raw,sourceName,subjectId,grade){
        if(!raw||typeof raw!=='object'||!Array.isArray(raw.topics))throw new Error('AI chưa trả JSON gồm topics và lessons.');
        const inferred=raw.subject?regularEvalSubjectFromSheetName(raw.subject):null;
        if(inferred&&inferred.id!==subjectId)throw new Error(`KHDH thuộc môn ${raw.subject}, không phải môn đang chọn.`);
        const givenGrade=integer(raw.grade,1,12);
        if(givenGrade&&Number(grade)!==givenGrade)throw new Error(`KHDH ghi khối ${givenGrade}, đang chọn khối ${grade}.`);
        const topics=[],used=new Set();let count=0;
        for(const input of raw.topics){
            const name=clean(input?.name||input?.topic||'Chủ đề khác');if(!Array.isArray(input?.lessons))continue;
            const lessons=[];
            for(const lesson of input.lessons){
                if(!lesson||typeof lesson!=='object')continue;
                const lessonName=clean(lesson.lessonName||lesson.name);if(!lessonName)continue;
                const ws=integer(lesson.weekStart,1,60),we=integer(lesson.weekEnd,1,60)||ws;
                if(ws&&we<ws)throw new Error(`Bài “${lessonName}” có tuần kết thúc trước tuần bắt đầu.`);
                const dates=(Array.isArray(lesson.dates)?lesson.dates:[]).map(dateKey).filter(Boolean);
                const startDate=dateKey(lesson.startDate),endDate=dateKey(lesson.endDate);
                if(startDate&&endDate&&endDate<startDate)throw new Error(`Ngày kết thúc trước ngày bắt đầu: ${lessonName}.`);
                const lessonNumber=integer(lesson.lessonNumber,0,1000);
                const seq=clean(lesson.programOrder||lesson.periodNumbers||'');
                const periods=integer(lesson.periods,1,100)||periodsFromProgramOrder(seq);
                const identity=[name,lessonName,lessonNumber??'',ws??'',we??'',seq].map(norm).join('|');
                if(used.has(identity))continue;
                used.add(identity);
                const existing=lessonNumber!==null?lessons.find(item=>item.lessonNumber===lessonNumber&&norm(item.lessonName)===norm(lessonName)):null;
                // Khi PPCT tách cùng Bài N thành nhiều dòng/tuần: gộp đúng bài, cộng tiết theo PPCT khác nhau.
                if(existing){
                    if(periods&&seq&&existing.programOrder&&seq!==existing.programOrder)existing.periods=(existing.periods||0)+periods;
                    else if(periods&&!existing.periods)existing.periods=periods;
                    if(ws)existing.weekStart=existing.weekStart?Math.min(existing.weekStart,ws):ws;
                    if(we)existing.weekEnd=Math.max(existing.weekEnd||we,we);
                    if(startDate)existing.startDate=!existing.startDate||startDate<existing.startDate?startDate:existing.startDate;
                    if(endDate)existing.endDate=!existing.endDate||endDate>existing.endDate?endDate:existing.endDate;
                    existing.dates=[...new Set([...existing.dates,...dates])].sort();
                    if(seq&&!existing.programOrder.includes(seq))existing.programOrder=[existing.programOrder,seq].filter(Boolean).join('; ');
                    const focus=clean(lesson.focus||lesson.objectives||'');
                    if(focus&&!existing.focus.includes(focus))existing.focus=[existing.focus,focus].filter(Boolean).join('; ');
                    continue;
                }
                lessons.push({id:`kh-${++count}`,subjectId,grade:Number(grade),topic:name,lessonNumber,lessonName,periods,
                    weekStart:ws,weekEnd:we,startDate,endDate,dates,programOrder:seq,
                    focus:clean(lesson.focus||lesson.objectives||''),notes:clean(lesson.notes||'')});
            }
            if(lessons.length)topics.push({id:`topic-${topics.length+1}`,name,lessons});
        }
        if(!topics.length)throw new Error('Không tìm được bài học hợp lệ trong JSON. Giữ nguyên KHDH đã lưu.');
        return {version:2,schoolYear:regularEvalSchoolYear(),subjectId,grade:Number(grade),sourceName,
            sourceSubject:clean(raw.subject),sourceGrade:givenGrade,uploadedAt:new Date().toISOString(),
            topics,selections:{},notes:clean(raw.notes||'')};
    }
    function extractJson(text){
        const source=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'');
        try{return JSON.parse(source);}catch{}
        const a=source.indexOf('{'),z=source.lastIndexOf('}');
        if(a<0||z<=a)throw new Error('AI trả dữ liệu không phải JSON.');
        return JSON.parse(source.slice(a,z+1));
    }
    // Giữ nguyên thứ tự trang, bảng, Sheet và nhãn dòng; không cắt dữ liệu trước khi chia đoạn.
    async function readDocument(file){
        const lower=file.name.toLowerCase();
        if(/\.(xlsx|xls)$/i.test(lower)){
            const XLSX=await regularEvalEnsureXLSX(),wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
            const chunks=[];
            for(const name of wb.SheetNames){
                const matrix=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:'',raw:false,blankrows:false});
                chunks.push(`=== SHEET ${name} ===\n${matrix.map((row,i)=>`Dòng ${i+1}: ${row.map(v=>clean(v)).join(' | ')}`).join('\n')}`);
            }
            return {text:chunks.join('\n\n'),sections:chunks,source:'Excel'};
        }
        if(/\.docx$/i.test(lower)){
            const mammoth=await regularEvalLoadScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js','mammoth');
            const html=(await mammoth.convertToHtml({arrayBuffer:await file.arrayBuffer()})).value;
            const container=document.createElement('div');container.innerHTML=html;
            const lines=[];
            const walk=node=>{
                if(node.nodeType===3)return clean(node.textContent);
                if(node.nodeType!==1)return '';
                const tag=node.tagName.toLowerCase();
                if(tag==='table'){
                    lines.push('=== BẢNG WORD ===');
                    [...node.querySelectorAll('tr')].forEach((row,i)=>{lines.push(`Dòng ${i+1}: ${[...row.children].map(cell=>clean(cell.textContent)).join(' | ')}`);});
                    return '';
                }
                if(['p','h1','h2','h3','h4','li'].includes(tag)){const t=clean(node.textContent);if(t)lines.push(t);return '';}
                [...node.childNodes].forEach(walk);return '';
            };
            [...container.childNodes].forEach(walk);
            return {text:lines.join('\n'),sections:[lines.join('\n')],source:'Word'};
        }
        if(/\.doc$/i.test(lower)){
            if(file.size>2.8*1024*1024)throw new Error('Word .doc lớn hơn 2,8 MB. Hãy lưu thành .docx để tải lên an toàn.');
            const base64=await regularEvalFileToBase64(file);
            const response=await fetch('/api/khdh-word',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:base64})});
            const parsed=await response.json().catch(()=>({}));
            if(!response.ok)throw new Error(parsed.error||'Không đọc được định dạng Word .doc. Hãy triển khai API /api/khdh-word hoặc chuyển sang .docx.');
            return {text:String(parsed.text||''),sections:[String(parsed.text||'')],source:'Word .doc'};
        }
        if(/\.pdf$/i.test(lower)){
            const pdfjs=await regularEvalLoadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js','pdfjsLib');
            pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
            const pages=[],scan=[],nonScanPages=[];
            for(let i=1;i<=pdf.numPages;i++){
                const page=await pdf.getPage(i),items=(await page.getTextContent()).items;
                // Bảo toàn hàng theo trục dọc, không nối toàn bộ trang thành một dòng.
                const grouped=[];
                for(const item of items){const t=clean(item.str);if(!t)continue;const y=Math.round(item.transform?.[5]||0);
                    let row=grouped.find(g=>Math.abs(g.y-y)<4);if(!row){row={y,segments:[]};grouped.push(row);}row.segments.push({x:Number(item.transform?.[4]||0),text:t});}
                const text=grouped.sort((a,b)=>b.y-a.y).map(g=>g.segments.sort((a,b)=>a.x-b.x).map(s=>s.text).join(' | ')).join('\n');
                pages.push(`=== TRANG PDF ${i}/${pdf.numPages} ===\n${text}`);
                if(text.length<110)scan.push(i);
                else nonScanPages.push(pages[pages.length-1]);
            }
            return {text:pages.join('\n\n'),nonScanText:nonScanPages.join('\n\n'),sections:pages,source:'PDF',scanPages:scan,pdf};
        }
        throw new Error('Chỉ hỗ trợ PDF, Word (.doc/.docx), Excel (.xls/.xlsx).');
    }
    // Chia theo dòng để giảm cắt ngang một bài học; nguồn lớn xử lý từng phần rồi hợp nhất.
    function chunkText(text,max=24000){
        const lines=String(text).split('\n'),chunks=[];let curr='';
        for(const line of lines){
            if(curr&&curr.length+line.length>max){chunks.push(curr);curr='';}
            if(line.length>max){for(let i=0;i<line.length;i+=max){if(curr){chunks.push(curr);curr='';}chunks.push(line.slice(i,i+max));}}else curr+=`${line}\n`;
        }
        if(curr.trim())chunks.push(curr);
        return chunks;
    }
    function promptForChunk(grade,subject,part,total){
        return `Bạn là công cụ PHÂN TÍCH CẤU TRÚC KHDH tiểu học, KHÔNG viết nhận xét. Chỉ lấy môn ${subject.name}, khối ${grade} của năm học. Phần văn bản thứ ${part}/${total}; các phần có thể bắt đầu/kết thúc giữa một chủ đề/bảng.
Trả DUY NHẤT JSON hợp lệ (không Markdown) với cấu trúc:
{"subject":"${subject.name}","grade":${Number(grade)},"topics":[{"name":"Tên chủ đề","lessons":[{"lessonNumber":1,"lessonName":"Tên bài","periods":3,"weekStart":1,"weekEnd":2,"startDate":null,"endDate":null,"dates":[],"programOrder":"tiết 1-3","focus":"nội dung trọng tâm","notes":""}]}]}.
Dùng null khi nguồn không có thông tin, KHÔNG BỊA tuần, ngày, số tiết, tên bài hay tên chủ đề. BẮT BUỘC đọc thông tin Tuần ở TỪNG BÀI hoặc TỪNG TIẾT; KHÔNG gán cả chủ đề cùng một tuần. Nếu một bài trải nhiều tuần, đặt weekStart/weekEnd chính xác theo các tiết tương ứng. Nếu có từng ngày dạy thì điền dates đầy đủ định dạng YYYY-MM-DD, nếu chỉ có ngày bắt đầu/kết thúc thì điền startDate/endDate. Chỉ dùng lịch/phân phối chương trình có trong tài liệu, không tự giả định tháng 9 là tuần 1–4. Ghi số tiết vào periods, và thứ tự phân phối/tiết PPCT vào programOrder, tóm tắt trọng tâm vào focus. Nếu chỉ có số tiết PPCT mà không có liên hệ tuần, weekStart và weekEnd=null. Nếu bài vắt qua ranh giới phần văn bản, trích được thông tin nào thì giữ nguyên, không suy diễn. Không trích xuất môn khác.
JSON phải chứa TOÀN BỘ bài tìm được ở phần này, tuyệt đối không lược bỏ vì không thuộc tháng đang chọn.`;
    }
    function combineAnalyzed(results,subject,grade){
        const topics=[];
        for(const part of results){for(const topic of part.topics||[]){const name=clean(topic?.name||'Chủ đề khác');let target=topics.find(t=>norm(t.name)===norm(name));if(!target){target={name,lessons:[]};topics.push(target);}target.lessons.push(...(Array.isArray(topic.lessons)?topic.lessons:[]));}}
        return {subject:subject.name,grade:Number(grade),topics};
    }
    async function analyzePdfScans(pdf,indices,grade,subject){
        const output=[];
        for(let i=0;i<indices.length;i+=2){
            regularEvalSetLoading(`Đang đọc trang PDF dạng ảnh: ${i+1}–${Math.min(i+2,indices.length)}/${indices.length}`);
            const parts=[];
            for(const pageNo of indices.slice(i,i+2)){
                const page=await pdf.getPage(pageNo),viewport=page.getViewport({scale:1.4});
                const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
                const ctx=canvas.getContext('2d',{alpha:false});
                if(!ctx)throw new Error('Trình duyệt không tạo được canvas để đọc PDF scan.');
                await page.render({canvasContext:ctx,viewport}).promise;
                parts.push({text:`TRANG PDF ${pageNo}`});
                parts.push({inlineData:{mimeType:'image/jpeg',data:canvas.toDataURL('image/jpeg',0.8).split(',')[1]}});
                canvas.width=canvas.height=0;
            }
            const prompt=promptForChunk(grade,subject,Math.floor(i/2)+1,Math.ceil(indices.length/2));
            parts.push({text:prompt});let last;
            for(let attempt=0;attempt<3;attempt++){
                try{
                    const response=await callGeminiDirectFallback({action:'regular-evaluation-khdh',prompt,parts},getGameGeminiApiKey());
                    const result=extractJson(response?.text);
                    if(!Array.isArray(result?.topics))throw new Error('JSON thiếu topics.');
                    output.push(result);last=null;break;
                }catch(error){last=error;}
            }
            if(last)throw new Error(`Không đọc được trang scan ${indices.slice(i,i+2).join(', ')}: ${last.message}`);
        }
        return combineAnalyzed(output,subject,grade);
    }
    async function analyzeParts(parts,grade,subject){
        const results=[];
        for(let i=0;i<parts.length;i++){
            regularEvalSetLoading(`Đang phân tích KHDH: phần ${i+1}/${parts.length}\n${subject.name} · Khối ${grade}`);
            const prompt=promptForChunk(grade,subject,i+1,parts.length);
            let last;
            for(let attempt=1;attempt<=3;attempt++){
                try{
                    const reply=await callGameGeminiApi({action:'regular-evaluation-khdh',prompt,documentText:parts[i]});
                    const json=extractJson(reply?.text);
                    if(!Array.isArray(json?.topics))throw new Error('JSON thiếu trường topics.');
                    results.push(json);last=null;break;
                }catch(error){last=error;if(attempt===3)break;}
            }
            if(last)throw new Error(`Không phân tích được phần ${i+1}/${parts.length}: ${last.message}`);
        }
        return combineAnalyzed(results,subject,grade);
    }
    window.regularEvalHandleKHDHFile=async input=>{
        const file=input?.files?.[0];if(!file)return;
        try{
            if(!getGameGeminiApiKey())throw new Error('Chưa cấu hình Gemini API.');
            if(file.size>30*1024*1024)throw new Error('File vượt 30 MB, hãy giảm kích thước tài liệu.');
            regularEvalSetLoading(`Đang đọc toàn bộ KHDH…\n${file.name}`);
            const r=regularEvalState(),grade=r.settings.grade,subject=regularEvalSubject(),key=currentKey();
            const read=await readDocument(file);
            if(!read.text.trim())throw new Error('Không trích xuất được nội dung KHDH. Giữ nguyên dữ liệu cũ.');
            // PDF có trang scan: phân tích cả các trang text và trang hình, không bỏ trang nào.
            const rawText=read.source==='PDF'?read.nonScanText:read.text;
            const chunks=chunkText(rawText);
            if(chunks.length>100)throw new Error('Tài liệu có trên 100 phần văn bản; hãy chia theo học kỳ để tránh lỗi API.');
            const results=[];
            if(chunks.length)results.push(await analyzeParts(chunks,grade,subject));
            if(read.source==='PDF'&&read.scanPages.length)results.push(await analyzePdfScans(read.pdf,read.scanPages,grade,subject));
            if(!results.length)throw new Error('File không có nội dung có thể phân tích.');
            const result=combineAnalyzed(results,subject,grade);
            // Bảo toàn dữ liệu cũ cho tới khi toàn bộ phân tích và JSON kiểm tra thành công.
            const doc=normalizeDocument(result,file.name,subject.id,grade);
            r.khdhDocuments||(r.khdhDocuments={});r.khdhDocuments[key]=doc;
            await saveData();renderLayout();
            showToast(`Đã phân tích ${allLessons(doc).length} bài, ${doc.topics.length} chủ đề. Chọn các bài cần dùng cho tháng.`,'success');
        }catch(err){console.error('Nhập KHDH:',err);showToast(`Không nhập được KHDH: ${err.message||err}`,'error');}
        finally{regularEvalSetLoading('');input.value='';}
    };
    function saveSelection(ids){const doc=currentDoc();if(!doc)return;doc.selections||(doc.selections={});doc.selections[monthKey()]=[...ids];saveData();}
    window.regularEvalKHDHToggleLesson=id=>{const doc=currentDoc();if(!doc)return;const ids=activeIds(doc);ids.has(id)?ids.delete(id):ids.add(id);saveSelection(ids);renderLayout();};
    window.regularEvalKHDHToggleTopic=id=>{const doc=currentDoc();if(!doc)return;const topic=doc.topics.find(t=>t.id===id);if(!topic)return;const ids=activeIds(doc),every=topic.lessons.every(l=>ids.has(l.id));for(const l of topic.lessons){if(every)ids.delete(l.id);else ids.add(l.id);}saveSelection(ids);renderLayout();};
    window.regularEvalKHDHExpand=id=>{runtime.expanded[id]=runtime.expanded[id]===false?true:false;renderLayout();};
    window.regularEvalKHDHView=v=>{runtime.view=v==='all'?'all':'month';renderLayout();};
    window.regularEvalKHDHWeekFilter=(field,v)=>{runtime[field]=Math.max(0,Math.min(60,Number(v)||0));renderLayout();};
    window.regularEvalKHDHSetFirstWeek=v=>{
        const date=dateKey(v);const settings=regularEvalState().settings;
        settings.khdhWeekOne||(settings.khdhWeekOne={});
        if(date)settings.khdhWeekOne[weekConfigKey()]=date;else delete settings.khdhWeekOne[weekConfigKey()];
        // Chỉ tính lại lựa chọn tự động chưa chỉnh sửa bằng tay.
        saveData();renderLayout();
    };
    window.regularEvalKHDHResetSelection=()=>{const doc=currentDoc();if(!doc)return;if(!confirm('Khôi phục chọn bài tự động theo ngày/tuần của tháng hiện tại?'))return;delete doc.selections?.[monthKey()];saveData();renderLayout();};
    window.regularEvalClearKHDH=()=>{
        const r=regularEvalState(),doc=currentDoc(),oldKey=regularEvalKhdhKey();
        if(!doc&&!r.khdhMap?.[oldKey])return;
        if(!confirm('Xóa KHDH đã nhập của môn/khối/năm học này? Dữ liệu học sinh và nhận xét không bị xóa.'))return;
        if(doc)delete r.khdhDocuments[currentKey()];
        if(r.khdhMap?.[oldKey])delete r.khdhMap[oldKey];
        saveData();renderLayout();showToast('Đã xóa KHDH của môn đang chọn.','success');
    };
    // Giao diện hiển thị theo tháng/tuần, giữ dữ liệu của các tháng và môn khác nguyên vẹn.
    window.regularEvalKHDHTreeHtml=()=>{
        const doc=currentDoc(),month=Number(monthKey());
        if(!doc){const legacy=regularEvalState().khdhMap?.[regularEvalKhdhKey()]||'';
            return `<div class="kh-empty">Chưa có KHDH dạng cây của môn/khối này. Bấm <b>Nhập KHDH</b> để đọc tài liệu một lần và dùng cho nhiều tháng.${legacy?`<details><summary>Xem KHDH văn bản đã lưu trước đây (giữ nguyên)</summary><pre>${esc(legacy)}</pre></details>`:''}</div>`;
        }
        const ids=activeIds(doc),all=allLessons(doc),weeks=all.flatMap(l=>[l.weekStart,l.weekEnd]).filter(Number.isInteger),maxWeek=Math.max(35,...weeks);
        const option=(n)=>`<option value="${n}" ${Number(n)===Number(runtime.from)?'selected':''}>Tuần ${n}</option>`;
        const weekOptions=Array.from({length:maxWeek},(_,i)=>i+1).map(n=>`<option value="${n}">Tuần ${n}</option>`).join('');
        const filter=lesson=>{
            if(runtime.view==='month'&&classify(lesson,month).status==='no')return false;
            const a=runtime.from||0,b=runtime.to||0;
            if(!a&&!b)return true;
            if(!lesson.weekStart)return false;
            const start=a||b,end=b||a;
            return (lesson.weekEnd||lesson.weekStart)>=Math.min(start,end)&&lesson.weekStart<=Math.max(start,end);
        };
        let shown=0,selected=0,uncertain=0;
        const topicHtml=doc.topics.map(t=>{
            const visible=t.lessons.filter(filter);if(!visible.length)return '';
            shown+=visible.length;selected+=visible.filter(l=>ids.has(l.id)).length;
            const allSelected=t.lessons.every(l=>ids.has(l.id)),someSelected=t.lessons.some(l=>ids.has(l.id));
            const totalPeriods=visible.reduce((sum,l)=>sum+(l.periods||0),0);
            const expanded=runtime.expanded[t.id]!==false;
            const lessonHtml=visible.map(l=>{
                const status=classify(l,month);if(status.ambiguous)uncertain++;
                const weeks=l.weekStart?`Tuần ${l.weekStart}${l.weekEnd&&l.weekEnd!==l.weekStart?`–${l.weekEnd}`:''}`:'Chưa rõ tuần';
                const dates=(l.dates||[]).length?l.dates.map(d=>d.slice(8,10)+'/'+d.slice(5,7)).join(', '):
                    l.startDate?`${l.startDate.slice(8,10)}/${l.startDate.slice(5,7)}${l.endDate&&l.endDate!==l.startDate?'–'+l.endDate.slice(8,10)+'/'+l.endDate.slice(5,7):''}`:'';
                const weekDatesLabel=l.weekStart&&weekDates(l.weekStart)?` • ${weekDates(l.weekStart)[0].slice(8,10)}/${weekDates(l.weekStart)[0].slice(5,7)}–${weekDates(l.weekEnd||l.weekStart)[1].slice(8,10)}/${weekDates(l.weekEnd||l.weekStart)[1].slice(5,7)}`:'';
                return `<label class="kh-lesson"><input type="checkbox" ${ids.has(l.id)?'checked':''} onchange="regularEvalKHDHToggleLesson('${l.id}')"><span class="kh-name">${l.lessonNumber!==null?`<b>Bài ${l.lessonNumber}: </b>`:''}${esc(l.lessonName)}${l.focus?`<small>${esc(l.focus)}</small>`:''}</span><span class="kh-badges">${l.periods?`<span>${l.periods} tiết</span>`:''}<span>${esc(weeks)}${esc(dates?` • ${dates}`:weekDatesLabel)}</span>${status.ambiguous?`<span class="kh-warning" title="${esc(status.method)}">Cần kiểm tra</span>`:''}</span></label>`;
            }).join('');
            return `<div class="kh-topic"><div class="kh-topic-head"><button type="button" class="kh-expand" onclick="regularEvalKHDHExpand('${t.id}')" aria-label="Mở hoặc thu gọn">${expanded?'▾':'▸'}</button><input aria-label="Chọn tất cả bài của chủ đề" type="checkbox" ${allSelected?'checked':''} ${!allSelected&&someSelected?'data-mixed="true"':''} onchange="regularEvalKHDHToggleTopic('${t.id}')"><strong>${esc(t.name)}</strong><span class="kh-total">${totalPeriods} tiết${runtime.view==='month'?' đang hiển thị':''}</span></div>${expanded?`<div class="kh-lesson-list">${lessonHtml}</div>`:''}</div>`;
        }).join('');
        const firstWeek=week1Start(),note=!firstWeek&&all.some(l=>l.weekStart&&!l.startDate&&!(l.dates||[]).length)?'Chưa có ngày bắt đầu tuần 1. Những bài chỉ ghi số tuần chưa thể tự xác định tháng; hãy nhập ngày để tính chính xác.':'';
        const val=n=>`<option value="${n}" ${Number(runtime[n==='0'?'from':'to'])===n?'selected':''}></option>`;
        const weekSelect=(field)=>`<select aria-label="${field==='from'?'Từ tuần':'Đến tuần'}" class="kh-input" onchange="regularEvalKHDHWeekFilter('${field}',this.value)"><option value="0">${field==='from'?'Từ tuần':'Đến tuần'} (tất cả)</option>${Array.from({length:maxWeek},(_,i)=>i+1).map(n=>`<option value="${n}" ${runtime[field]===n?'selected':''}>Tuần ${n}</option>`).join('')}</select>`;
        return `<div class="kh-control"><div class="kh-controls"><label><input type="radio" name="kh-display" ${runtime.view==='month'?'checked':''} onchange="regularEvalKHDHView('month')"> Chỉ hiện tháng ${month}</label><label><input type="radio" name="kh-display" ${runtime.view==='all'?'checked':''} onchange="regularEvalKHDHView('all')"> Hiện toàn bộ KHDH</label><span class="kh-filter-label">Lọc theo kỳ / tuần</span>${weekSelect('from')}${weekSelect('to')}</div><div class="kh-controls"><label>Ngày bắt đầu tuần 1: <input type="date" class="kh-input" value="${firstWeek||''}" onchange="regularEvalKHDHSetFirstWeek(this.value)"></label><button type="button" class="kh-reset" onclick="regularEvalKHDHResetSelection()">Chọn lại theo tháng</button></div>${note?`<div class="kh-note">${esc(note)}</div>`:''}<div class="kh-summary">${esc(doc.sourceName)} · ${doc.topics.length} chủ đề · ${all.length} bài trong KHDH · ${shown} bài đang hiển thị · ${selected} bài đã chọn${uncertain?' · '+uncertain+' bài cần kiểm tra':''}</div></div><div class="kh-tree">${topicHtml||'<div class="kh-empty">Không có bài học phù hợp bộ lọc hiện tại. Hãy chọn “Hiện toàn bộ KHDH” hoặc đổi khoảng tuần.</div>'}</div>`;
    };
    window.regularKHDHInternal={classify,normalizeDocument,activeIds,selectedContext,chunkText,parseJson:extractJson,weekDates,dateKey,monthRange};
})();
