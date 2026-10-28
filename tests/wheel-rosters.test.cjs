const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const source=html.slice(html.indexOf('        let wheelRotation ='),html.indexOf('        window.switchRankingTab'));
const modes=['wheel','stage','duck'];
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness(savedState){
    const state=savedState||{
        currentTab:'vong-quay',admin:{className:'LỚP 3B'},
        students:[{id:1,name:'Nguyễn Văn A',moetCode:'000001',className:'3B',points:10,history:[],avatarUrl:'a.png',group:'Tổ 1'},
            {id:2,name:'Trần Văn B',moetCode:'000002',className:'3B',points:20,history:[],group:'Tổ 2'}],
        groups:[{id:'g1',name:'Tổ 1'}],regularEvaluation:{evaluations:[{studentId:'1',monHoc_noiDung:'Giữ nhận xét'}]},attendanceRecords:{today:{1:'present'}}
    };
    const elements=new Map(),toasts=[],confirmations=[],frames=[],saved=[];
    const canvasContext=new Proxy({}, {get:(target,key)=>key in target?target[key]:(()=>{}),set:(target,key,value)=>(target[key]=value,true)});
    const element=id=>{if(!elements.has(id))elements.set(id,{id,value:'',innerHTML:'',style:{},disabled:false,
        clientWidth:900,clientHeight:600,offsetWidth:900,offsetHeight:600,offsetLeft:60,offsetTop:80,
        classList:{add(){},remove(){},contains:()=>false},appendChild(){},click(){},getContext:()=>canvasContext,width:420,height:420});return elements.get(id);};
    const c={state,console,queueMicrotask,Map,Set,performance,setTimeout,clearTimeout,
        document:{getElementById:element,querySelectorAll:()=>[],createElement:()=>element('created')},
        confirm:message=>(confirmations.push(message),c.confirmResult!==false),showToast:(message,type)=>toasts.push({message,type}),
        renderLayout:()=>{c.renders=(c.renders||0)+1;},saveData:async()=>saved.push(JSON.stringify(c.state)),
        requestAnimationFrame:callback=>(frames.push(callback),frames.length),cancelAnimationFrame(){},
        getAvatarImg:()=>'<img>',mfgEsc:value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),
        escapeInlineJs:value=>String(value??'').replaceAll("'","\\'"),triggerConfetti(){},
        showRandomResultModal:(title,content)=>{c.result={title,content};},closeModal(){},
        switchTab:tab=>{c.state.currentTab=tab;},selectStudentForPoints:id=>{c.selectedForPoints=id;},
        Tone:{context:{state:'running'},Synth:class{constructor(){this.volume={};}toDestination(){return this;}triggerAttackRelease(){}dispose(){}}},
        regularEvalEnsureXLSX:async()=>c.XLSX
    };
    c.XLSX={read:()=>c.workbook,utils:{sheet_to_json:sheet=>sheet.rows}};
    c.window=c;vm.createContext(c);vm.runInContext(source,c);
    return {c,elements,element,toasts,confirmations,frames,saved,evaluate:code=>vm.runInContext(code,c)};
}
function protectedState(c){
    return JSON.stringify({students:c.state.students,groups:c.state.groups,regularEvaluation:c.state.regularEvaluation,attendanceRecords:c.state.attendanceRecords});
}
function workbook(names){
    return {SheetNames:['Danh sách'],Sheets:{'Danh sách':{rows:[['STT','Mã định danh Bộ GD&ĐT','Họ và tên'],...names.map((name,index)=>[index+1,'NEW'+index,name])]}}};
}
async function importNames(h,mode,names){
    h.c.workbook=workbook(names);
    const input={files:[{name:'danhsach.xlsx',arrayBuffer:async()=>new ArrayBuffer(0)}],value:'selected'};
    await h.c.wheelHandleRosterImport(input,mode);assert.equal(input.value,'');
}

test('all three modes get independent copies; editing/deleting common students cannot mutate copies',async()=>{
    const h=harness(),before=protectedState(h.c),rosters=h.c.wheelRosterState();
    assert.equal(protectedState(h.c),before);
    assert.notEqual(rosters.wheel.students,rosters.stage.students);
    assert.notEqual(rosters.wheel.students[0],h.c.state.students[0]);
    assert.notEqual(rosters.wheel.students[0],rosters.duck.students[0]);
    assert.equal(new Set(modes.flatMap(mode=>rosters[mode].students.map(s=>s.id))).size,6);
    h.c.state.students[0].name='Tên lớp đã đổi';
    assert.equal(h.c.wheelRosterStudents('wheel')[0].name,'Nguyễn Văn A');
    await tick();assert.ok(h.saved.length);
});

test('private rosters do not duplicate large base64 avatars into app storage, but still display shared avatar',()=>{
    const h=harness();h.c.state.students[0].avatarUrl='data:image/png;base64,LARGE_IMAGE';
    h.c.wheelRosterState();const copied=h.c.wheelRosterStudents('wheel')[0];
    assert.equal(copied.avatarUrl,'');assert.equal(h.c.wheelRosterAvatarUrl(copied),h.c.state.students[0].avatarUrl);
    assert.ok(!JSON.stringify(h.c.state.wheelRosters).includes('LARGE_IMAGE'));
});

test('Xóa DS uses exact confirmation and clears only current mode, not shared/other modules',()=>{
    const h=harness();h.c.wheelRosterState();
    const before=protectedState(h.c),stage=JSON.stringify(h.c.state.wheelRosters.stage),duck=JSON.stringify(h.c.state.wheelRosters.duck);
    h.c.wheelClearRoster('wheel');
    assert.equal(h.confirmations[0],'Bạn có chắc muốn xóa danh sách học sinh của Vòng quay này? Danh sách học sinh chung của lớp sẽ không bị ảnh hưởng.');
    assert.equal(h.c.wheelRosterStudents('wheel',false).length,0);
    assert.equal(JSON.stringify(h.c.state.wheelRosters.stage),stage);assert.equal(JSON.stringify(h.c.state.wheelRosters.duck),duck);
    assert.equal(protectedState(h.c),before);assert.ok(h.c.renders);
});

test('cancel clear leaves every list unchanged',()=>{
    const h=harness();h.c.wheelRosterState();const before=JSON.stringify(h.c.state);
    h.c.confirmResult=false;h.c.wheelClearRoster('duck');assert.equal(JSON.stringify(h.c.state),before);
});

test('import each mode independently without changing shared profiles or the other two modes',async()=>{
    for(const mode of modes){
        const h=harness();h.c.wheelRosterState();const before=protectedState(h.c);
        const others=Object.fromEntries(modes.filter(id=>id!==mode).map(id=>[id,JSON.stringify(h.c.state.wheelRosters[id])]));
        await importNames(h,mode,['Người chơi riêng '+mode]);
        assert.equal(h.c.wheelRosterStudents(mode).length,1);
        assert.equal(h.c.wheelRosterStudents(mode)[0].name,'Người chơi riêng '+mode);
        assert.equal(protectedState(h.c),before);
        for(const id of modes.filter(id=>id!==mode))assert.equal(JSON.stringify(h.c.state.wheelRosters[id]),others[id]);
    }
});

test('empty roster remains empty across app reload and save/restore; new modes are not duplicated',async()=>{
    const first=harness();first.c.wheelRosterState();first.c.wheelClearRoster('stage');
    const second=harness(JSON.parse(JSON.stringify(first.c.state)));
    for(let i=0;i<3;i++)second.c.wheelRosterState();
    assert.equal(second.c.wheelRosterStudents('stage',false).length,0);
    assert.equal(second.c.wheelRosterStudents('wheel',false).length,2);
    assert.equal(second.c.wheelRosterStudents('duck',false).length,2);
});

test('select/unselect, remove, and add update only one mode, never shared student data',()=>{
    const h=harness();h.c.wheelRosterState();const before=protectedState(h.c);
    const item=h.c.wheelRosterStudents('duck')[0];h.c.wheelSetRosterEnabled('duck',item.id,false);
    assert.equal(h.c.wheelRosterStudents('duck').length,1);
    assert.equal(h.c.wheelRosterStudents('wheel').length,2);
    h.c.wheelSelectAllRoster('duck',true);assert.equal(h.c.wheelRosterStudents('duck').length,2);
    h.c.wheelRemoveRosterStudent('duck',item.id);assert.equal(h.c.wheelRosterStudents('duck',false).length,1);
    h.element('wheel-roster-add-duck').value='Bạn mới riêng';
    h.c.wheelAddRosterStudent('duck');assert.equal(h.c.wheelRosterStudents('duck').length,2);
    assert.equal(h.c.wheelRosterStudents('duck').at(-1).sourceStudentId,'');
    assert.equal(protectedState(h.c),before);
});

test('copy class roster is detached, replaces only one mode, and filters other classes',()=>{
    const h=harness();h.c.wheelRosterState();h.c.state.students.push({id:3,name:'Lớp khác',className:'4A'});
    h.c.wheelClearRoster('duck');h.c.wheelCopyClassRoster('duck');
    assert.equal(h.c.wheelRosterStudents('duck').length,2);
    h.c.state.students[0].name='Changed after copy';
    assert.equal(h.c.wheelRosterStudents('duck')[0].name,'Nguyễn Văn A');
    assert.equal(h.c.wheelRosterStudents('wheel')[0].name,'Nguyễn Văn A');
});

test('file parser supports one-column names, numbered table, codes, and same-name distinct students',()=>{
    const h=harness();
    assert.deepEqual(Array.from(h.c.wheelParseRosterRows([['Họ tên'],['Một'],['Hai']],'wheel'),s=>s.name),['Một','Hai']);
    assert.deepEqual(Array.from(h.c.wheelParseRosterRows([[1,'Một'],[2,'Hai']],'wheel'),s=>s.name),['Một','Hai']);
    const rows=[['Mã định danh','Họ và tên'],['A','Cùng tên'],['B','Cùng tên'],['A','Dòng trùng mã']];
    assert.equal(h.c.wheelParseRosterRows(rows,'wheel').length,2);
    assert.equal(h.c.wheelParseRosterRows([['Cùng tên'],['Cùng tên']],'wheel').length,2);
});

test('invalid/cancelled import preserves current roster and every other list',async()=>{
    const h=harness();h.c.wheelRosterState();const before=JSON.stringify(h.c.state);
    h.c.workbook={SheetNames:['Hướng dẫn'],Sheets:{'Hướng dẫn':{rows:[['Họ tên'],['Không phải danh sách']]}}};
    await h.c.wheelHandleRosterImport({files:[{name:'bad.xlsx',arrayBuffer:async()=>new ArrayBuffer(0)}]},'stage');
    assert.equal(JSON.stringify(h.c.state),before);assert.equal(h.toasts.at(-1).type,'error');
    h.c.confirmResult=false;await importNames(h,'wheel',['Mới']);
    assert.equal(JSON.stringify(h.c.state),before);
});

test('text-file import works and never touches global students',async()=>{
    const h=harness();h.c.wheelRosterState();const before=protectedState(h.c);
    await h.c.wheelHandleRosterImport({files:[{name:'names.txt',text:async()=> 'Họ tên\nAn riêng\nBình riêng'}],value:'selected'},'duck');
    assert.deepEqual(Array.from(h.c.wheelRosterStudents('duck'),s=>s.name),['An riêng','Bình riêng']);
    assert.equal(protectedState(h.c),before);
});

test('mutations and file imports are blocked while corresponding mode is spinning',async()=>{
    for(const mode of modes){
        const h=harness();h.c.wheelRosterState();const before=JSON.stringify(h.c.state);
        h.evaluate(mode==='wheel'?'isSpinning=true':mode==='stage'?'isStagePlaying=true':'isDuckRacing=true');
        h.c.wheelClearRoster(mode);h.c.wheelCopyClassRoster(mode);
        h.c.wheelSetRosterEnabled(mode,h.c.wheelRosterStudents(mode)[0].id,false);
        await importNames(h,mode,['Blocked']);
        assert.equal(JSON.stringify(h.c.state),before);
    }
});

test('all three views expose import/clear/copy/selection without reload calls',()=>{
    const h=harness();
    for(const mode of modes){
        h.evaluate("vongQuayTab='"+mode+"'");
        const ui=h.c.renderViewVongQuay();
        assert.match(ui,/Nhập DS/);assert.match(ui,/Xóa DS/);assert.match(ui,/Lấy DS lớp hiện tại/);assert.match(ui,/Chọn học sinh/);
        assert.ok(ui.includes('wheel-roster-file-'+mode));
    }
    assert.doesNotMatch(source,/(?:window\.)?location\.reload\s*\(/);
});

test('wheel, stage, and duck actual player sources use only selected private entries; group mode still works',()=>{
    const h=harness();h.c.wheelRosterState();
    for(const mode of modes)h.c.state.wheelRosters[mode].students=[{id:'private-'+mode,name:'Riêng '+mode,enabled:true},{id:'off-'+mode,name:'Not selected',enabled:false}];
    h.c.setupWheel();assert.equal(h.evaluate('wheelItems.length'),1);assert.equal(h.evaluate('wheelItems[0].name'),'Riêng wheel');
    h.c.startStageRaffle();assert.equal(h.evaluate('stageCardsData.length'),1);assert.equal(h.evaluate('stageCardsData[0].name'),'Riêng stage');
    h.evaluate('isStagePlaying=false');h.c.startDuckRace();
    assert.equal(h.evaluate('duckRaceData.length'),1);assert.equal(h.evaluate('duckRaceData[0].student.name'),'Riêng duck');
    h.evaluate("wheelMode='group'");h.c.setupWheel();assert.equal(h.evaluate('wheelItems[0].name'),'Tổ 1');
});

test('imported-only winner cannot write global data; linked copied winner still opens correct points student',()=>{
    const h=harness();h.c.wheelRosterState();const before=protectedState(h.c);
    const copied=h.c.wheelRosterStudents('wheel')[0];h.c.wheelRewardStudent('wheel',copied.id);
    assert.equal(h.c.selectedForPoints,1);assert.equal(protectedState(h.c),before);
    h.c.state.wheelRosters.duck.students=[{id:'import-only',name:'No shared record',enabled:true,sourceStudentId:''}];
    h.c.selectedForPoints=null;h.c.wheelRewardStudent('duck','import-only');
    assert.equal(h.c.selectedForPoints,null);assert.equal(protectedState(h.c),before);
});

test('duck ranking falls back to private roster and resets after private list is cleared',()=>{
    const h=harness();h.c.wheelRosterState();h.c.state.wheelRosters.duck.students=[{id:'custom',name:'Vịt riêng',enabled:true}];
    h.element('duck-ranking-panel').classList.contains=()=>true;
    h.c.toggleDuckRaceRanking();assert.match(h.element('duck-ranking-panel').innerHTML,/Vịt riêng/);
    assert.doesNotMatch(h.element('duck-ranking-panel').innerHTML,/Nguyễn Văn A/);
    h.evaluate("duckRaceLastRanking=[{student:{name:'Cũ'},rank:1}]");h.c.wheelClearRoster('duck');
    assert.equal(h.evaluate('duckRaceLastRanking.length'),0);assert.equal(h.evaluate('duckRaceData.length'),0);
});

