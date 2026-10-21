// ============================================
// لوحة الطالب - عرض الدروس وحالتها
// ============================================

let studentProfile = null;

const STATUS_META = {
  not_started: { label: "لم تبدأ بعد", badgeClass: "badge", cta: "ابدأ الدرس", emoji: "📘" },
  pending: { label: "بانتظار التصحيح", badgeClass: "badge badge--accent", cta: "عرض الدرس", emoji: "⏳" },
  correct: { label: "أحسنت! ✅", badgeClass: "badge badge--mint", cta: "مشاهدة مرة أخرى", emoji: "🌟" },
  incorrect: { label: "حاول التركيز أكثر", badgeClass: "badge badge--coral", cta: "إعادة", emoji: "💪" },
};

async function loadLessons() {
  const grid = document.getElementById("lessonsGrid");
  grid.innerHTML = `<div class="empty-state">جارٍ التحميل...</div>`;

  const [{ data: lessons, error: lessonsErr }, { data: submissions, error: subErr }] = await Promise.all([
    supabaseClient.from("lessons").select("id, title, created_at").is("program_id", null).order("created_at", { ascending: true }),
    supabaseClient.from("submissions").select("lesson_id, status").eq("student_id", studentProfile.id),
  ]);

  if (lessonsErr) {
    grid.innerHTML = `<div class="empty-state">تعذّر تحميل الدروس: ${lessonsErr.message}</div>`;
    return;
  }

  const statusByLesson = {};
  (submissions || []).forEach(s => { statusByLesson[s.lesson_id] = s.status; });

  if (!lessons.length) {
    grid.innerHTML = `<div class="empty-state">لا توجد دروس متاحة بعد. تحقّق لاحقاً!</div>`;
    return;
  }

  grid.innerHTML = lessons.map(l => {
    const statusKey = statusByLesson[l.id] || "not_started";
    const meta = STATUS_META[statusKey];
    return `
      <article class="card card--interactive">
        <div class="card__media">${meta.emoji}</div>
        <div class="card__body">
          <span class="${meta.badgeClass}">${meta.label}</span>
          <h3 class="card__title">${l.title}</h3>
          <div class="card__footer">
            <button class="btn-primary btn--sm" onclick="location.href='lesson.html?id=${l.id}'">${meta.cta}</button>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

// ============ البرامج الجديدة ============
async function loadPrograms() {
  const section = document.getElementById("programsSection");
  if (!section) return;

  const { data: enrolled, error } = await supabaseClient
    .from("program_students")
    .select("program_id, program:programs(id, name, sort_order)")
    .eq("student_id", studentProfile.id);

  // أي خطأ أو عدم تسجيل في برنامج: لا نعرض شيئاً ولا نؤثر على الدروس الحالية
  if (error || !enrolled || !enrolled.length) return;

  const programs = enrolled
    .map(e => e.program)
    .filter(Boolean)
    .sort((a, b) => a.sort_order - b.sort_order);
  const ids = programs.map(p => p.id);

  const [{ data: lessons }, { data: submissions }] = await Promise.all([
    supabaseClient.from("lessons").select("id, title, program_id, created_at").in("program_id", ids).order("created_at", { ascending: true }),
    supabaseClient.from("submissions").select("lesson_id, status").eq("student_id", studentProfile.id),
  ]);

  const statusByLesson = {};
  (submissions || []).forEach(s => { statusByLesson[s.lesson_id] = s.status; });

  const esc = (t) => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  section.innerHTML = programs.map(p => {
    const progLessons = (lessons || []).filter(l => l.program_id === p.id);
    const cards = progLessons.length
      ? progLessons.map(l => {
          const meta = STATUS_META[statusByLesson[l.id] || "not_started"];
          return `
            <article class="card card--interactive">
              <div class="card__media">${meta.emoji}</div>
              <div class="card__body">
                <span class="${meta.badgeClass}">${meta.label}</span>
                <h3 class="card__title">${esc(l.title)}</h3>
                <div class="card__footer">
                  <button class="btn-primary btn--sm" onclick="location.href='lesson.html?id=${l.id}'">${meta.cta}</button>
                </div>
              </div>
            </article>`;
        }).join("")
      : `<div class="empty-state">لا توجد دروس في هذا البرنامج بعد. تحقّق لاحقاً!</div>`;

    return `
      <h2 style="margin: 36px 0 6px;">${esc(p.name)} 🌟</h2>
      <div style="margin-bottom: 20px;"></div>
      <div class="lessons-grid">${cards}</div>
    `;
  }).join("");
}

(async () => {
  studentProfile = await requireRole("student");
  if (!studentProfile) return;

  document.getElementById("whoAmI").textContent = `مرحباً، ${studentProfile.full_name} 👋`;
  loadLessons();
  loadPrograms();
})();
