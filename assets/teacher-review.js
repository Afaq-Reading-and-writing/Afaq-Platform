// ============================================
// لوحة المعلم - مراجعة الحلول وتقييمها
// ============================================

let teacherProfile = null;
let currentFilter = "pending";
let submissionsCache = [];
let activeSubmission = null;
let pendingStatus = null;

let mediaRecorder = null;
let recordedChunks = [];
let recordedBlob = null;
let recordTimerInterval = null;
let recordSeconds = 0;

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" });
}
function fmtTimer(s) {
  const m = String(Math.floor(s / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${m}:${sec}`;
}

const STATUS_META = {
  pending: { label: "بانتظار المراجعة", cls: "pill-amber" },
  correct: { label: "صحيحة", cls: "pill-sage" },
  incorrect: { label: "تحتاج مراجعة", cls: "pill-brick" },
};

async function getSignedUrl(bucket, path, seconds = 600) {
  if (!path) return null;
  const { data, error } = await supabaseClient.storage.from(bucket).createSignedUrl(path, seconds);
  return error ? null : data.signedUrl;
}

// ============ قائمة الحلول ============
async function loadSubmissions() {
  const listEl = document.getElementById("submissionsList");
  listEl.innerHTML = `<div class="empty-state">جارٍ التحميل...</div>`;

  let query = supabaseClient
    .from("submissions")
    .select("id, status, submitted_at, solution_image_url, solution_audio_url, teacher_audio_url, lesson:lessons(title), student:users!submissions_student_id_fkey(full_name)")
    .order("submitted_at", { ascending: false });

  if (currentFilter !== "all") query = query.eq("status", currentFilter);

  const { data, error } = await query;

  if (error) {
    listEl.innerHTML = `<div class="empty-state">تعذّر تحميل الحلول: ${error.message}</div>`;
    return;
  }

  submissionsCache = data;

  if (!data.length) {
    listEl.innerHTML = `<div class="empty-state">لا توجد حلول في هذا التصنيف حالياً.</div>`;
    return;
  }

  listEl.innerHTML = data.map(s => {
    const meta = STATUS_META[s.status];
    return `
      <div class="register-row" style="grid-template-columns: 1fr 1.2fr 0.7fr 0.9fr 0.7fr;">
        <div class="name">${s.student?.full_name || "—"}</div>
        <div class="meta">${s.lesson?.title || "—"}</div>
        <div><span class="pill ${meta.cls}">${meta.label}</span></div>
        <div class="meta">${fmtDate(s.submitted_at)}</div>
        <div class="row-actions">
          <button class="btn-ghost" onclick="openReviewModal('${s.id}')">مراجعة</button>
        </div>
      </div>
    `;
  }).join("");
}

function switchFilter(filter) {
  currentFilter = filter;
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.filter === filter));
  loadSubmissions();
}

// ============ نافذة المراجعة ============
async function openReviewModal(submissionId) {
  activeSubmission = submissionsCache.find(s => s.id === submissionId);
  if (!activeSubmission) return;

  pendingStatus = activeSubmission.status === "pending" ? null : activeSubmission.status;
  recordedBlob = null;

  document.getElementById("reviewModalTitle").textContent = `مراجعة حل ${activeSubmission.student?.full_name || ""}`;
  document.getElementById("reviewMsg").innerHTML = "";
  document.getElementById("teacherAudioPreviewWrap").style.display = "none";
  document.getElementById("teacherRecordTimer").textContent = "00:00";
  updateStatusButtons();

  document.getElementById("reviewModalOverlay").hidden = false;

  const [imgUrl, audioUrl] = await Promise.all([
    getSignedUrl("submission-images", activeSubmission.solution_image_url),
    getSignedUrl("submission-audio", activeSubmission.solution_audio_url),
  ]);
  document.getElementById("reviewImage").src = imgUrl || "";
  document.getElementById("reviewAudio").src = audioUrl || "";
}

function closeReviewModal() {
  if (mediaRecorder && mediaRecorder.state === "recording") mediaRecorder.stop();
  document.getElementById("reviewModalOverlay").hidden = true;
}

function updateStatusButtons() {
  const correctBtn = document.getElementById("markCorrectBtn");
  const incorrectBtn = document.getElementById("markIncorrectBtn");
  correctBtn.style.opacity = pendingStatus === "correct" ? "1" : "0.55";
  incorrectBtn.style.opacity = pendingStatus === "incorrect" ? "1" : "0.55";
}

document.getElementById("markCorrectBtn").addEventListener("click", () => { pendingStatus = "correct"; updateStatusButtons(); });
document.getElementById("markIncorrectBtn").addEventListener("click", () => { pendingStatus = "incorrect"; updateStatusButtons(); });

// ============ تسجيل الملاحظة الصوتية ============
document.getElementById("teacherRecordBtn").addEventListener("click", async () => {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    return;
  }
  await startRecording();
});

async function startRecording() {
  const btn = document.getElementById("teacherRecordBtn");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    recordedChunks = [];
    recordSeconds = 0;

    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };

    mediaRecorder.onstop = () => {
      clearInterval(recordTimerInterval);
      recordedBlob = new Blob(recordedChunks, { type: "audio/webm" });
      const url = URL.createObjectURL(recordedBlob);
      document.getElementById("teacherAudioPreview").src = url;
      document.getElementById("teacherAudioPreviewWrap").style.display = "block";
      btn.classList.remove("recording");
      btn.textContent = "🎙️";
      stream.getTracks().forEach(t => t.stop());
    };

    mediaRecorder.start();
    btn.classList.add("recording");
    btn.textContent = "⏹️";

    recordTimerInterval = setInterval(() => {
      recordSeconds++;
      document.getElementById("teacherRecordTimer").textContent = fmtTimer(recordSeconds);
    }, 1000);
  } catch (err) {
    document.getElementById("reviewMsg").innerHTML = `<div class="msg msg-error">تعذّر الوصول للميكروفون: ${err.message}</div>`;
  }
}

// ============ حفظ التقييم ============
document.getElementById("saveReviewBtn").addEventListener("click", async () => {
  const saveBtn = document.getElementById("saveReviewBtn");
  const msgEl = document.getElementById("reviewMsg");

  if (!pendingStatus) {
    msgEl.innerHTML = `<div class="msg msg-error">اختر "صحيح" أو "خطأ" أولاً.</div>`;
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = "جارٍ الحفظ...";

  try {
    const updatePayload = {
      status: pendingStatus,
      reviewed_by: teacherProfile.id,
      reviewed_at: new Date().toISOString(),
    };

    if (recordedBlob) {
      const { data: subRow } = await supabaseClient
        .from("submissions")
        .select("student_id")
        .eq("id", activeSubmission.id)
        .single();

      const audioPath = `${subRow.student_id}/${Date.now()}-feedback.webm`;
      const { error: uploadErr } = await supabaseClient.storage.from("teacher-audio").upload(audioPath, recordedBlob);
      if (uploadErr) throw new Error(`تعذّر رفع التسجيل: ${uploadErr.message}`);
      updatePayload.teacher_audio_url = audioPath;
    }

    const { error: updateErr } = await supabaseClient.from("submissions").update(updatePayload).eq("id", activeSubmission.id);
    if (updateErr) throw new Error(updateErr.message);

    closeReviewModal();
    document.getElementById("listMsg").innerHTML = `<div class="msg msg-success">تم حفظ التقييم بنجاح.</div>`;
    loadSubmissions();
  } catch (err) {
    msgEl.innerHTML = `<div class="msg msg-error">${err.message}</div>`;
  }

  saveBtn.disabled = false;
  saveBtn.textContent = "حفظ التقييم";
});

// ============ تشغيل الصفحة ============
(async () => {
  teacherProfile = await requireRole("teacher");
  if (!teacherProfile) return;

  document.getElementById("whoAmI").textContent = `مرحباً، ${teacherProfile.full_name}`;
  loadSubmissions();
})();
