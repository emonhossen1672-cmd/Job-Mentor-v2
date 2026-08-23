const LABELS = ["ক", "খ", "গ", "ঘ"];

let currentExam = null;      // exam সহ প্রশ্ন (options সহ, correctIndex ছাড়া)
let flatQuestions = [];
let currentIndex = 0;
let answers = {};            // { questionId: selectedIndex }
let marked = {};             // { questionId: true }
let secondsLeft = 0;
let timerHandle = null;
let studentName = "";
let lastExamId = null;

function show(viewId) {
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  document.getElementById(viewId).classList.remove("hidden");
}

// ---------------- HOME ----------------
let allExams = [];
let activeCategory = "সব";
let activeGrade = "সব";

async function loadExamList() {
  const res = await fetch("/api/exams");
  allExams = await res.json();
  activeCategory = "সব";
  activeGrade = "সব";
  renderCategoryChips();
  renderGradeChips();
  renderExamList();
}

function renderCategoryChips() {
  const chipWrap = document.getElementById("category-chips");
  const categories = ["সব", ...new Set(allExams.map((e) => e.category || "সাধারণ"))];
  chipWrap.innerHTML = categories
    .map((c) => `<button class="chip ${c === activeCategory ? "active" : ""}" data-cat="${c}">${c}</button>`)
    .join("");
  chipWrap.querySelectorAll(".chip").forEach((btn) => {
    btn.onclick = () => {
      activeCategory = btn.dataset.cat;
      renderCategoryChips();
      renderGradeChips();
      renderExamList();
    };
  });
}

function renderGradeChips() {
  const chipWrap = document.getElementById("grade-chips");
  const scoped = activeCategory === "সব" ? allExams : allExams.filter((e) => (e.category || "সাধারণ") === activeCategory);
  const grades = ["সব", ...new Set(scoped.map((e) => e.grade).filter(Boolean))];
  if (grades.length <= 1) { chipWrap.innerHTML = ""; return; }
  chipWrap.innerHTML = grades
    .map((g) => `<button class="chip chip-grade ${g === activeGrade ? "active" : ""}" data-grade="${g}">${g}</button>`)
    .join("");
  chipWrap.querySelectorAll(".chip").forEach((btn) => {
    btn.onclick = () => {
      activeGrade = btn.dataset.grade;
      renderGradeChips();
      renderExamList();
    };
  });
}

function renderExamList() {
  const wrap = document.getElementById("exam-list");
  wrap.innerHTML = "";
  let filtered = activeCategory === "সব" ? allExams : allExams.filter((e) => (e.category || "সাধারণ") === activeCategory);
  if (activeGrade !== "সব") filtered = filtered.filter((e) => e.grade === activeGrade);

  if (filtered.length === 0) {
    wrap.innerHTML = `<p class="empty-note" style="grid-column:1/-1;">এই ফিল্টারে এখনও কোনো পরীক্ষা নেই।</p>`;
    return;
  }

  filtered.forEach((e) => {
    const btn = document.createElement("button");
    btn.className = "tile b1";
    btn.innerHTML = `
      <div class="badge">📝</div>
      <div class="cat-tag">${e.category || "সাধারণ"}${e.grade ? " · " + e.grade : ""}</div>
      <div class="t-title">${e.title}</div>
      <div class="t-sub">${e.totalQuestions}টি প্রশ্ন · ${e.durationMinutes} মিনিট</div>
    `;
    btn.onclick = () => promptName(e.id);
    wrap.appendChild(btn);
  });
}

function promptName(examId) {
  lastExamId = examId;
  document.getElementById("name-input").value = studentName;
  show("view-name");
}

document.getElementById("btn-cancel-name").onclick = () => show("view-home");
document.getElementById("btn-refresh").onclick = loadExamList;
document.getElementById("btn-merit").onclick = () => {
  if (!lastExamId) { alert("আগে একটা পরীক্ষা দিন, তারপর মেরিট লিস্ট দেখা যাবে।"); return; }
  loadMerit(lastExamId);
};

// ---------------- START EXAM ----------------
document.getElementById("btn-start-exam").onclick = async () => {
  const name = document.getElementById("name-input").value.trim();
  if (!name) { alert("নাম লিখুন"); return; }
  studentName = name;

  const res = await fetch(`/api/exams/${lastExamId}`);
  currentExam = await res.json();
  flatQuestions = currentExam.sections.flatMap((s) =>
    s.questions.map((q) => ({ ...q, section: s.name }))
  );
  currentIndex = 0;
  answers = {};
  marked = {};
  secondsLeft = currentExam.durationMinutes * 60;

  document.getElementById("exam-title").textContent = currentExam.title;
  renderQuestion();
  renderPanel();
  startTimer();
  show("view-exam");
};

function startTimer() {
  clearInterval(timerHandle);
  updateTimerDisplay();
  timerHandle = setInterval(() => {
    secondsLeft--;
    updateTimerDisplay();
    if (secondsLeft <= 0) {
      clearInterval(timerHandle);
      submitExam();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const m = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const s = String(secondsLeft % 60).padStart(2, "0");
  const el = document.getElementById("timer");
  el.textContent = `${m}:${s}`;
  el.classList.toggle("critical", secondsLeft <= 60);
}

// ---------------- QUESTION VIEW ----------------
function renderQuestion() {
  const q = flatQuestions[currentIndex];
  document.getElementById("q-section").textContent = q.section;
  document.getElementById("q-text").textContent = q.text;
  document.getElementById("progress-text").textContent = `প্রশ্ন ${currentIndex + 1}/${flatQuestions.length}`;
  document.getElementById("answered-text").textContent = `উত্তর দেওয়া হয়েছে ${Object.keys(answers).length}/${flatQuestions.length}`;
  document.getElementById("progress-fill").style.width = `${(Object.keys(answers).length / flatQuestions.length) * 100}%`;

  const optWrap = document.getElementById("q-options");
  optWrap.innerHTML = "";
  q.options.forEach((opt, idx) => {
    const b = document.createElement("button");
    b.className = "opt-btn" + (answers[q.id] === idx ? " selected" : "");
    b.innerHTML = `<span class="opt-label">${LABELS[idx]}</span><span class="opt-text">${opt}</span>`;
    b.onclick = () => { answers[q.id] = idx; renderQuestion(); renderPanel(); };
    optWrap.appendChild(b);
  });

  const markBtn = document.getElementById("btn-mark");
  markBtn.classList.toggle("active", !!marked[q.id]);
  markBtn.textContent = marked[q.id] ? "🚩 রিভিউর জন্য চিহ্নিত" : "🚩 পরে রিভিউ করার জন্য চিহ্নিত করুন";

  document.getElementById("btn-prev").disabled = currentIndex === 0;
  const isLast = currentIndex === flatQuestions.length - 1;
  document.getElementById("btn-next").classList.toggle("hidden", isLast);
  document.getElementById("btn-submit").classList.toggle("hidden", !isLast);
}

function renderPanel() {
  const panel = document.getElementById("q-panel");
  panel.innerHTML = "";
  flatQuestions.forEach((q, idx) => {
    const b = document.createElement("button");
    let cls = "q-btn";
    if (marked[q.id]) cls += " marked";
    else if (answers[q.id] !== undefined) cls += " answered";
    if (idx === currentIndex) cls += " current";
    b.className = cls;
    b.textContent = idx + 1;
    b.onclick = () => { currentIndex = idx; renderQuestion(); renderPanel(); };
    panel.appendChild(b);
  });
}

document.getElementById("btn-mark").onclick = () => {
  const q = flatQuestions[currentIndex];
  marked[q.id] = !marked[q.id];
  renderQuestion(); renderPanel();
};
document.getElementById("btn-prev").onclick = () => { currentIndex = Math.max(0, currentIndex - 1); renderQuestion(); renderPanel(); };
document.getElementById("btn-next").onclick = () => { currentIndex = Math.min(flatQuestions.length - 1, currentIndex + 1); renderQuestion(); renderPanel(); };
document.getElementById("btn-submit").onclick = () => {
  const remaining = flatQuestions.length - Object.keys(answers).length;
  if (remaining > 0 && !confirm(`এখনও ${remaining}টি প্রশ্ন বাকি আছে। তবুও জমা দিতে চান?`)) return;
  submitExam();
};

async function submitExam() {
  clearInterval(timerHandle);
  const res = await fetch(`/api/exams/${currentExam.id}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: studentName, answers }),
  });
  const data = await res.json();
  renderResult(data);
  show("view-result");
}

// ---------------- RESULT (ভুল মার্কিং) ----------------
function renderResult(data) {
  const { submission, questions } = data;
  document.getElementById("result-summary").innerHTML = `
    <div><div class="num">${submission.score}</div><div class="lbl">স্কোর</div></div>
    <div><div class="num">${submission.correct}</div><div class="lbl">সঠিক</div></div>
    <div><div class="num">${submission.wrong}</div><div class="lbl">ভুল</div></div>
    <div><div class="num">${submission.unanswered}</div><div class="lbl">বাদ</div></div>
  `;

  const list = document.getElementById("result-list");
  list.innerHTML = "";
  questions.forEach((q, i) => {
    const state = q.selectedIndex === null ? "skipped" : q.isCorrect ? "correct" : "wrong";
    const tagText = state === "correct" ? "সঠিক" : state === "wrong" ? "ভুল" : "উত্তর দেওয়া হয়নি";
    const div = document.createElement("div");
    div.className = `result-item ${state}`;
    div.innerHTML = `
      <span class="tag">${i + 1}. ${tagText}</span>
      <p class="q">${q.text}</p>
      <p class="ans-line">সঠিক উত্তর: <b>${LABELS[q.correctIndex]}. ${q.options[q.correctIndex]}</b></p>
      ${q.selectedIndex !== null && !q.isCorrect ? `<p class="ans-line">আপনার উত্তর: <b>${LABELS[q.selectedIndex]}. ${q.options[q.selectedIndex]}</b></p>` : ""}
    `;
    list.appendChild(div);
  });
}

document.getElementById("btn-home-from-result").onclick = () => {
  if (activeCourseId) { refreshCourseProgress(); }
  else { loadExamList(); loadCourses(); show("view-home"); }
};
document.getElementById("btn-merit-from-result").onclick = () => loadMerit(currentExam.id);

// ---------------- MERIT LIST ----------------
async function loadMerit(examId) {
  const res = await fetch(`/api/exams/${examId}/merit`);
  const rows = await res.json();
  const wrap = document.getElementById("merit-rows");
  if (rows.length === 0) {
    wrap.innerHTML = `<p class="empty-note">এখনও কেউ এই পরীক্ষা জমা দেয়নি।</p>`;
  } else {
    wrap.innerHTML = rows.map((r) => `
      <div class="rank-row">
        <div class="rank-num ${r.rank === 1 ? "g1" : r.rank === 2 ? "g2" : r.rank === 3 ? "g3" : ""}">${r.rank}</div>
        <div class="rank-name">${r.name}</div>
        <div class="rank-score">${r.score}</div>
      </div>
    `).join("");
  }
  show("view-merit");
}
document.getElementById("btn-home-from-merit").onclick = () => { loadExamList(); show("view-home"); };

// ---------------- INIT ----------------
loadExamList();

// ================= ADMIN =================
let adminExamId = null;
let adminSectionNames = ["বাংলা", "ইংরেজি", "গণিত", "সাধারণ জ্ঞান"];
let adminReturnScreen = "view-home";

document.getElementById("btn-open-admin").onclick = () => {
  document.getElementById("admin-title").value = "";
  document.getElementById("admin-category").value = "";
  document.getElementById("admin-grade").value = "";
  document.getElementById("admin-duration").value = "30";
  document.getElementById("admin-negative").value = "0.25";
  adminReturnScreen = "view-home";
  setExamType("live");
  show("view-admin-create");
};
document.getElementById("btn-cancel-admin").onclick = () => { loadExamList(); loadCourses(); show("view-home"); };

let selectedType = "live";
function setExamType(t) {
  selectedType = t;
  document.getElementById("type-live").classList.toggle("active", t === "live");
  document.getElementById("type-model").classList.toggle("active", t === "model");
}
document.getElementById("type-live").onclick = () => setExamType("live");
document.getElementById("type-model").onclick = () => setExamType("model");

document.getElementById("btn-create-exam").onclick = async () => {
  const title = document.getElementById("admin-title").value.trim();
  if (!title) { alert("পরীক্ষার নাম দিন"); return; }
  const res = await fetch("/api/exams", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title,
      category: document.getElementById("admin-category").value,
      grade: document.getElementById("admin-grade").value,
      type: selectedType,
      durationMinutes: document.getElementById("admin-duration").value,
      negativeMark: document.getElementById("admin-negative").value,
    }),
  });
  const data = await res.json();
  adminExamId = data.id;
  adminReturnScreen = "view-home";
  adminSectionNames = ["বাংলা", "ইংরেজি", "গণিত", "সাধারণ জ্ঞান"];

  const sel = document.getElementById("admin-section");
  sel.innerHTML = adminSectionNames.map((n) => `<option value="${n}">${n}</option>`).join("");
  document.getElementById("admin-bulk-text").value = "";
  document.getElementById("admin-bulk-result").classList.add("hidden");
  show("view-admin-questions");
};

document.getElementById("btn-finish-admin").onclick = () => {
  adminExamId = null;
  if (adminReturnScreen === "view-course-admin-parts") {
    renderCoursePartsExisting();
    show("view-course-admin-parts");
  } else {
    loadExamList();
    loadCourses();
    show("view-home");
  }
};

// একগুচ্ছ প্রশ্ন টেক্সট থেকে পার্স করা
function parseBulkQuestions(rawText) {
  const blocks = rawText.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const results = [];
  const errorBlocks = [];
  const optionPrefix = /^[কখগঘabcdABCD][.)\-–]\s*/;
  const answerLineRe = /^(উত্তর|answer|সঠিক উত্তর|সঠিক)[:：\-\s]/i;
  const ansCharMap = { ক: 0, খ: 1, গ: 2, ঘ: 3, a: 0, b: 1, c: 2, d: 3, A: 0, B: 1, C: 2, D: 3 };

  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 5) { errorBlocks.push(block); continue; }

    const answerLineIdx = lines.findIndex((l) => answerLineRe.test(l));
    if (answerLineIdx === -1) { errorBlocks.push(block); continue; }

    const answerLine = lines[answerLineIdx];
    const afterColon = answerLine.split(/[:：\-]/).slice(1).join(":").trim();
    const ansCharMatch = afterColon.match(/[কখগঘabcdABCD]/);
    if (!ansCharMatch) { errorBlocks.push(block); continue; }
    const correctIndex = ansCharMap[ansCharMatch[0]];
    if (correctIndex === undefined) { errorBlocks.push(block); continue; }

    const nonAnswerLines = lines.filter((_, i) => i !== answerLineIdx);
    const text = nonAnswerLines[0].replace(/^\d+[).\s]*/, "").trim();
    const optionLines = nonAnswerLines.slice(1, 5);
    if (optionLines.length !== 4) { errorBlocks.push(block); continue; }
    const options = optionLines.map((l) => l.replace(optionPrefix, "").trim());
    if (options.some((o) => !o)) { errorBlocks.push(block); continue; }

    results.push({ text, options, correctIndex });
  }
  return { results, errorBlocks };
}

document.getElementById("btn-bulk-add").onclick = async () => {
  const raw = document.getElementById("admin-bulk-text").value;
  const { results, errorBlocks } = parseBulkQuestions(raw);
  const resultBox = document.getElementById("admin-bulk-result");

  if (results.length > 0) {
    const sectionName = document.getElementById("admin-section").value;
    const res = await fetch(`/api/exams/${adminExamId}/questions/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sectionName, questions: results }),
    });
    await res.json();
    document.getElementById("admin-bulk-text").value = errorBlocks.length > 0 ? errorBlocks.join("\n\n") : "";
  }

  resultBox.classList.remove("hidden");
  resultBox.className = "bulk-result " + (errorBlocks.length > 0 ? "warn" : "ok");
  resultBox.textContent = `✓ ${results.length}টি প্রশ্ন যোগ হয়েছে` + (errorBlocks.length > 0 ? ` · ⚠️ ${errorBlocks.length}টি ফরম্যাট মেলেনি (নিচের বক্সে রাখা আছে)` : "");
};

// ================= সিরিজ পরীক্ষা (COURSES) =================

async function loadCourses() {
  const res = await fetch("/api/courses");
  const courses = await res.json();
  const wrap = document.getElementById("course-list");
  const label = document.getElementById("course-section-label");
  if (courses.length === 0) {
    wrap.innerHTML = "";
    label.classList.add("hidden");
    return;
  }
  label.classList.remove("hidden");
  wrap.innerHTML = "";
  courses.forEach((c) => {
    const btn = document.createElement("button");
    btn.className = "tile b2";
    btn.innerHTML = `
      <div class="badge">📚</div>
      <div class="cat-tag">সিরিজ · ${c.category}${c.grade ? " · " + c.grade : ""}</div>
      <div class="t-title">${c.title}</div>
      <div class="t-sub">${c.partsCount}টি পরীক্ষা</div>
    `;
    btn.onclick = () => openCourse(c.id);
    wrap.appendChild(btn);
  });
}

// ---- Admin: create course ----
let activeCourseAdminId = null;
let coursePartsSoFar = [];

document.getElementById("btn-open-course-admin").onclick = () => {
  document.getElementById("course-admin-title").value = "";
  document.getElementById("course-admin-category").value = "";
  document.getElementById("course-admin-grade").value = "";
  show("view-course-admin-create");
};
document.getElementById("btn-cancel-course-admin").onclick = () => { loadExamList(); loadCourses(); show("view-home"); };

document.getElementById("btn-course-admin-create").onclick = async () => {
  const title = document.getElementById("course-admin-title").value.trim();
  if (!title) { alert("কোর্সের নাম দিন"); return; }
  const res = await fetch("/api/courses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title,
      category: document.getElementById("course-admin-category").value,
      grade: document.getElementById("course-admin-grade").value,
    }),
  });
  const data = await res.json();
  activeCourseAdminId = data.id;
  coursePartsSoFar = [];
  document.getElementById("course-admin-parts-title").textContent = title;
  renderCoursePartsExisting();
  document.getElementById("part-title").value = "পরীক্ষা-০১";
  document.getElementById("part-duration").value = "20";
  document.getElementById("part-syllabus").value = "";
  show("view-course-admin-parts");
};

function renderCoursePartsExisting() {
  const wrap = document.getElementById("course-admin-parts-existing");
  if (coursePartsSoFar.length === 0) {
    wrap.innerHTML = `<p class="empty-note">এখনও কোনো পরীক্ষা যোগ হয়নি।</p>`;
    return;
  }
  wrap.innerHTML =
    `<p class="field-label" style="margin-top:0;">যোগ হয়েছে (${coursePartsSoFar.length}টি)</p>` +
    coursePartsSoFar.map((t) => `<span class="chip" style="margin:0 6px 6px 0;">${t}</span>`).join("");
}

document.getElementById("btn-create-part").onclick = async () => {
  const title = document.getElementById("part-title").value.trim();
  if (!title) { alert("পরীক্ষার নাম দিন"); return; }
  const res = await fetch(`/api/courses/${activeCourseAdminId}/parts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title,
      durationMinutes: document.getElementById("part-duration").value,
      syllabus: document.getElementById("part-syllabus").value,
    }),
  });
  const data = await res.json();
  adminExamId = data.id;
  adminReturnScreen = "view-course-admin-parts";
  coursePartsSoFar.push(title);

  adminSectionNames = ["প্রশ্ন"];
  const sel = document.getElementById("admin-section");
  sel.innerHTML = adminSectionNames.map((n) => `<option value="${n}">${n}</option>`).join("");
  document.getElementById("admin-bulk-text").value = "";
  document.getElementById("admin-bulk-result").classList.add("hidden");
  show("view-admin-questions");

  // পরের পরীক্ষার নাম অনুমান করে বসিয়ে দেওয়া
  const nextNum = coursePartsSoFar.length + 1;
  document.getElementById("part-title").value = "পরীক্ষা-" + String(nextNum).padStart(2, "0");
  document.getElementById("part-syllabus").value = "";
};

document.getElementById("btn-finish-course").onclick = () => {
  activeCourseAdminId = null;
  loadExamList();
  loadCourses();
  show("view-home");
};

// ---- Learner: view course, take parts in order ----
let activeCourseId = null;
let courseMeta = null;

function openCourse(courseId) {
  activeCourseId = courseId;
  document.getElementById("course-name-input").value = studentName;
  document.getElementById("course-name-block").classList.remove("hidden");
  document.getElementById("course-parts-list").classList.add("hidden");
  show("view-course-detail");
}

document.getElementById("btn-course-name-continue").onclick = async () => {
  const name = document.getElementById("course-name-input").value.trim();
  if (!name) { alert("নাম লিখুন"); return; }
  studentName = name;
  await refreshCourseProgress();
};

async function refreshCourseProgress() {
  const res = await fetch(`/api/courses/${activeCourseId}`);
  courseMeta = await res.json();
  document.getElementById("course-detail-title").textContent = courseMeta.title;

  const progRes = await fetch(`/api/courses/${activeCourseId}/progress?name=${encodeURIComponent(studentName)}`);
  const prog = await progRes.json();
  renderCourseParts(courseMeta.parts, prog.completedPartIds);

  document.getElementById("course-name-block").classList.add("hidden");
  document.getElementById("course-parts-list").classList.remove("hidden");
  show("view-course-detail");
}

function renderCourseParts(parts, completedIds) {
  const wrap = document.getElementById("course-parts-list");
  if (parts.length === 0) {
    wrap.innerHTML = `<p class="empty-note">এই কোর্সে এখনও কোনো পরীক্ষা যোগ হয়নি।</p>`;
    return;
  }
  wrap.innerHTML = parts
    .map((p, idx) => {
      const done = completedIds.includes(p.id);
      const unlocked = idx === 0 || completedIds.includes(parts[idx - 1].id);
      let statusHtml;
      if (done) {
        statusHtml = `<span class="chip" style="background:#DFF6E7;color:var(--green);border-color:#DFF6E7;">✓ সম্পন্ন</span>`;
      } else if (unlocked) {
        statusHtml = `<button class="btn-primary" style="width:auto;padding:8px 16px;margin:0;" data-part="${p.id}">শুরু করুন</button>`;
      } else {
        statusHtml = `<span class="chip">🔒 লক</span>`;
      }
      return `
        <div class="card" style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
            <div>
              <div style="font-weight:600;font-size:14px;color:var(--ink);">${p.title}</div>
              <div style="font-size:11px;color:var(--ink-soft);margin-top:2px;">${p.durationMinutes} মিনিট · ${p.totalQuestions}টি প্রশ্ন</div>
              ${p.syllabus ? `<div style="font-size:11px;color:var(--ink-soft);margin-top:4px;">সিলেবাস: ${p.syllabus}</div>` : ""}
            </div>
            <div>${statusHtml}</div>
          </div>
        </div>
      `;
    })
    .join("");

  wrap.querySelectorAll("[data-part]").forEach((btn) => {
    btn.onclick = () => startCoursePart(btn.dataset.part);
  });
}

async function startCoursePart(examId) {
  lastExamId = examId;
  const res = await fetch(`/api/exams/${examId}`);
  currentExam = await res.json();
  flatQuestions = currentExam.sections.flatMap((s) => s.questions.map((q) => ({ ...q, section: s.name })));
  currentIndex = 0;
  answers = {};
  marked = {};
  secondsLeft = currentExam.durationMinutes * 60;
  document.getElementById("exam-title").textContent = currentExam.title;
  renderQuestion();
  renderPanel();
  startTimer();
  show("view-exam");
}

document.getElementById("btn-home-from-course").onclick = () => { activeCourseId = null; loadExamList(); loadCourses(); show("view-home"); };

// ---- INIT (courses) ----
loadCourses();
