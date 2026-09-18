// ============================================
// لوحة الطالب - عرض الدروس وحالتها
// ============================================

let studentProfile = null;

const STATUS_META = {
  not_started: { label: "لم تبدأ بعد", badgeClass: "badge", cta: "ابدأ الدرس", emoji: "📘" },
  pending: { label: "بانتظار التصحيح", badgeClass: "badge badge--accent", cta: "عرض الدرس", emoji: "⏳" },
  correct: { label: "أحسنت! ✅", badgeClass: "badge badge--mint", cta: "مشاهدة مرة أخرى", emoji: "🌟" },
  incorrect: { label: "حاول التركيز أكثر", badgeClass: "badge badge--coral", cta: "مشاهدة الدرس", emoji: "💪" },
};

async function loadLessons() {
  const grid = document.getElementById("lessonsGrid");
  grid.innerHTML = `<div class="empty-state">جارٍ التحميل...</div>`;

  const [{ data: lessons, error: lessonsErr }, { data: submissions, error: subErr }] = await Promise.all([
    supabaseClient.from("lessons").select("id, title, created_at").order("created_at", { ascending: true }),
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

(async () => {
  studentProfile = await requireRole("student");
  if (!studentProfile) return;

  document.getElementById("whoAmI").textContent = `مرحباً، ${studentProfile.full_name} 👋`;
  loadLessons();
})();
