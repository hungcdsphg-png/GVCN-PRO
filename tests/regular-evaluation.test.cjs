const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const source=html.slice(html.indexOf('        const REGULAR_EVAL_PRIMARY_GRADES'),html.indexOf('        function renderViewNhanXetDinhKyMon'));
const backupSource=html.slice(html.indexOf('        window.exportData = async function'),html.indexOf('        function saveSettings()'));

// A deliberately small asynchronous IndexedDB double; no live API or teacher data.
function memoryIDB(){
    const records=new Map();
    const db={
        objectStoreNames:{contains:()=>true},
        createObjectStore:()=>{},
        close:()=>{},
        transaction(){
            const tx={};
            tx.objectStore=()=>({
                get(key){return {result:records.has(key)?structuredClone(records.get(key)):undefined};},
                put(record){records.set(record.id,structuredClone(record));return {result:record.id};},
                delete(key){records.delete(key);return {result:undefined};}
            });
            setImmediate(()=>tx.oncomplete?.());
            return tx;
        }
    };
    return {records,open(){const req={result:db};setImmediate(()=>req.onsuccess?.());return req;}};
}
class TestFileReader{
    readAsDataURL(blob){
        blob.arrayBuffer().then(buffer=>{this.result='data:'+(blob.type||'application/octet-stream')+';base64,'+Buffer.from(buffer).toString('base64');this.onload?.({target:this});}).catch(error=>{this.error=error;this.onerror?.(error);});
    }
    readAsText(blob){blob.text().then(text=>{this.result=text;return this.onload?.({target:this});}).catch(error=>this.onerror?.(error));}
}
function harness(options={}){
    const db=options.db||memoryIDB(),books=[],toasts=[],calls=[],local=new Map();
    const state=options.state||{
        settings:{schoolYear:'2026-2027'},admin:{className:'4B'},
        students:[{id:'HS1',name:'Nguyễn Văn A',moetCode:'00012345',birthDate:'2017-08-15',className:'4B'},{id:'HS2',name:'Trần Văn B',moetCode:'00054321',birthDate:'2017-09-20',className:'4B'}],
        regularEvaluation:{settings:{grade:'4',className:'4B',month:10,subjectId:'toan'},evaluations:[],khdhMap:{}}
    };
    const c={
        state,console,queueMicrotask,Map,Set,Blob,File,Uint8Array,atob,btoa,FileReader:TestFileReader,indexedDB:db,
        setTimeout:(fn,ms)=>setTimeout(fn,ms>=650?0:ms),clearTimeout,
        confirm:()=>true,alert:()=>{},CSS:{escape:String},
        document:{getElementById:()=>null,querySelector:()=>null,createElement:()=>({click(){},remove(){},setAttribute(){}}),body:{appendChild(){}}},
        localStorage:{getItem:key=>local.get(key)||null,setItem:(key,value)=>local.set(key,value)},
        getGameGeminiApiKey:()=> 'mock-key',getGameGeminiModel:()=> 'mock-model',GAME_GEMINI_MODEL_STORAGE:'mock-model',
        normalizeStudentBirthDate:value=>String(value||''),formatStudentBirthDate:value=>String(value).split('-').reverse().join('/'),
        mfgEsc:value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),
        escapeHtmlAttr:value=>String(value??'').replaceAll('"','&quot;'),escapeInlineJs:String,
        showToast:(message,type)=>toasts.push({message,type}),renderLayout:()=>{},
        saveData:async()=>{local.set('chuyen_tau_data',JSON.stringify(c.state));},
        applyStateDefaults:()=>{},getTodayString:()=> '2026-10-27',URL:{createObjectURL:blob=>{c.lastBackupBlob=blob;return 'blob:mock';},revokeObjectURL:()=>{}}
    };
    c.window=c;
    c.XLSX={utils:{
        book_new:()=>({SheetNames:[],Sheets:{}}),aoa_to_sheet:rows=>({rows}),
        book_append_sheet:(book,sheet,name)=>{book.SheetNames.push(name);book.Sheets[name]=sheet;},
        sheet_to_csv:sheet=>sheet.csv||'',sheet_to_json:sheet=>sheet.rows
    },read:()=>c.importWorkbook||{SheetNames:[],Sheets:{}},writeFile:(book,name)=>books.push({book,name})};
    const respond=async payload=>{
        calls.push(payload);
        if(options.respond)return options.respond(payload,c);
        if(payload.action==='regular-evaluation-comment')return {result:{monHoc:{noiDung:'Em nắm chắc kiến thức.'},nangLucChung:{noiDung:'Em hợp tác tốt.'},nangLucDacThu:{noiDung:'Em vận dụng tốt.'},phamChat:{noiDung:'Em tích cực học tập.'}}};
        return {text:'- Bài '+payload.prompt.match(/Môn cần lấy: (.+)/)?.[1]+' tháng '+payload.prompt.match(/Tháng cần lấy: (\d+)/)?.[1]};
    };
    c.callGameGeminiApi=respond;c.callGeminiDirectFallback=respond;
    vm.createContext(c);vm.runInContext(source+backupSource,c);
    c.regularEvalSetLoading=()=>{};
    c.regularEvalState();
    const evaluate=code=>vm.runInContext(code,c);
    const setEval=(studentId,subjectId,month,fields={},year='2026-2027')=>{
        const ev=c.regularEvalDefaultEvaluation(studentId,month,subjectId,year);Object.assign(ev,fields);c.state.regularEvaluation.evaluations.push(ev);return ev;
    };
    const uploadPdf=async(name='KHDH-cac-mon.pdf')=>{
        const input={files:[new File(['%PDF-test-document'],name,{type:'application/pdf'})],value:'selected'};
        await c.regularEvalHandleKHDHFile(input);assert.equal(input.value,'');
    };
    return {c,db,books,toasts,calls,local,evaluate,setEval,uploadPdf};
}

test('export: only populated subjects in selected month/year/class; 13 columns on every sheet',async()=>{
    const h=harness();
    h.setEval('HS1','toan',10,{monHoc_ma:'Tốt',monHoc_noiDung:'Toán tháng 10'});
    h.setEval('HS2','tiengviet',10,{nlc_ma:'Đạt'});
    h.setEval('HS1','khoahoc',10,{pc_noiDung:'Nhận xét Khoa học'});
    h.setEval('HS1','amnhac',10,{monHoc_noiDung:'   '});
    h.setEval('HS1','mithuat',9,{monHoc_ma:'Tốt'});
    h.setEval('HS1','daoduc',10,{monHoc_ma:'Đạt'},'2025-2026');
    h.setEval('HS-OTHER-CLASS','ngoaingu',10,{monHoc_ma:'Đạt'});
    await h.c.regularEvalExportExcel();
    assert.equal(h.books.length,1);
    assert.deepEqual(h.books[0].book.SheetNames,['Tiếng Việt','Toán','Khoa học']);
    assert.equal(h.books[0].name,'DanhGia_Thang10_4B.xlsx');
    for(const sheet of Object.values(h.books[0].book.Sheets)){
        assert.equal(sheet.rows[0].length,13);
        assert.ok(!sheet.rows[0].includes('Giới tính')&&!sheet.rows[0].includes('Tổ'));
        assert.ok(sheet.rows.slice(2).every(row=>row.length===13&&row[4]===10));
    }
    assert.equal(h.books[0].book.Sheets['Toán'].rows[2][1],'00012345');
    assert.equal(h.books[0].book.Sheets['Toán'].rows[2][3],'15/08/2017');
});

test('export: empty records and Không chọn do not generate blank workbook',async()=>{
    const h=harness();h.setEval('HS1','toan',10);
    await h.c.regularEvalExportExcel();
    assert.equal(h.books.length,0);assert.match(h.toasts.at(-1).message,/Chưa có môn/);
});

test('export: all evaluation-level codes are blank in Excel, but levels and comments stay unchanged in app',async()=>{
    const h=harness(),fields={monHoc_ma:'Tốt',nlc_ma:'Đạt',nldt_ma:'Tốt',pc_ma:'Chưa đạt',monHoc_noiDung:'Nội dung môn',nlc_noiDung:'Nội dung NLC',nldt_noiDung:'Nội dung NLĐT',pc_noiDung:'Nội dung PC'};
    const ev=h.setEval('HS1','toan',10,fields),levelsBefore=JSON.stringify(ev),sharedBefore=JSON.stringify(h.c.state.students);
    await h.c.regularEvalExportExcel();
    const row=h.books[0].book.Sheets['Toán'].rows[2];
    for(const index of [5,7,9,11])assert.equal(row[index],'');
    assert.deepEqual([row[6],row[8],row[10],row[12]],[fields.monHoc_noiDung,fields.nlc_noiDung,fields.nldt_noiDung,fields.pc_noiDung]);
    assert.equal(JSON.stringify(ev),levelsBefore);assert.equal(JSON.stringify(h.c.state.students),sharedBefore);
    assert.equal(h.c.regularEvalResolveLevels(ev).phamChat,'Chưa đạt');
});

test('export code filter preserves other/future codes and does not alter template levels',async()=>{
    const h=harness();
    for(const value of ['Tốt','Đạt','Chưa đạt','T','D','C','Không chọn',''])assert.equal(h.c.regularEvalExcelCommentCode(value),'');
    for(const value of ['NX001','TV-10.2','NLC_A'])assert.equal(h.c.regularEvalExcelCommentCode(value),value);
    h.setEval('HS1','toan',10,{monHoc_ma:'Tốt',nlc_ma:'Đạt',nldt_ma:'Tốt',pc_ma:'Chưa đạt'});
    await h.c.regularEvalDownloadTemplate('current');
    const row=h.books[0].book.Sheets['Toán'].rows[2];
    assert.deepEqual([row[5],row[7],row[9],row[11]],['Tốt','Đạt','Tốt','Chưa đạt']);
});

test('export: only current module working roster, including locked evaluations',async()=>{
    const h=harness();
    h.c.state.regularEvaluation.rosterByClass={'4B':['HS2']};
    h.setEval('HS1','toan',10,{monHoc_noiDung:'Hidden student'});
    h.setEval('HS2','tiengviet',10,{monHoc_ma:'Đạt',isLocked:true});
    await h.c.regularEvalExportExcel();
    assert.deepEqual(h.books[0].book.SheetNames,['Tiếng Việt']);
    assert.equal(h.books[0].book.Sheets['Tiếng Việt'].rows.length,3);
});

test('KHDH: save PDF in IndexedDB; reuse upload across subjects and months; cache hits make no AI call',async()=>{
    const h=harness();await h.uploadPdf();
    assert.equal(h.db.records.size,1);assert.equal(h.calls.length,1);
    const first=h.c.regularEvalKHDHContext(),metadata=h.c.regularEvalState().khdhDocuments[first.documentKey];
    assert.equal(metadata.name,'KHDH-cac-mon.pdf');
    assert.match(h.c.regularEvalGetKHDHText(),/Toán tháng 10/);
    assert.ok(!h.local.get('chuyen_tau_data').includes('%PDF'));
    assert.ok(!h.local.get('chuyen_tau_data').includes('blobBase64'));
    h.c.state.regularEvaluation.settings.subjectId='tiengviet';await h.c.regularEvalEnsureKHDH();
    assert.equal(h.calls.length,2);assert.match(h.c.regularEvalGetKHDHText(),/Tiếng Việt tháng 10/);
    h.c.state.regularEvaluation.settings.month=9;await h.c.regularEvalEnsureKHDH();
    assert.equal(h.calls.length,3);assert.match(h.c.regularEvalGetKHDHText(),/Tiếng Việt tháng 9/);
    h.c.state.regularEvaluation.settings.subjectId='toan';h.c.state.regularEvaluation.settings.month=10;
    await h.c.regularEvalEnsureKHDH();await h.c.regularEvalEnsureKHDH();
    assert.equal(h.calls.length,3);assert.match(h.c.regularEvalGetKHDHText(),/Toán tháng 10/);
    assert.match(h.calls[0].parts[0].inlineData.data,/JVBER/);
});

test('KHDH: app reload retains file and cache, and can analyze another subject without upload',async()=>{
    const first=harness();await first.uploadPdf();
    const persistedState=JSON.parse(first.local.get('chuyen_tau_data'));
    const second=harness({db:first.db,state:persistedState});
    await second.c.regularEvalEnsureKHDH();assert.equal(second.calls.length,0);
    second.c.state.regularEvaluation.settings.subjectId='daoduc';
    await second.c.regularEvalEnsureKHDH();assert.equal(second.calls.length,1);
    assert.match(second.c.regularEvalGetKHDHText(),/Đạo đức/);
});

test('KHDH: file scope is class/year and does not leak to another class/year',async()=>{
    const h=harness();await h.uploadPdf();
    h.c.state.regularEvaluation.settings.className='5A';
    assert.equal(await h.c.regularEvalEnsureKHDH(),'');assert.equal(h.calls.length,1);
    h.c.state.regularEvaluation.settings.className='4B';h.c.state.settings.schoolYear='2027-2028';
    assert.equal(await h.c.regularEvalEnsureKHDH(),'');assert.equal(h.calls.length,1);
});

test('KHDH: replacing file invalidates all subject caches, without deleting comments or historical cache text',async()=>{
    const h=harness();const ev=h.setEval('HS1','toan',9,{monHoc_noiDung:'Keep history'});
    await h.uploadPdf();h.c.state.regularEvaluation.settings.subjectId='tiengviet';
    await h.c.regularEvalEnsureKHDH();h.c.state.regularEvaluation.settings.subjectId='toan';
    await h.uploadPdf('KHDH-moi.pdf');assert.equal(h.calls.length,3);
    h.c.state.regularEvaluation.settings.subjectId='tiengviet';
    assert.equal(h.c.regularEvalKHDHCacheReady(),false);await h.c.regularEvalEnsureKHDH();
    assert.equal(h.calls.length,4);assert.equal(ev.monHoc_noiDung,'Keep history');
});

test('KHDH: identical simultaneous requests are deduplicated and calls for different subjects are serialized',async()=>{
    let active=0,maxActive=0;
    const h=harness({respond:async()=>{active++;maxActive=Math.max(maxActive,active);await new Promise(r=>setTimeout(r,10));active--;return {text:'- Bài có trong tài liệu'};}});
    await h.uploadPdf();
    h.c.state.regularEvaluation.settings.subjectId='khoahoc';
    const a=h.c.regularEvalEnsureKHDH(),b=h.c.regularEvalEnsureKHDH();assert.equal(a,b);
    h.c.state.regularEvaluation.settings.subjectId='lichsuvadiali';
    await Promise.all([a,b,h.c.regularEvalEnsureKHDH()]);
    assert.equal(h.calls.length,3);assert.equal(maxActive,1);
});

test('KHDH: subject change while AI runs cannot write into new subject cache',async()=>{
    let finish;
    const h=harness();await h.uploadPdf();h.c.state.regularEvaluation.settings.subjectId='khoahoc';
    h.c.callGeminiDirectFallback=()=>new Promise(resolve=>{finish=resolve;});
    const khoaContext=h.c.regularEvalKHDHContext(),pending=h.c.regularEvalEnsureKHDH();
    while(!finish)await new Promise(resolve=>setImmediate(resolve));
    h.c.state.regularEvaluation.settings.subjectId='daoduc';
    finish({text:'Khoa học only'});await pending;
    assert.equal(h.c.regularEvalGetKHDHText(),'');
    assert.equal(h.c.regularEvalGetKHDHText(khoaContext),'Khoa học only');
});

test('KHDH: manual edits during an AI request are preserved',async()=>{
    const h=harness();await h.uploadPdf();h.c.state.regularEvaluation.settings.subjectId='khoahoc';let finish;
    h.c.callGeminiDirectFallback=()=>new Promise(resolve=>{finish=resolve;});
    const pending=h.c.regularEvalEnsureKHDH();
    while(!finish)await new Promise(resolve=>setImmediate(resolve));
    h.c.regularEvalUpdateKHDH('Giáo viên tự sửa');finish({text:'AI should not overwrite'});await pending;
    assert.equal(h.c.regularEvalGetKHDHText(),'Giáo viên tự sửa');
});

test('KHDH: no matching content is cached as exact not-found text',async()=>{
    const h=harness({respond:async()=>({text:'Không tìm thấy dữ liệu phù hợp.'})});await h.uploadPdf();
    assert.equal(h.c.regularEvalGetKHDHText(),'Không tìm thấy nội dung KHDH của môn này trong tháng đã chọn.');
    await h.c.regularEvalEnsureKHDH();assert.equal(h.calls.length,1);
});

test('KHDH: failures are not cached as content; automatic renders do not loop; explicit retry works',async()=>{
    let fail=true;
    const h=harness({respond:async()=>{if(fail)throw new Error('429 rate limit');return {text:'- Nội dung hợp lệ'};}});
    await h.uploadPdf();
    assert.equal(h.c.regularEvalKHDHCacheReady(),false);
    await assert.rejects(h.c.regularEvalEnsureKHDH(),/429/);assert.equal(h.calls.length,1);
    fail=false;await h.c.regularEvalRetryKHDH();assert.equal(h.calls.length,2);
    assert.equal(h.c.regularEvalGetKHDHText(),'- Nội dung hợp lệ');
});

test('KHDH: file is stored even without an API key; no unnecessary API call',async()=>{
    const h=harness();h.c.getGameGeminiApiKey=()=>'';await h.uploadPdf();
    assert.equal(h.db.records.size,1);assert.equal(h.calls.length,0);
    assert.match(h.c.regularEvalKHDHHtml(),/Đã nhập KHDH/);
    assert.match(h.c.regularEvalKHDHHtml(),/cấu hình Gemini/);
});

test('KHDH: legacy manually entered summaries remain intact and need no file or API',async()=>{
    const h=harness();const key=h.c.regularEvalKHDHContext().cacheKey;
    h.c.state.regularEvaluation.khdhMap[key]='Nội dung cũ';
    assert.equal(await h.c.regularEvalEnsureKHDH(),'Nội dung cũ');assert.equal(h.calls.length,0);
});

test('AI comments await the right KHDH and retain per-group levels and previous-month history',async()=>{
    const h=harness();h.setEval('HS1','toan',9,{monHoc_ma:'Đạt',monHoc_noiDung:'Tháng trước cần luyện tính.'});
    await h.uploadPdf();
    const levels={monHoc:'Tốt',nangLucChung:'Đạt',nangLucDacThu:'Chưa đạt',phamChat:'Tốt'};
    await h.c.regularEvalGenerateComment(h.c.regularEvalStudents()[0],levels);
    const prompt=h.calls.at(-1).prompt;
    assert.match(prompt,/Mức Môn học và HĐGD: Tốt/);assert.match(prompt,/Mức Năng lực chung: Đạt/);
    assert.match(prompt,/Mức Năng lực đặc thù: Chưa đạt/);assert.match(prompt,/Tháng trước cần luyện tính/);
    assert.match(prompt,/Toán tháng 10/);assert.match(prompt,/Tháng hiện tại: 10/);
});

test('backup and restore include full KHDH blob, metadata and cached analysis',async()=>{
    const h=harness();await h.uploadPdf();
    const files=await h.c.regularEvalBackupKHDHFiles();assert.equal(files.length,1);
    assert.ok(files[0].blobBase64);assert.equal(files[0].blob,undefined);
    const restored=harness({state:JSON.parse(h.local.get('chuyen_tau_data'))});
    await restored.c.regularEvalRestoreKHDHFiles(files);
    await restored.c.regularEvalEnsureKHDH();assert.equal(restored.calls.length,0);
    restored.c.state.regularEvaluation.settings.subjectId='khoahoc';await restored.c.regularEvalEnsureKHDH();
    assert.equal(restored.calls.length,1);assert.equal(restored.db.records.size,1);
});

test('rendered UI keeps Xóa HS, AI and history, and shows Nhập/Thay KHDH with scoped title',async()=>{
    const h=harness();let ui=h.evaluate('RegularEvaluationPage.render()');
    assert.match(ui,/Xóa HS/);assert.match(ui,/AI toàn lớp/);assert.match(ui,/Lịch sử nhận xét/);
    assert.match(ui,/📂 Nhập KHDH/);assert.doesNotMatch(ui,/Tải Giáo án\/KHDH/);
    await h.uploadPdf();ui=h.evaluate('RegularEvaluationPage.render()');
    assert.match(ui,/Thay KHDH/);assert.match(ui,/Đã nhập KHDH: KHDH-cac-mon.pdf/);
    assert.match(ui,/Trọng tâm bài học Tháng 10 – Môn Toán/);
});

test('changing subject/month automatically requests the scoped KHDH',async()=>{
    const h=harness();await h.uploadPdf();
    h.c.regularEvalUpdateSetting('subjectId','khoahoc');
    await new Promise(resolve=>setTimeout(resolve,120));await h.c.regularEvalKHDHRuntime().queue;
    assert.equal(h.calls.length,2);assert.match(h.c.regularEvalGetKHDHText(),/Khoa học tháng 10/);
});

test('Excel KHDH extraction preserves every sheet and text beyond the former 60,000-character cutoff',async()=>{
    const h=harness();
    h.c.importWorkbook={SheetNames:['Toán','Tiếng Việt'],Sheets:{'Toán':{csv:'X'.repeat(65000)},'Tiếng Việt':{csv:'Tháng 10: Bài ở cuối tài liệu'}}};
    const text=await h.c.regularEvalExtractDocumentText(new File(['mock'],'kehoach.xlsx'));
    assert.ok(text.length>65000);assert.match(text,/Sheet Tiếng Việt/);assert.match(text,/Bài ở cuối tài liệu/);
});

test('AI whole class: retries only missing group, keeps valid text, and counts locked incomplete student honestly',async()=>{
    let tries=0;
    const h=harness({respond:async payload=>{
        assert.equal(payload.action,'regular-evaluation-comment');
        tries++;
        return tries===1?{result:{}}:{result:{monHoc:{noiDung:'must not overwrite'},nangLucDacThu:{noiDung:'Bổ sung NLĐT'}}};
    }});
    const existing=h.setEval('HS1','toan',10,{level:'Đạt',monHoc_ma:'Tốt',monHoc_noiDung:'Giữ môn',nlc_noiDung:'Giữ NLC',pc_noiDung:'Giữ PC'});
    h.setEval('HS2','toan',10,{level:'Đạt',isLocked:true});
    await h.c.regularEvalGenerateBulk();
    assert.equal(tries,2);assert.equal(existing.monHoc_noiDung,'Giữ môn');
    assert.equal(existing.nlc_noiDung,'Giữ NLC');assert.equal(existing.pc_noiDung,'Giữ PC');
    assert.equal(existing.nldt_noiDung,'Bổ sung NLĐT');
    assert.equal(h.c.regularEvaluationRuntime.bulkSummary.completed,1);
    assert.equal(h.c.regularEvaluationRuntime.bulkSummary.remaining.length,1);
    assert.equal(h.toasts.at(-1).type,'error');
});

test('full backup buttons serialize KHDH separately and restore it without putting base64 in app state',async()=>{
    const h=harness();await h.uploadPdf();await h.c.exportData();
    const backup=JSON.parse(await h.c.lastBackupBlob.text());
    assert.equal(backup.__regularEvaluationKHDHFiles.length,1);
    const target=harness();
    const event={target:{files:[new File([JSON.stringify(backup)],'backup.json',{type:'application/json'})],value:'selected'}};
    target.c.importData(event);
    for(let attempt=0;attempt<50&&!target.toasts.some(item=>item.message.includes('phục hồi dữ liệu thành công'));attempt++)await new Promise(resolve=>setTimeout(resolve,5));
    assert.ok(target.toasts.some(item=>item.message.includes('phục hồi dữ liệu thành công')));
    assert.equal(target.c.state.__regularEvaluationKHDHFiles,undefined);
    assert.ok(!target.local.get('chuyen_tau_data').includes('blobBase64'));
    assert.equal(target.db.records.size,1);
});
