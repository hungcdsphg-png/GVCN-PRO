// Đọc Word .doc nhị phân trong Vercel Node.js. Không lưu tệp/không ghi vào dữ liệu học sinh.
import WordExtractor from 'word-extractor';
export default async function handler(req,res){
    res.setHeader('Cache-Control','no-store');
    if(req.method!=='POST')return res.status(405).json({error:'Chỉ hỗ trợ POST.'});
    try{
        const data=String(req.body?.data||'');
        if(!data||data.length>13_000_000||!/^[A-Za-z0-9+/=]+$/.test(data))return res.status(400).json({error:'Tệp Word rỗng, sai định dạng hoặc vượt dung lượng.'});
        const buffer=Buffer.from(data,'base64');
        if(buffer.length>9_000_000)return res.status(413).json({error:'File Word .doc vượt 9MB.'});
        const document=await new WordExtractor().extract(buffer);
        const text=[document.getBody(),document.getTextboxes({includeHeadersAndFooters:false})].filter(Boolean).join('\n');
        if(!text.trim())throw new Error('Tài liệu không chứa văn bản có thể đọc.');
        return res.status(200).json({text});
    }catch(error){return res.status(422).json({error:`Không trích xuất được Word .doc: ${error.message||error}`});}
}
