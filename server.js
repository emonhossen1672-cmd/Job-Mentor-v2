// server.js
// এই সার্ভারটা চালাতে কোনো npm install লাগবে না — শুধু Node.js থাকলেই চলবে।
// রান করতে: node server.js   (তারপর ব্রাউজারে http://localhost:3000 খুলুন)

const http = require('http');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;

// ---------- স্থায়ী ডাটাবেজ (Upstash Redis) ----------
// Render-এর ফ্রি প্ল্যানে ফাইল স্টোরেজ স্থায়ী নয় — সার্ভার ঘুমিয়ে গিয়ে আবার জাগলে
// data.json-এর যেকোনো পরিবর্তন হারিয়ে যায়। তাই আসল ডেটা একটা ফ্রি, স্থায়ী Redis
// ডাটাবেজে (Upstash) রাখা হচ্ছে। এই দুটো এনভায়রনমেন্ট ভ্যারিয়েবল Render-এ সেট করতে হবে:
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN
// সেট করা না থাকলে (যেমন লোকাল টেস্টের সময়), সার্ভার data.json ফাইল ব্যবহার করবে।

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const REDIS_KEY = 'examhub-data';
const USE_REDIS = !!(UPSTASH_URL && UPSTASH_TOKEN);

const SEED_DATA = {
  exams: [
    {
      id: 'bcs-42-prelim',
      title: '৪২তম বিসিএস প্রিলিমিনারি (ডেমো)',
      category: 'বিসিএস',
      grade: '',
      durationMinutes: 10,
      negativeMark: 0.25,
      sections: [
        { name: 'বাংলা', questions: [
          { id: 'b1', text: "'সুন্দর' শব্দের বিপরীত শব্দ কোনটি?", options: ['কুৎসিত', 'সুশ্রী', 'মনোরম', 'চারু'], correctIndex: 0 },
          { id: 'b2', text: "'যা বলা হয়নি' — এক কথায় প্রকাশ করুন।", options: ['অনুক্ত', 'অব্যক্ত', 'অকথিত', 'অনুচ্চারিত'], correctIndex: 0 },
        ]},
        { name: 'ইংরেজি', questions: [
          { id: 'e1', text: "Choose the correct synonym of 'Ubiquitous'.", options: ['Rare', 'Omnipresent', 'Hidden', 'Ancient'], correctIndex: 1 },
          { id: 'e2', text: 'Fill in the blank: He is senior __ me.', options: ['than', 'to', 'from', 'with'], correctIndex: 1 },
        ]},
        { name: 'গণিত', questions: [
          { id: 'm1', text: 'একটি সংখ্যার ৩০% = ৯০ হলে সংখ্যাটি কত?', options: ['২৭০', '৩০০', '৩৩০', '৩৬০'], correctIndex: 1 },
          { id: 'm2', text: 'x + 5 = 12 হলে x এর মান কত?', options: ['5', '6', '7', '8'], correctIndex: 2 },
        ]},
        { name: 'সাধারণ জ্ঞান', questions: [
          { id: 'g1', text: 'বাংলাদেশের স্বাধীনতা যুদ্ধ শুরু হয় কোন সালে?', options: ['১৯৭০', '১৯৭১', '১৯৭২', '১৯৬৯'], correctIndex: 1 },
          { id: 'g2', text: 'বাংলাদেশের সংবিধান কার্যকর হয় কবে?', options: ['১৬ ডিসেম্বর ১৯৭২', '৪ নভেম্বর ১৯৭২', '২৬ মার্চ ১৯৭১', '১৭ এপ্রিল ১৯৭১'], correctIndex: 1 },
        ]},
      ],
    },
  ],
  submissions: [],
  courses: [],
};

async function upstashCommand(commandArray) {
  const res = await fetch(UPSTASH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commandArray),
  });
  const json = await res.json();
  if (json.error) {
    console.error('Upstash error:', json.error);
    throw new Error('Upstash error: ' + json.error);
  }
  return json;
}

async function readData() {
  if (USE_REDIS) {
    const json = await upstashCommand(['GET', REDIS_KEY]);
    if (json.result) {
      const data = JSON.parse(json.result);
      if (!data.courses) data.courses = [];
      return data;
    }
    // প্রথমবার — এখনও কিছু সেভ হয়নি, ডেমো ডেটা দিয়ে শুরু করা হচ্ছে
    await writeData(SEED_DATA);
    return JSON.parse(JSON.stringify(SEED_DATA));
  }
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  if (!data.courses) data.courses = [];
  return data;
}

async function writeData(data) {
  if (USE_REDIS) {
    await upstashCommand(['SET', REDIS_KEY, JSON.stringify(data)]);
    return;
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

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

async function listExams(req, res) {
  const data = await readData();
  const exams = data.exams
    .filter((e) => !e.courseId)
    .map((e) => ({
      id: e.id,
      title: e.title,
      category: e.category || 'সাধারণ',
      grade: e.grade || '',
      durationMinutes: e.durationMinutes,
      totalQuestions: e.sections.reduce((n, s) => n + s.questions.length, 0),
    }));
  sendJSON(res, 200, exams);
}

async function getExam(req, res, examId) {
  const data = await readData();
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
  const data = await readData();
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
  await writeData(data);

  sendJSON(res, 200, { submission, questions: reviewedQuestions });
}

async function getMerit(req, res, examId) {
  const data = await readData();
  const list = data.submissions
    .filter((s) => s.examId === examId)
    .sort((a, b) => b.score - a.score)
    .map((s, i) => ({ rank: i + 1, name: s.name, score: s.score, submittedAt: s.submittedAt }));
  sendJSON(res, 200, list);
}

// ---------- সিরিজ পরীক্ষা (কোর্স) ----------

async function listCourses(req, res) {
  const data = await readData();
  const courses = (data.courses || []).map((c) => ({
    id: c.id,
    title: c.title,
    category: c.category || 'সাধারণ',
    grade: c.grade || '',
    partsCount: c.partIds.length,
  }));
  sendJSON(res, 200, courses);
}

async function getCourseDetail(req, res, courseId) {
  const data = await readData();
  const course = (data.courses || []).find((c) => c.id === courseId);
  if (!course) return sendJSON(res, 404, { message: 'কোর্স পাওয়া যায়নি' });

  const parts = course.partIds
    .map((pid) => {
      const ex = data.exams.find((e) => e.id === pid);
      if (!ex) return null;
      return {
        id: ex.id,
        title: ex.title,
        syllabus: ex.syllabus || '',
        durationMinutes: ex.durationMinutes,
        totalQuestions: ex.sections.reduce((n, s) => n + s.questions.length, 0),
      };
    })
    .filter(Boolean);

  sendJSON(res, 200, {
    id: course.id,
    title: course.title,
    category: course.category || 'সাধারণ',
    grade: course.grade || '',
    parts,
  });
}

async function createCourse(req, res) {
  let body;
  try { body = await readBody(req); }
  catch { return sendJSON(res, 400, { message: 'ভুল ডেটা পাঠানো হয়েছে' }); }

  const title = (body.title || '').trim();
  if (!title) return sendJSON(res, 400, { message: 'কোর্সের নাম দিতে হবে' });

  const course = {
    id: newId('course'),
    title,
    category: (body.category || '').trim() || 'সাধারণ',
    grade: (body.grade || '').trim(),
    partIds: [],
  };

  const data = await readData();
  if (!data.courses) data.courses = [];
  data.courses.unshift(course);
  await writeData(data);

  sendJSON(res, 200, { id: course.id });
}

async function addCoursePart(req, res, courseId) {
  let body;
  try { body = await readBody(req); }
  catch { return sendJSON(res, 400, { message: 'ভুল ডেটা পাঠানো হয়েছে' }); }

  const title = (body.title || '').trim();
  if (!title) return sendJSON(res, 400, { message: 'পরীক্ষার নাম দিতে হবে' });

  const data = await readData();
  const course = (data.courses || []).find((c) => c.id === courseId);
  if (!course) return sendJSON(res, 404, { message: 'কোর্স পাওয়া যায়নি' });

  const part = {
    id: newId('exam'),
    title,
    courseId,
    syllabus: (body.syllabus || '').trim(),
    type: 'live',
    durationMinutes: Number(body.durationMinutes) || 20,
    negativeMark: Number(body.negativeMark) || 0,
    sections: [{ name: 'প্রশ্ন', questions: [] }],
  };

  data.exams.unshift(part);
  course.partIds.push(part.id);
  await writeData(data);

  sendJSON(res, 200, { id: part.id });
}

async function getCourseProgress(req, res, courseId, name) {
  const data = await readData();
  const course = (data.courses || []).find((c) => c.id === courseId);
  if (!course) return sendJSON(res, 404, { message: 'কোর্স পাওয়া যায়নি' });

  const norm = (s) => (s || '').trim().toLowerCase();
  const target = norm(name);
  const completedPartIds = course.partIds.filter((pid) =>
    data.submissions.some((s) => s.examId === pid && norm(s.name) === target)
  );

  sendJSON(res, 200, { completedPartIds });
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

  const data = await readData();
  data.exams.unshift(exam);
  await writeData(data);

  sendJSON(res, 200, { id: exam.id, title: exam.title, type: exam.type });
}

// ---------- একটা সেকশনে একসাথে অনেক প্রশ্ন যোগ করা ----------
async function bulkAddQuestions(req, res, examId) {
  let body;
  try { body = await readBody(req); }
  catch { return sendJSON(res, 400, { message: 'ভুল ডেটা পাঠানো হয়েছে' }); }

  const sectionName = body.sectionName;
  const questions = Array.isArray(body.questions) ? body.questions : [];

  const data = await readData();
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

  await writeData(data);
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
    if (p === '/api/exams' && req.method === 'GET') return await listExams(req, res);
    if (p === '/api/exams' && req.method === 'POST') return await createExam(req, res);

    let m = p.match(/^\/api\/exams\/([^/]+)$/);
    if (m && req.method === 'GET') return await getExam(req, res, m[1]);

    m = p.match(/^\/api\/exams\/([^/]+)\/submit$/);
    if (m && req.method === 'POST') return await submitExam(req, res, m[1]);

    m = p.match(/^\/api\/exams\/([^/]+)\/merit$/);
    if (m && req.method === 'GET') return await getMerit(req, res, m[1]);

    m = p.match(/^\/api\/exams\/([^/]+)\/questions\/bulk$/);
    if (m && req.method === 'POST') return await bulkAddQuestions(req, res, m[1]);

    if (p === '/api/courses' && req.method === 'GET') return await listCourses(req, res);
    if (p === '/api/courses' && req.method === 'POST') return await createCourse(req, res);

    m = p.match(/^\/api\/courses\/([^/]+)$/);
    if (m && req.method === 'GET') return await getCourseDetail(req, res, m[1]);

    m = p.match(/^\/api\/courses\/([^/]+)\/parts$/);
    if (m && req.method === 'POST') return await addCoursePart(req, res, m[1]);

    m = p.match(/^\/api\/courses\/([^/]+)\/progress$/);
    if (m && req.method === 'GET') return await getCourseProgress(req, res, m[1], url.searchParams.get('name') || '');

    if (p.startsWith('/api/')) return sendJSON(res, 404, { message: 'রুট পাওয়া যায়নি' });

    return serveStatic(req, res, p);
  } catch (err) {
    console.error(err);
    sendJSON(res, 500, { message: 'সার্ভারে সমস্যা হয়েছে' });
  }
});

server.listen(PORT, () => {
  console.log(`Exam Hub চালু হয়েছে → http://localhost:${PORT}`);
  console.log(USE_REDIS ? 'স্টোরেজ: Upstash Redis (স্থায়ী)' : 'স্টোরেজ: লোকাল data.json ফাইল (অস্থায়ী)');
});
