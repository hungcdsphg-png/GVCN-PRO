import WordExtractor from 'word-extractor';

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Chỉ hỗ trợ POST.'});
  try{
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if(!body?.base64||typeof body.base64!=='string')return res.status(400).json({error:'Chưa có file Word.'});
    if(body.base64.length>4100000)return res.status(413).json({error:'File .doc quá lớn (tối đa 3 MB).'});
    const buffer=Buffer.from(body.base64,'base64');
    if(buffer.length<512||buffer.length>3100000)return res.status(400).json({error:'Kích thước Word không hợp lệ.'});
    const extractor=new WordExtractor();
    const doc=await extractor.extract(buffer);
    const text=[doc.getBody(),doc.getHeaders(),doc.getTextboxes(),doc.getFootnotes(),doc.getEndnotes()].filter(Boolean).join('\n');
    if(!text.trim())return res.status(422).json({error:'Không trích xuất được nội dung Word.'});
    return res.status(200).json({text});
  }catch(error){console.error('Extract .doc failed',error);return res.status(422).json({error:'File .doc hỏng, bảo vệ hoặc không thể đọc. Hãy lưu thành .docx/PDF.'});}
}
