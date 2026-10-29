/* GVCN PRO – importer đánh giá định kỳ. Không ghi vào hồ sơ học sinh chung.
 * Dùng XLSX/SheetJS đã đóng gói sẵn trong module periodic-evaluation.
 */
(function (root) {
  'use strict';
  const STORAGE_KEY = 'gvcn_periodic_csdl_v1';
  const clean = value => String(value == null ? '' : value).trim();
  const norm = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/&/g, ' va ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const code = value => clean(value).replace(/\s+/g, '').replace(/\.0$/, '').toUpperCase();
  const date = value => {
    if (value instanceof Date && !isNaN(value.getTime())) return `${String(value.getDate()).padStart(2,'0')}/${String(value.getMonth()+1).padStart(2,'0')}/${value.getFullYear()}`;
    if (typeof value === 'number' && value > 1000 && value < 120000) {
      const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000);
      return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`;
    }
    const s = clean(value);
    let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:\s|T|$)/);
    if (m) return `${m[3].padStart(2,'0')}/${m[2].padStart(2,'0')}/${m[1]}`;
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (m) return `${m[1].padStart(2,'0')}/${m[2].padStart(2,'0')}/${m[3]}`;
    return s;
  };
  const dateKey = v => { const s = date(v); const m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : norm(s); };
  const contextKey = (grade, subject, term) => JSON.stringify([clean(grade),norm(subject),norm(term)]);
  const loadAll = () => { try { const data=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}'); return data && typeof data==='object' && !Array.isArray(data)?data:{}; } catch { return {}; } };
  const load = (grade,subject,term) => { const list=loadAll()[contextKey(grade,subject,term)]; return Array.isArray(list)?list.map(s=>({...s})):[]; };
  const save = (grade,subject,term,students) => {
    const all=loadAll(); all[contextKey(grade,subject,term)] = students.map(s=>({...s,isProcessing:false}));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  };
  function sharedStudents() {
    try {
      if (root.parent && root.parent !== root && typeof root.parent.gvcnPeriodicGetSharedStudents==='function') {
        const current=root.parent.gvcnPeriodicGetSharedStudents();
        if (Array.isArray(current)) return current;
      }
    } catch (_) { /* khung iframe khác nguồn */ }
    try {
      const data=JSON.parse(localStorage.getItem('chuyen_tau_data')||'{}');
      return Array.isArray(data.students)?data.students:[];
    } catch { return []; }
  }
  const person = s => ({
    id: code(s.maDinhDanh ?? s.moetCode ?? s.maDinhDanhBo ?? s.code ?? s.studentCode ?? ''),
    name: clean(s.hoTen ?? s.name ?? s.fullName ?? ''),
    dob: dateKey(s.ngaySinh ?? s.dob ?? s.birthDate ?? s.dateOfBirth ?? '')
  });
  // Mã định danh luôn có mức ưu tiên cao nhất; chỉ fallback tên+ngày sinh khi file không có mã.
  function findPerson(target, list) {
    const p=person(target);
    if (p.id) {
      const found=list.filter(candidate=>person(candidate).id===p.id);
      return found.length===1?found[0]:null;
    }
    if (!p.name || !p.dob) return null;
    const found=list.filter(candidate=>{const a=person(candidate);return norm(a.name)===norm(p.name)&&a.dob===p.dob;});
    return found.length===1?found[0]:null;
  }
  function field(v) {
    const x=norm(v);
    if (!x) return '';
    if (x==='stt'||x==='so thu tu'||x==='tt') return 'stt';
    if ((x.includes('ma dinh danh')||x.includes('ma so hoc sinh')||x==='ma hoc sinh'||x==='ma so'||x==='ma bo gd dt'||x==='ma bgd')&&!x.includes('nhan xet')) return 'id';
    if (['ho ten','ho va ten','ten hoc sinh','ho va ten hoc sinh','ho ten hoc sinh','hoc sinh','ten hs'].includes(x)||x.startsWith('ho va ten ')) return 'name';
    if (x==='ns'||x.includes('ngay sinh')||x.includes('nam sinh')||x.includes('thang nam sinh'))return 'dob';
    if (x==='mon'||x==='mon hoc'||x==='ten mon hoc'||x==='mon hoc va hoat dong giao duc') return 'subject';
    if (x.includes('thoi diem')||x==='ky danh gia'||x==='ki danh gia'||x==='hoc ky') return 'term';
    if (x.includes('ma nhan xet'))return 'commentCode';
    if (x.includes('noi dung nhan xet')||x==='nhan xet'||x==='loi nhan xet'||x==='noi dung') return 'comment';
    if (x.includes('muc dat')||x.includes('muc do hoan thanh')||x.includes('muc danh gia')||x==='danh gia'||x.includes('xep loai')||x==='muc'||x==='ket qua danh gia') return 'level';
    if (x==='diem'||x.startsWith('diem ')||x==='ktdk'||x.includes('diem ktdk')||x.includes('diem kt')||x.includes('diem kiem tra')||x==='diem so') return 'score';
    return '';
  }
  const SUBJECT_ABBR = {'toan':['toan'], 'tieng viet':['tieng viet','tv'], 'khoa hoc':['khoa hoc'], 'lich su va dia ly':['lich su dia ly','lich su dia li','ls dl','lsdl'], 'lich su va dia li':['lich su dia ly','lich su dia li','ls dl','lsdl'], 'tu nhien va xa hoi':['tu nhien xa hoi','tnxh'], 'dao duc':['dao duc'], 'hoat dong trai nghiem':['hoat dong trai nghiem','hdtn'], 'giao duc the chat':['giao duc the chat','gdtc'], 'tin hoc':['tin hoc'], 'cong nghe':['cong nghe'], 'tieng anh':['tieng anh']};
  function subjectMatches(value, selected) {
    const v=norm(value), target=norm(selected);
    if (!v) return false;
    if(v===target||v.includes(target)||target.includes(v)&&v.length>=4)return true;
    const pieces=target.replace(/^(nghe thuat )/,'').replace(/( my thuat| am nhac)$/,'').trim();
    if (v===pieces&&pieces.length>=4)return true;
    const variants=SUBJECT_ABBR[target]||[];
    return variants.some(alt=>v===alt||v.includes(alt)&&alt.length>=5);
  }
  function sheetInfo(sheetName, worksheet, xlsx, subject) {
    const rows=xlsx.utils.sheet_to_json(worksheet,{header:1,defval:'',raw:true,blankrows:false});
    let best=null;
    for(let j=0;j<Math.min(60,rows.length);j++){
      for(const offset of [0,1]){
        if(j+offset>=rows.length)continue;
        const a=rows[j]||[], b=offset?rows[j+1]||[]:[];
        const n=Math.max(a.length,b.length), map={};
        for(let k=0;k<n;k++){
          const lower=field(b[k]), upper=field(a[k]);
          const f=lower||upper;
          if(f && map[f]===undefined)map[f]=k;
        }
        // sheet dữ liệu cần có họ tên hoặc mã định danh; nhận diện tối thiểu 1 cột dữ liệu.
        const identity=Number(map.name!==undefined)+Number(map.id!==undefined);
        const data=Number(map.score!==undefined)+Number(map.level!==undefined)+Number(map.comment!==undefined)+Number(map.commentCode!==undefined);
        if(!identity||!data)continue;
        const header=j+offset;
        const score=identity*8+data*4+Number(map.dob!==undefined)*3+Number(map.subject!==undefined)*3-0.02*j;
        if(!best||score>best.score)best={rows,header,map,score,sheetName};
      }
    }
    return best;
  }
  function selectSheet(workbook,xlsx,subject,explicit) {
    if(explicit){if(!workbook.Sheets[explicit])throw Error('Không tìm thấy Sheet đã chọn.');const x=sheetInfo(explicit,workbook.Sheets[explicit],xlsx,subject);if(!x)throw Error(`Sheet "${explicit}" không có các cột dữ liệu đánh giá hợp lệ.`);return x;}
    const sheets=workbook.SheetNames.map(name=>sheetInfo(name,workbook.Sheets[name],xlsx,subject)).filter(Boolean);
    if(!sheets.length)throw Error('Không tìm thấy Sheet có cột học sinh và cột đánh giá.');
    const matches=sheets.filter(sheet=>subjectMatches(sheet.sheetName,subject));
    if(matches.length)return matches.sort((a,b)=>b.score-a.score)[0];
    const distinctSubjectNames = sheets.filter(sheet=>/^(toan|tieng viet|khoa hoc|lich su|dao duc|tu nhien|tieng anh|tin hoc|cong nghe|hoat dong|the chat)/.test(norm(sheet.sheetName)));
    if(distinctSubjectNames.length===sheets.length && sheets.length>0)throw Error(`Không có Sheet phù hợp với môn ${subject}. Hãy kiểm tra lại môn hoặc file.`);
    return sheets.sort((a,b)=>b.score-a.score)[0];
  }
  function termKey(value) {
    const v=norm(value).replace(/\bhoc ky\b/g,'ky').replace(/\bhoc ki\b/g,'ki');
    const number=(v.match(/\b[12]\b/)||[])[0] || (v.match(/\bii\b/)?'2':v.match(/\bi\b/)?'1':'');
    const mid=v.startsWith('gk')||v.includes('giua');
    const end=v.startsWith('ck')||v.includes('cuoi');
    const short=v.match(/^(gk|ck)([12])$/);
    if(short)return short[1]+short[2];
    if(number&&(mid||end))return(mid?'gk':'ck')+number;
    return v;
  }
  function level(v) {
    const n=norm(v).toUpperCase();
    if(!n)return '';
    if(['T','HTT','TOT','HOAN THANH TOT'].includes(n))return 'T';
    if(['C','CHT','CHUA HOAN THANH','CHUA DAT'].includes(n))return 'C';
    if(['H','HT','HOAN THANH','DAT','D'].includes(n))return 'H';
    return '';
  }
  function score(v) {
    if(v===null||v===undefined||clean(v)==='') return null;
    const n=Number(clean(v).replace(',','.'));
    return Number.isFinite(n)&&n>=0&&n<=10?n:null;
  }
  function importWorkbook({workbook,xlsx,grade,subject,term,existing,roster,sheetName}) {
    const s=selectSheet(workbook,xlsx,subject,sheetName);
    const rows=(Array.isArray(existing)?existing:[]).map(x=>({...x}));
    const common=Array.isArray(roster)?roster:sharedStudents();
    const stats={updated:0,notFound:0,errors:0,skipped:0};
    const updatedKeys=new Set();
    const col=(row,key)=>s.map[key]===undefined?'':row[s.map[key]];
    for(let line=s.header+1;line<s.rows.length;line++) {
      const raw=s.rows[line]||[];
      if(raw.every(x=>clean(x)===''))continue;
      const name=clean(col(raw,'name'));
      const id=code(col(raw,'id'));
      const dob=date(col(raw,'dob'));
      const subjectInRow=clean(col(raw,'subject'));
      const termInRow=clean(col(raw,'term'));
      if(subjectInRow&&!subjectMatches(subjectInRow,subject)){stats.skipped++;continue;}
      if(termInRow&&termKey(termInRow)!==termKey(term)){stats.skipped++;continue;}
      if(!id&&(!name||!dob)){stats.errors++;continue;}
      const valueScore=clean(col(raw,'score'));
      const valueLevel=clean(col(raw,'level'));
      const valueComment=clean(col(raw,'comment'));
      const valueCommentCode=clean(col(raw,'commentCode'));
      if(!valueScore&&!valueLevel&&!valueComment&&!valueCommentCode){stats.errors++;continue;}
      if(valueScore && score(valueScore)===null){stats.errors++;continue;}
      if(valueLevel&&!level(valueLevel)){stats.errors++;continue;}
      const who={maDinhDanh:id,hoTen:name,ngaySinh:dob};
      let found=findPerson(who,rows);
      // Có dữ liệu lớp chung thì bắt buộc khớp học sinh chung để tránh ghi nhầm.
      const shared=common.length?findPerson(who,common):null;
      if(common.length&&!shared){stats.notFound++;continue;}
      if(!found){
        // Có dữ liệu lớp chung thì lấy thông tin chuẩn từ học sinh chung,
        // nhưng KHÔNG thêm học sinh vào state.students.
        const p=shared?person(shared):person(who);
        const no=Number.parseInt(clean(col(raw,'stt')),10);
        let uniqueNo=Number.isFinite(no)&&no>0?no:rows.length+1;
        while(rows.some(item=>Number(item.stt)===uniqueNo))uniqueNo++;
        found={stt:uniqueNo, maDinhDanh:p.id||id, hoTen:p.name||name, ngaySinh:date(shared?.birthDate??shared?.dob??dob)||dob, diem:0,mucDo:'',maNhanXet:'',noiDung:'',thoiDiem:'',isProcessing:false};
        rows.push(found);
      }
      if(valueScore!=='')found.diem=score(valueScore);
      if(valueLevel!=='')found.mucDo=level(valueLevel);
      if(valueComment!=='')found.noiDung=valueComment;
      if(valueCommentCode!=='')found.maNhanXet=valueCommentCode;
      if(termInRow)found.thoiDiem=termInRow;
      found.isProcessing=false;
      const unique=found.maDinhDanh?`id:${code(found.maDinhDanh)}`:`name:${norm(found.hoTen)}|${dateKey(found.ngaySinh)}`;
      if(!updatedKeys.has(unique)){updatedKeys.add(unique);stats.updated++;}
    }
    return {rows,stats,sheetName:s.sheetName,message:`Đã nhập dữ liệu thành công: ${stats.updated} học sinh được cập nhật, ${stats.notFound} học sinh không tìm thấy, ${stats.errors} dòng lỗi.${stats.skipped?` Bỏ qua ${stats.skipped} dòng khác môn/kỳ.`:''}`};
  }
  root.__GVCNPeriodicImporter={load,save,sharedStudents,importWorkbook,field,norm,code,date,person,findPerson,selectSheet,contextKey};
})(typeof window!=='undefined'?window:globalThis);
