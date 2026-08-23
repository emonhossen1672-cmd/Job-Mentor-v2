             // server.js
// এই সার্ভারটা চালাতে কোনো npm install লাগবে না — শুধু Node.js থাকলেই চলবে।
// রান করতে: node server.js   (তারপর ব্রাউজারে http://localhost:3000 খুলুন)

const http = require('http');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function readData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}
function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}
function sendJSON(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

// ---------- API হ্যান্ডলার ----------

function listExams(req, res) {
  const data = readData();
  const exams = data.exams.map((e) => ({
    id: e.id,
    title: e.title,
    category: e.category || 'সাধারণ',
    grade: e.grade || '',
    durationMinutes: e.durationMinutes,
    totalQuestions: e.sections.reduce((n, s) => n + s.questions.length, 0),
  }));
  sendJSON(res, 200, exams);
}

function getExam(req, res, examId) {
  const data = readData();
  const exam = data.exams.find((e) => e.id === examId);
  if (!exam) return sendJSON(res, 404, { message: 'পরীক্ষা পাওয়া যায়নি' });

  sendJSON(res, 200, {
    id: exam.id,
    title: exam.title,
    durationMinutes: exam.durationMinutes,
    sections: exam.sections.map((s) => ({
      name: s.name,
      questions: s.questions.map((q) => ({ id: q.id, text: q.text, options: q.options })),
    })),
  });
}

async function submitExam(req, res, examId) {
  const data = readData();
  const exam = data.exams.find((e) => e.id === examId);
  if (!exam) return sendJSON(res, 404, { message: 'পরীক্ষা পাওয়া যায়নি' });

  let body;
  try { body = await readBody(req); }
  catch { return sendJSON(res, 400, { message: 'ভুল ডেটা পাঠানো হয়েছে' }); }

  const name = (body.name || '').trim();
  const answers = body.answers || {};
  if (!name) return sendJSON(res, 400, { message: 'নাম দিতে হবে' });

  const allQuestions = exam.sections.flatMap((s) => s.questions);
  let correct = 0, wrong = 0, unanswered = 0;
  const reviewedQuestions = [];

  for (const q of allQuestions) {
    const selected = answers[q.id];
    const isAnswered = selected !== undefined && selected !== null;
    const isCorrect = isAnswered && Number(selected) === q.correctIndex;
    if (!isAnswered) unanswered++;
    else if (isCorrect) correct++;
    else wrong++;

    reviewedQuestions.push({
      id: q.id,
      text: q.text,
      options: q.options,
      correctIndex: q.correctIndex,
      selectedIndex: isAnswered ? Number(selected) : null,
      isCorrect,
    });
  }

  const score = +(correct - wrong * exam.negativeMark).toFixed(2);

  const submission = {
    id: 'sub_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    examId: exam.id,
    name,
    score,
    correct,
    wrong,
    unanswered,
    submittedAt: new Date().toISOString(),
  };

  data.submissions.push(submission);
  writeData(data);

  sendJSON(res, 200, { submission, questions: reviewedQuestions });
}

function getMerit(req, res, examId) {
  const data = readData();
  const list = data.submissions
    .filter((s) => s.examId === examId)
    .sort((a, b) => b.score - a.score)
    .map((s, i) => ({ rank: i + 1, name: s.name, score: s.score, submittedAt: s.submittedAt }));
  sendJSON(res, 200, list);
}

const DEFAULT_SECTION_NAMES = ['বাংলা', 'ইংরেজি', 'গণিত', 'সাধারণ জ্ঞান'];

function newId(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ---------- নতুন পরীক্ষা তৈরি করা ----------
async function createExam(req, res) {
  let body;
  try { body = await readBody(req); }
  catch { return sendJSON(res, 400, { message: 'ভুল ডেটা পাঠানো হয়েছে' }); }

  const title = (body.title || '').trim();
  if (!title) return sendJSON(res, 400, { message: 'পরীক্ষার নাম দিতে হবে' });

  const exam = {
    id: newId('exam'),
    title,
    category: (body.category || '').trim() || 'সাধারণ',
    grade: (body.grade || '').trim(),
    type: body.type === 'model' ? 'model' : 'live',
    durationMinutes: Number(body.durationMinutes) || 30,
    negativeMark: Number(body.negativeMark) || 0,
    sections: DEFAULT_SECTION_NAMES.map((name) => ({ name, questions: [] })),
  };

  const data = readData();
  data.exams.unshift(exam);
  writeData(data);

  sendJSON(res, 200, { id: exam.id, title: exam.title, type: exam.type });
}

// ---------- একটা সেকশনে একসাথে অনেক প্রশ্ন যোগ করা ----------
async function bulkAddQuestions(req, res, examId) {
  let body;
  try { body = await readBody(req); }
  catch { return sendJSON(res, 400, { message: 'ভুল ডেটা পাঠানো হয়েছে' }); }

  const sectionName = body.sectionName;
  const questions = Array.isArray(body.questions) ? body.questions : [];

  const data = readData();
  const exam = data.exams.find((e) => e.id === examId);
  if (!exam) return sendJSON(res, 404, { message: 'পরীক্ষা পাওয়া যায়নি' });

  let section = exam.sections.find((s) => s.name === sectionName);
  if (!section) {
    section = { name: sectionName, questions: [] };
    exam.sections.push(section);
  }

  const added = [];
  for (const q of questions) {
    if (!q.text || !Array.isArray(q.options) || q.options.length !== 4) continue;
    if (typeof q.correctIndex !== 'number' || q.correctIndex < 0 || q.correctIndex > 3) continue;
    const newQ = { id: newId('q'), text: q.text, options: q.options, correctIndex: q.correctIndex };
    section.questions.push(newQ);
    added.push(newQ);
  }

  writeData(data);
  sendJSON(res, 200, { addedCount: added.length });
}

// ---------- স্ট্যাটিক ফাইল সার্ভ করা ----------
function serveStatic(req, res, urlPath) {
  let filePath = urlPath === '/' ? '/index.html' : urlPath;
  filePath = path.join(PUBLIC_DIR, filePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('পাওয়া যায়নি');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

// ---------- রাউটার ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  try {
    if (p === '/api/exams' && req.method === 'GET') return listExams(req, res);
    if (p === '/api/exams' && req.method === 'POST') return await createExam(req, res);

    let m = p.match(/^\/api\/exams\/([^/]+)$/);
    if (m && req.method === 'GET') return getExam(req, res, m[1]);

    m = p.match(/^\/api\/exams\/([^/]+)\/submit$/);
    if (m && req.method === 'POST') return await submitExam(req, res, m[1]);

    m = p.match(/^\/api\/exams\/([^/]+)\/merit$/);
    if (m && req.method === 'GET') return getMerit(req, res, m[1]);

    m = p.match(/^\/api\/exams\/([^/]+)\/questions\/bulk$/);
    if (m && req.method === 'POST') return await bulkAddQuestions(req, res, m[1]);

    if (p.startsWith('/api/')) return sendJSON(res, 404, { message: 'রুট পাওয়া যায়নি' });

    return serveStatic(req, res, p);
  } catch (err) {
    console.error(err);
    sendJSON(res, 500, { message: 'সার্ভারে সমস্যা হয়েছে' });
  }
});

server.listen(PORT, () => {
  console.log(`Exam Hub চালু হয়েছে → http://localhost:${PORT}`);
}); 
