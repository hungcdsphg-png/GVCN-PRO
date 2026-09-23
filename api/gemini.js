const MODEL_CANDIDATES = [
  'gemini-3.5-flash-lite',   // ưu tiên tốc độ
  'gemini-3.7-flash',        // fallback chất lượng khi cần
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite'
];

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-gemini-api-key');
  res.setHeader('Cache-Control', 'no-store');
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body); } catch { return {}; }
}

function buildQuizSchema(count) {
  return {
    type: 'array', minItems: count, maxItems: count,
    items: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        options: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'string' } },
        correctIndex: { type: 'integer', minimum: 0, maximum: 3 }
      },
      required: ['text', 'options', 'correctIndex'],
      additionalProperties: false
    }
  };
}

function gradeGuide(grade) {
  const n = Number(String(grade || '').match(/[1-5]/)?.[0]);
  const map = {
    1: 'Ngôn ngữ rất ngắn, từ quen thuộc, tình huống gần gũi; ưu tiên nhận biết và thao tác một bước.',
    2: 'Câu ngắn, rõ; ưu tiên kiến thức nền tảng và bài toán/tình huống một bước hoặc rất ít bước.',
    3: 'Ngôn ngữ rõ ràng; có thể kiểm tra hiểu, vận dụng cơ bản và bài toán ngắn phù hợp học sinh lớp 3.',
    4: 'Có thể có suy luận vừa phải nhưng không dùng khái niệm chuyên sâu của THCS; dữ kiện phải đủ và rõ.',
    5: 'Có thể tổng hợp/vận dụng 1-2 bước ở mức cuối tiểu học; tránh kiến thức chuyên biệt vượt cấp.'
  };
  return map[n] || 'Nội dung phải đúng mức tiểu học, ngắn gọn và phù hợp lứa tuổi.';
}

function buildQuizPrompt({ subject, topic, teacherRequirement, count, grade, difficulty, homeroomClass, existingQuestions = [] }) {
  const avoid = existingQuestions.length ? `\nKHÔNG lặp lại các câu đã có: ${existingQuestions.slice(0, 80).map(v => `"${v}"`).join('; ')}` : '';
  return `Bạn là giáo viên chủ nhiệm tiểu học Việt Nam. Hãy tạo đúng ${count} câu hỏi trắc nghiệm.
Khối lớp: ${grade}${homeroomClass ? `; lớp chủ nhiệm: ${homeroomClass}` : ''}
Môn học: ${subject || 'Theo yêu cầu giáo viên'}
Chủ đề: ${topic}
Yêu cầu cụ thể của giáo viên: ${teacherRequirement || topic}
Số lượng: ${count}; Độ khó: ${difficulty}.${avoid}

YÊU CẦU CỦA GIÁO VIÊN LÀ ƯU TIÊN CAO NHẤT. Không tự thay đổi dạng bài, phạm vi kiến thức hoặc chủ đề. Nếu giáo viên đưa ví dụ/dạng mẫu thì phải giữ đúng dạng đó; không đổi phép tính thành bài toán có lời văn nếu không được yêu cầu. Nếu giáo viên giới hạn bảng nhân hoặc phạm vi, tuyệt đối không ra ngoài giới hạn.
Hướng dẫn theo khối: ${gradeGuide(grade)}
Trước khi xuất JSON, tự kiểm tra thầm từng câu:
- đúng môn, chủ đề, yêu cầu cụ thể và khối lớp;
- đúng 4 lựa chọn, duy nhất 1 lựa chọn đúng;
- các lựa chọn không trùng/đồng nghĩa gây nhiều đáp án đúng;
- câu hỏi đủ dữ kiện, không mơ hồ, không đánh đố, không lặp;
- với Toán: tự tính lại từng phép tính; correctIndex bắt buộc trỏ tới phương án có giá trị đúng;
- dùng tiếng Việt tự nhiên, ngắn gọn, không đưa nội dung thời sự dễ thay đổi;
- correctIndex là vị trí đáp án đúng từ 0 đến 3.
Chỉ trả dữ liệu theo JSON Schema, không giải thích.`;
}

function normalizedText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function arithmeticAnswer(text) {
  const clean = String(text || '').replace(/,/g, '.');
  const match = clean.match(/(-?\d+(?:\.\d+)?)\s*([×xX*+\-÷/:])\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const a = Number(match[1]), b = Number(match[3]);
  if (match[2] === '+' ) return a + b;
  if (match[2] === '-' ) return a - b;
  if (/[×xX*]/.test(match[2])) return a * b;
  return b === 0 ? null : a / b;
}

function optionNumber(value) {
  const match = String(value || '').replace(/,/g, '.').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function strictNormalizeQuestions(value, count, params = {}) {
  if (!Array.isArray(value) || value.length !== count) throw Object.assign(new Error('AI chưa trả đủ số câu.'), { contentInvalid: true });
  const seen = new Set((params.existingQuestions || []).map(normalizedText));
  return value.map((q, index) => {
    const text = String(q?.text || '').trim();
    if (text.length < 4) throw Object.assign(new Error(`Câu ${index + 1} quá ngắn.`), { contentInvalid: true });
    if (!Array.isArray(q?.options) || q.options.length !== 4) throw Object.assign(new Error(`Câu ${index + 1} không đủ 4 đáp án.`), { contentInvalid: true });
    const options = q.options.map(v => String(v ?? '').trim());
    if (options.some(v => !v)) throw Object.assign(new Error(`Câu ${index + 1} có đáp án rỗng.`), { contentInvalid: true });
    const unique = new Set(options.map(v => v.toLocaleLowerCase('vi-VN').replace(/\s+/g,' ')));
    if (unique.size !== 4) throw Object.assign(new Error(`Câu ${index + 1} có đáp án trùng.`), { contentInvalid: true });
    const correctIndex = Number(q?.correctIndex);
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) throw Object.assign(new Error(`Câu ${index + 1} thiếu đáp án đúng.`), { contentInvalid: true });
    const key = normalizedText(text);
    if (seen.has(key)) throw Object.assign(new Error(`Câu ${index + 1} bị trùng với câu khác hoặc thư viện.`), { contentInvalid: true });
    seen.add(key);
    const mathContext = /toan/i.test(normalizedText(params.subject)) || /(bang bao nhieu|tinh|ket qua)/i.test(normalizedText(text));
    const expected = mathContext ? arithmeticAnswer(text) : null;
    if (expected !== null) {
      const numeric = options.map(optionNumber);
      const correctMatches = numeric.filter(v => v !== null && Math.abs(v - expected) < 1e-9).length;
      if (numeric[correctIndex] === null || Math.abs(numeric[correctIndex] - expected) >= 1e-9 || correctMatches !== 1) {
        throw Object.assign(new Error(`Câu ${index + 1} có phép tính nhưng đáp án/correctIndex chưa chính xác.`), { contentInvalid: true });
      }
    }
    return { text, options, correctIndex };
  });
}

function extractJson(data) {
  const raw = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
  if (!raw) throw Object.assign(new Error('Gemini không trả về nội dung.'), { contentInvalid: true });
  try { return JSON.parse(raw.replace(/```json/gi,'').replace(/```/g,'').trim()); }
  catch { throw Object.assign(new Error('JSON từ Gemini không hợp lệ.'), { contentInvalid: true }); }
}

function thinkingLevelFor(model) {
  return model === 'gemini-3.7-flash' ? 'low' : 'minimal';
}

async function googleGenerate({ apiKey, model, body }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 22000);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body), signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data?.error?.message || `Gemini API lỗi ${response.status}`);
      error.status = response.status; error.googleStatus = data?.error?.status || '';
      throw error;
    }
    return data;
  } catch (err) {
    if (err?.name === 'AbortError') throw Object.assign(new Error('Gemini phản hồi quá lâu. Hãy thử lại.'), { status: 504 });
    throw err;
  } finally { clearTimeout(timer); }
}

function shouldTryNextModel(err) {
  if (!err) return true;
  if ([401,403,429].includes(err.status)) return false;
  if (err.contentInvalid) return true;
  const msg = String(err.message || '');
  return [400,404,500,502,503,504].includes(err.status) || /model|not found|unsupported|not available/i.test(msg);
}

async function validateApiKey(apiKey) {
  let lastError;
  for (const model of MODEL_CANDIDATES) {
    try {
      await googleGenerate({ apiKey, model, body: {
        contents: [{ parts: [{ text: 'Chỉ trả lời: OK' }] }],
        generationConfig: { maxOutputTokens: 12, thinkingConfig: { thinkingLevel: thinkingLevelFor(model) } }
      }});
      return model;
    } catch (err) {
      lastError = err;
      if (!shouldTryNextModel(err)) break;
    }
  }
  throw lastError || new Error('Không có model Gemini phù hợp.');
}

async function generateWithFallback(apiKey, params) {
  let lastError;
  const schema = buildQuizSchema(params.count);
  for (const model of MODEL_CANDIDATES) {
    try {
      const requestBody = {
        contents: [{ parts: [{ text: buildQuizPrompt(params) }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseJsonSchema: schema,
          maxOutputTokens: Math.max(1000, params.count * 240),
          thinkingConfig: { thinkingLevel: thinkingLevelFor(model) }
        }
      };
      let data = await googleGenerate({ apiKey, model, body: requestBody });
      let parsed = extractJson(data);
      try {
        return { model, questions: strictNormalizeQuestions(parsed, params.count, params) };
      } catch (validationError) {
        if (!validationError.contentInvalid) throw validationError;
        requestBody.contents.push({ role: 'model', parts: [{ text: JSON.stringify(parsed) }] });
        requestBody.contents.push({ role: 'user', parts: [{ text: `Kết quả trên không đạt kiểm tra: ${validationError.message} Hãy sửa toàn bộ danh sách, tự kiểm tra lại phép tính/chủ đề/yêu cầu giáo viên và trả đúng JSON Schema. Không giải thích.` }] });
        data = await googleGenerate({ apiKey, model, body: requestBody });
        parsed = extractJson(data);
        return { model, questions: strictNormalizeQuestions(parsed, params.count, params) };
      }
    } catch (err) {
      lastError = err;
      if (!shouldTryNextModel(err)) break;
    }
  }
  throw lastError || new Error('Không tạo được câu hỏi hợp lệ.');
}


function regularEvaluationSchema() {
  return {
    type: 'object',
    properties: {
      monHoc: { type:'object', properties:{ ma:{type:'string'}, noiDung:{type:'string'} }, required:['ma','noiDung'], additionalProperties:false },
      nangLucChung: { type:'object', properties:{ ma:{type:'string'}, noiDung:{type:'string'} }, required:['ma','noiDung'], additionalProperties:false },
      nangLucDacThu: { type:'object', properties:{ ma:{type:'string'}, noiDung:{type:'string'} }, required:['ma','noiDung'], additionalProperties:false },
      phamChat: { type:'object', properties:{ ma:{type:'string'}, noiDung:{type:'string'} }, required:['ma','noiDung'], additionalProperties:false }
    },
    required:['monHoc','nangLucChung','nangLucDacThu','phamChat'],
    additionalProperties:false
  };
}

function normalizeRegularEvaluationResult(obj) {
  const short = (v,n) => String(v || '').slice(0,n);
  const one = (v) => ({ ma:short(v?.ma,20), noiDung:short(v?.noiDung,250) });
  return { monHoc:one(obj?.monHoc), nangLucChung:one(obj?.nangLucChung), nangLucDacThu:one(obj?.nangLucDacThu), phamChat:one(obj?.phamChat) };
}

async function generateRegularEvaluation(apiKey, prompt) {
  const system = `Bạn là trợ lý hỗ trợ giáo viên tiểu học Việt Nam viết nhận xét đánh giá thường xuyên học sinh. Mỗi nội dung dưới 250 ký tự; tuyệt đối không đưa tên riêng học sinh; dùng “Em”; nội dung tích cực, bám sát mức Tốt/Đạt/Cần cố gắng. Nếu prompt có nhận xét và mức của tháng trước, phải thể hiện sự tiến bộ, duy trì hoặc nội dung cần tiếp tục rèn luyện nhưng không sao chép nguyên văn. Nếu có KHDH thì lồng ghép phù hợp vào nhận xét môn học; không tự tạo mã nhận xét. Chỉ trả JSON.`;
  let lastError;
  for (const model of MODEL_CANDIDATES) {
    try {
      const data = await googleGenerate({ apiKey, model, body:{
        contents:[{parts:[{text:String(prompt || '')}]}],
        systemInstruction:{parts:[{text:system}]},
        generationConfig:{ responseMimeType:'application/json', responseJsonSchema:regularEvaluationSchema(), maxOutputTokens:900, thinkingConfig:{thinkingLevel:thinkingLevelFor(model)} }
      }});
      const raw = data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('') || '';
      if (!raw) throw Object.assign(new Error('Gemini không trả về nhận xét.'), { contentInvalid:true });
      let parsed; try { parsed = JSON.parse(raw.replace(/```json/gi,'').replace(/```/g,'').trim()); } catch { throw Object.assign(new Error('JSON nhận xét không hợp lệ.'), {contentInvalid:true}); }
      return { model, result:normalizeRegularEvaluationResult(parsed) };
    } catch (err) { lastError=err; if(!shouldTryNextModel(err)) break; }
  }
  throw lastError || new Error('Không tạo được nhận xét.');
}

async function analyzeRegularEvaluationKHDH(apiKey, { documentText, prompt }) {
  let lastError;
  const text = String(documentText || '').slice(0,60000);
  for (const model of MODEL_CANDIDATES) {
    try {
      const data = await googleGenerate({ apiKey, model, body:{ contents:[{parts:[{text:`${text}\n\n${String(prompt||'')}`}]}], generationConfig:{maxOutputTokens:800,thinkingConfig:{thinkingLevel:thinkingLevelFor(model)}} }});
      const result = data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim() || '';
      if (!result) throw Object.assign(new Error('Gemini không trả về nội dung KHDH.'), {contentInvalid:true});
      return { model, text:result };
    } catch(err) { lastError=err; if(!shouldTryNextModel(err)) break; }
  }
  throw lastError || new Error('Không phân tích được KHDH.');
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Chỉ hỗ trợ POST.' });
  const apiKey = String(req.headers['x-gemini-api-key'] || '').trim();
  if (!apiKey) return res.status(400).json({ error: 'Thiếu Google Gemini API Key.' });
  const body = parseBody(req);
  const action = body.action || 'generate';

  try {
    if (action === 'validate') {
      const model = await validateApiKey(apiKey);
      return res.status(200).json({ ok: true, model });
    }
    if (action === 'regular-evaluation-comment') {
      const { model, result } = await generateRegularEvaluation(apiKey, body.prompt);
      return res.status(200).json({ ok:true, model, result });
    }
    if (action === 'regular-evaluation-khdh') {
      const { model, text } = await analyzeRegularEvaluationKHDH(apiKey, body);
      return res.status(200).json({ ok:true, model, text });
    }
    if (action !== 'generate') return res.status(400).json({ error: 'action không hợp lệ.' });
    const topic = String(body.topic || '').trim();
    if (!topic) return res.status(400).json({ error: 'Vui lòng nhập môn học/chủ đề.' });
    const params = {
      topic,
      subject: String(body.subject || '').trim(),
      teacherRequirement: String(body.teacherRequirement || '').trim(),
      count: Math.max(1, Math.min(20, Number(body.count) || 5)),
      grade: String(body.grade || 'Tiểu học').trim(),
      difficulty: String(body.difficulty || 'Vừa').trim(),
      homeroomClass: String(body.homeroomClass || '').trim(),
      existingQuestions: Array.isArray(body.existingQuestions) ? body.existingQuestions.map(v => String(v || '').trim()).filter(Boolean).slice(0, 100) : []
    };
    const { model, questions } = await generateWithFallback(apiKey, params);
    return res.status(200).json({ ok: true, model, questions });
  } catch (err) {
    const message = String(err?.message || 'Không gọi được Gemini API.');
    const googleStatus = String(err?.googleStatus || '');
    let status = Number(err?.status) || 500;
    if (status < 400 || status > 599) status = 500;
    return res.status(status).json({ error: message, code: googleStatus || undefined });
  }
}
