/* Minimal read-only .doc (OLE2/Word 97-2003) text extraction for KHDH.
   This does not execute macros, modify files, or guess missing lessons. */
(function(root){
'use strict';
function read(input){
 const b=input instanceof Uint8Array?input:new Uint8Array(input);
 const view=new DataView(b.buffer,b.byteOffset,b.byteLength);
 const u16=i=>view.getUint16(i,true),u32=i=>view.getUint32(i,true);
 if(b.length<512 || [0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1].some((v,i)=>b[i]!==v))throw new Error('Không phải tệp Word .doc dạng OLE hợp lệ.');
 const sec=2**u16(30),miniSec=2**u16(32);if(![512,4096].includes(sec)||miniSec!==64)throw new Error('Định dạng .doc chưa được hỗ trợ.');
 const END=0xfffffffe,FREE=0xffffffff;const off=s=>(s+1)*sec;
 const difat=[];for(let i=0;i<109;i++){const s=u32(76+i*4);if(s!==FREE)difat.push(s);}
 let difatSid=u32(68),numDIFAT=u32(72);
 for(let d=0;d<numDIFAT&&difatSid<0xfffffffa&&d<100;d++){
  const pos=off(difatSid);if(pos+sec>b.length)throw new Error('Tệp .doc hỏng bảng FAT.');
  for(let i=0;i<sec/4-1;i++){const s=u32(pos+i*4);if(s!==FREE)difat.push(s);}
  difatSid=u32(pos+sec-4);
 }
 const fat=[];for(const sector of difat){const pos=off(sector);if(pos+sec>b.length)throw new Error('Tệp .doc thiếu FAT.');for(let i=0;i<sec/4;i++)fat.push(u32(pos+4*i));}
 const chain=(start,array,limit=100000)=>{const out=[],used=new Set();let s=start;while(s<0xfffffffa){if(!Number.isInteger(s)||s<0||s>=array.length||used.has(s)||out.length>limit)throw new Error('Chuỗi dữ liệu Word không hợp lệ.');out.push(s);used.add(s);s=array[s];}return out;};
 const concat=(parts,len)=>{const out=new Uint8Array(len??parts.reduce((x,y)=>x+y.length,0));let pos=0;for(const p of parts){out.set(p.subarray(0,Math.max(0,out.length-pos)),pos);pos+=p.length;if(pos>=out.length)break;}return out;};
 const getBig=(start,size)=>{if(size===0)return new Uint8Array(0);const parts=chain(start,fat).map(s=>{const p=off(s);if(p+sec>b.length)throw new Error('File Word bị cắt dữ liệu.');return b.subarray(p,p+sec);});return concat(parts,size);};
 const dir=getBig(u32(48));const entries=[];
 for(let i=0;i+128<=dir.length;i+=128){const d=new DataView(dir.buffer,dir.byteOffset+i,128),nameLen=d.getUint16(64,true),type=dir[i+66];if(!type||nameLen<2||nameLen>64)continue;let name='';for(let j=0;j<nameLen-2;j+=2)name+=String.fromCharCode(d.getUint16(j,true));entries.push({name,type,start:d.getUint32(116,true),size:d.getUint32(120,true)});}
 const rootEntry=entries.find(e=>e.type===5),document=entries.find(e=>e.name==='WordDocument');if(!rootEntry||!document)throw new Error('Không tìm thấy văn bản WordDocument trong tệp .doc.');
 const miniFAT=[];const miniFatStart=u32(60),miniFatCount=u32(64);
 if(miniFatCount&&miniFatStart<0xfffffffa){for(const s of chain(miniFatStart,fat)){const p=off(s);for(let i=0;i<sec/4;i++)miniFAT.push(u32(p+4*i));}}
 let miniStream=null;
 const stream=entry=>{
  if(!entry||!entry.size)return new Uint8Array(0);
  if(entry.size<u32(56)){
   if(!miniStream)miniStream=getBig(rootEntry.start,rootEntry.size);
   const parts=chain(entry.start,miniFAT).map(s=>miniStream.subarray(s*miniSec,(s+1)*miniSec));return concat(parts,entry.size);
  }
  return getBig(entry.start,entry.size);
 };
 const wd=stream(document),wv=new DataView(wd.buffer,wd.byteOffset,wd.byteLength);
 if(wd.length<64)throw new Error('Luồng WordDocument thiếu thông tin.');
 const tableName=wv.getUint16(10,true)&0x0200?'1Table':'0Table',table=stream(entries.find(e=>e.name===tableName));
 if(!table.length)throw new Error('Không tìm thấy bảng đoạn văn trong .doc.');
 const tv=new DataView(table.buffer,table.byteOffset,table.byteLength);
 // FIB: base (32 bytes), FibRgW, FibRgLw, FibRgFcLcb pairs. fcClx is pair number 33 (0-index).
 let p=32;if(p+2>wd.length)throw new Error('FIB .doc không hợp lệ.');let n=wv.getUint16(p,true);p+=2+2*n;
 if(p+2>wd.length)throw new Error('Thiếu FibRgLw.');n=wv.getUint16(p,true);p+=2+4*n;
 if(p+2>wd.length)throw new Error('Thiếu FibRgFcLcb.');n=wv.getUint16(p,true);p+=2;
 if(n<=33||p+8*34>wd.length)throw new Error('Tệp Word không có bảng phân đoạn chuẩn.');
 const clxStart=wv.getUint32(p+8*33,true),clxSize=wv.getUint32(p+8*33+4,true);
 if(clxStart+clxSize>table.length||!clxSize)throw new Error('Không tìm được phân đoạn văn bản trong .doc.');
 let cp=clxStart,plcStart=-1,plcSize=0;
 while(cp<clxStart+clxSize){const typ=table[cp++];if(typ===1){if(cp+2>table.length)break;const sz=tv.getUint16(cp,true);cp+=2+sz;}
  else if(typ===2){if(cp+4>table.length)break;plcSize=tv.getUint32(cp,true);plcStart=cp+4;break;}
  else break;
 }
 if(plcStart<0||plcSize<16||(plcSize-4)%12!==0||plcStart+plcSize>table.length)throw new Error('Bảng Piece Table của Word bị lỗi.');
 const pieces=(plcSize-4)/12,pcdStart=plcStart+(pieces+1)*4;let content='';
 for(let i=0;i<pieces;i++){
  const a=tv.getUint32(plcStart+i*4,true),z=tv.getUint32(plcStart+(i+1)*4,true);if(z<=a)continue;
  const fc=tv.getUint32(pcdStart+i*8+2,true),compressed=!!(fc&0x40000000),byteStart=compressed?(fc&0x3fffffff)/2:fc,bytes=(z-a)*(compressed?1:2);
  if(byteStart<0||byteStart+bytes>wd.length)throw new Error('Một đoạn Word nằm ngoài tệp.');
  const piece=wd.subarray(byteStart,byteStart+bytes);
  content+=new TextDecoder(compressed?'windows-1258':'utf-16le',{fatal:false}).decode(piece);
 }
 content=content.replace(/[\u0000-\u0006\u0008\u000b\u000c\u000e-\u001f]/g,' ').replace(/\u0007/g,' | ').replace(/\r/g,'\n').replace(/(?:\s*\|\s*){2,}/g,'\n').replace(/\n{4,}/g,'\n\n').trim();
 if(content.length<30)throw new Error('Không trích xuất đủ văn bản từ .doc để nhận diện KHDH. Hãy chuyển sang .docx.');
 return content;
}
root.KHDHDocReader={read};
})(typeof window!=='undefined'?window:globalThis);
