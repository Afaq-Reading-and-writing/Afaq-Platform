// ============================================
// لوحة المشرف - إدارة البرامج (الدروس + الطلاب)
// ============================================

let adminProfile = null;
let programsCache = [];
let allStudents = [];
let activeProgram = null;
let selectedStudentIds = new Set();
let originalStudentIds = new Set();

function esc(t) {
  return String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function showListMsg(text, type = "success") {
  document.getElementById("listMsg").innerHTML = `<div class="msg msg-${type}">${esc(text)}</div>`;
}

async function loadPrograms() {
  const listEl = document.getElementById("programsList");
  listEl.innerHTML = `<div class="empty-state">جارٍ التحميل...</div>`;

  const [progRes, lessonsRes, studentsRes] = await Promise.all([
    supabaseClient.from("programs").select("id, name, sort_order").order("sort_order", { ascending: true }),
    supabaseClient.from("lessons").select("id, program_id").not("program_id", "is", null),
    supabaseClient.from("program_students").select("program_id, student_id"),
  ]);

  if (progRes.error) {
    listEl.innerHTML = `<div class="empty-state">تعذّر تحميل البرامج: ${esc(progRes.error.message)}</div>`;
    return;
  }

  programsCache = progRes.data || [];
  if (!programsCache.length) {
    listEl.innerHTML = `<div class="empty-state">لا توجد برامج. شغّل ملف migration-programs.sql أولاً.</div>`;
    return;
  }

  const lessonCount = {};
  (lessonsRes.data || []).forEach(l => { lessonCount[l.program_id] = (lessonCount[l.program_id] || 0) + 1; });
  const studentCount = {};
  (studentsRes.data || []).forEach(s => { studentCount[s.program_id] = (studentCount[s.program_id] || 0) + 1; });

  listEl.innerHTML = programsCache.map(p => `
    <div class="register-row" style="grid-template-columns: 1.3fr 0.5fr 0.5fr 1.6fr;">
      <div class="name">${esc(p.name)}</div>
      <div class="meta">${lessonCount[p.id] || 0}</div>
      <div class="meta">${studentCount[p.id] || 0}</div>
      <div class="row-actions">
        <button class="btn-ghost" onclick="location.href='admin-lessons.html?program=${p.id}'">الدروس</button>
        <button class="btn-ghost" onclick="openStudentsModal('${p.id}')">الطلاب</button>
        <button class="btn-ghost" onclick="renameProgram('${p.id}')">تسمية</button>
      </div>
    </div>
  `).join("");
}

async function renameProgram(programId) {
  const p = programsCache.find(x => x.id === programId);
  if (!p) return;
  const name = prompt("اسم البرنامج:", p.name);
  if (name === null) return;
  const clean = name.trim();
  if (!clean) return;

  const { error } = await supabaseClient.from("programs").update({ name: clean }).eq("id", programId);
  if (error) {
    showListMsg(`تعذّر تغيير الاسم: ${error.message}`, "error");
    return;
  }
  showListMsg("تم تغيير اسم البرنامج.");
  loadPrograms();
}

// ============ اختيار طلاب البرنامج ============
async function openStudentsModal(programId) {
  activeProgram = programsCache.find(p => p.id === programId);
  if (!activeProgram) return;

  document.getElementById("studentsModalTitle").textContent = `طلاب: ${activeProgram.name}`;
  document.getElementById("studentsMsg").innerHTML = "";
  document.getElementById("studentsSearch").value = "";
  document.getElementById("studentsChecklist").innerHTML = `<div class="empty-state">جارٍ التحميل...</div>`;
  document.getElementById("studentsModalOverlay").hidden = false;

  const [{ data: students, error: e1 }, { data: enrolled, error: e2 }] = await Promise.all([
    supabaseClient.from("users").select("id, full_name, email, is_active").eq("role", "student").order("full_name", { ascending: true }),
    supabaseClient.from("program_students").select("student_id").eq("program_id", programId),
  ]);

  if (e1 || e2) {
    document.getElementById("studentsChecklist").innerHTML = `<div class="empty-state">تعذّر التحميل: ${esc((e1 || e2).message)}</div>`;
    return;
  }

  allStudents = students || [];
  originalStudentIds = new Set((enrolled || []).map(r => r.student_id));
  selectedStudentIds = new Set(originalStudentIds);
  renderChecklist();
}

function renderChecklist() {
  const q = document.getElementById("studentsSearch").value.trim().toLowerCase();
  const list = q
    ? allStudents.filter(s => (s.full_name || "").toLowerCase().includes(q) || (s.email || "").toLowerCase().includes(q))
    : allStudents;

  const el = document.getElementById("studentsChecklist");
  if (!list.length) {
    el.innerHTML = `<div class="empty-state">${q ? "لا نتائج مطابقة." : "لا يوجد طلاب."}</div>`;
  } else {
    el.innerHTML = list.map(s => `
      <label style="display:flex; align-items:center; gap:10px; padding:8px 0; cursor:pointer;">
        <input type="checkbox" data-id="${s.id}" ${selectedStudentIds.has(s.id) ? "checked" : ""} style="width:auto; min-height:auto;">
        <span style="font-weight:600;">${esc(s.full_name)}</span>
        <span class="meta" style="margin-inline-start:auto;">${esc(s.email)}</span>
      </label>
    `).join("");
  }
  document.getElementById("studentsSelectedCount").textContent = `المحدَّدون: ${selectedStudentIds.size}`;
}

document.getElementById("studentsChecklist").addEventListener("change", (e) => {
  const id = e.target?.dataset?.id;
  if (!id) return;
  if (e.target.checked) selectedStudentIds.add(id); else selectedStudentIds.delete(id);
  document.getElementById("studentsSelectedCount").textContent = `المحدَّدون: ${selectedStudentIds.size}`;
});

document.getElementById("studentsSearch").addEventListener("input", renderChecklist);

function closeStudentsModal() {
  document.getElementById("studentsModalOverlay").hidden = true;
}

document.getElementById("studentsSaveBtn").addEventListener("click", async () => {
  if (!activeProgram) return;
  const btn = document.getElementById("studentsSaveBtn");
  btn.disabled = true;
  btn.textContent = "جارٍ الحفظ...";

  const toAdd = [...selectedStudentIds].filter(id => !originalStudentIds.has(id));
  const toRemove = [...originalStudentIds].filter(id => !selectedStudentIds.has(id));

  try {
    if (toAdd.length) {
      const { error } = await supabaseClient.from("program_students")
        .insert(toAdd.map(student_id => ({ program_id: activeProgram.id, student_id })));
      if (error) throw new Error(error.message);
    }
    if (toRemove.length) {
      const { error } = await supabaseClient.from("program_students")
        .delete().eq("program_id", activeProgram.id).in("student_id", toRemove);
      if (error) throw new Error(error.message);
    }
    closeStudentsModal();
    showListMsg("تم حفظ طلاب البرنامج.");
    loadPrograms();
  } catch (err) {
    document.getElementById("studentsMsg").innerHTML = `<div class="msg msg-error">${esc(err.message)}</div>`;
  }

  btn.disabled = false;
  btn.textContent = "حفظ";
});

// ============ تشغيل الصفحة ============
(async () => {
  adminProfile = await requireRole("admin");
  if (!adminProfile) return;
  document.getElementById("whoAmI").textContent = `مرحباً، ${adminProfile.full_name}`;
  loadPrograms();
})();
