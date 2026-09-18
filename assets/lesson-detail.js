// ============================================
// تفاصيل الدرس + رفع الحل (صورة + تسجيل صوتي مباشر)
// ============================================

let studentProfile = null;
let currentLesson = null;
let existingSubmission = null;

let mediaRecorder = null;
let recordedChunks = [];
let recordedBlob = null;
let recordTimerInterval = null;
let recordSeconds = 0;
let selectedImageFile = null;

function getLessonIdFromUrl() {
  return new URLSearchParams(window.location.search).get("id");
}

async function getSignedUrl(bucket, path, seconds = 600) {
  if (!path) return null;
  const { data, error } = await supabaseClient.storage.from(bucket).createSignedUrl(path, seconds);
  return error ? null : data.signedUrl;
}

function fmtTimer(totalSeconds) {
  const m = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

// ============ العرض الرئيسي ============
async function renderLesson() {
  const container = document.getElementById("lessonContent");
  const homeworkImageUrl = await getSignedUrl("homework-images", currentLesson.homework_image_url);
  const solutionAudioUrl = await getSignedUrl("lesson-audio", currentLesson.solution_audio_path);

  let submissionSectionHtml;

  if (!existingSubmission) {
    submissionSectionHtml = `
      <div class="lesson-section">
        <h2>ارفع حلّك ✍️</h2>
        <div class="stack" style="gap: var(--space-5);">
          <div>
            <label>صورة الحل</label>
            <input type="file" id="solutionImageInput" accept="image/*" capture="environment">
          </div>
          <div class="recorder-box">
            <label style="margin-bottom: var(--space-3);">سجّل صوتك وأنت تشرح حلّك 🎙️</label>
            <button type="button" class="btn-primary record-btn" id="recordBtn">🎙️</button>
            <div class="record-timer" id="recordTimer">00:00</div>
            <div id="audioPreviewWrap" style="margin-top: var(--space-4); display:none;">
              <audio id="audioPreview" controls style="width:100%;"></audio>
              <button type="button" class="btn-ghost btn--sm" id="rerecordBtn" style="margin-top:10px;">إعادة التسجيل</button>
            </div>
          </div>
          <div id="submitMsg"></div>
          <button type="button" class="btn-primary btn--lg" id="submitSolutionBtn" disabled>أرسل الحل 🚀</button>
        </div>
      </div>
    `;
  } else {
    const meta = {
      pending: { text: "معلمك يراجع حلّك الآن، عد قريباً! ⏳", badge: "badge badge--accent" },
      correct: { text: "أحسنت! إجابتك صحيحة 🌟", badge: "badge badge--mint" },
      incorrect: { text: "حاول التركيز أكثر في المرة القادمة 💪", badge: "badge badge--coral" },
    }[existingSubmission.status];

    const teacherAudioUrl = existingSubmission.teacher_audio_url
      ? await getSignedUrl("teacher-audio", existingSubmission.teacher_audio_url)
      : null;

    submissionSectionHtml = `
      <div class="lesson-section">
        <h2>حلّك المُرسَل ✅</h2>
        <div class="card"><div class="card__body">
          <span class="${meta.badge}">${meta.text}</span>
          ${teacherAudioUrl ? `
            <div style="margin-top: var(--space-4);">
              <label>ملاحظات معلمك الصوتية 🔊</label>
              <audio controls style="width:100%;" src="${teacherAudioUrl}"></audio>
            </div>
          ` : `<p style="margin-top: var(--space-3); color: var(--ink-soft);">لم يضف المعلم ملاحظات صوتية بعد.</p>`}
        </div></div>
      </div>
    `;
  }

  container.innerHTML = `
    <h1 style="margin-bottom: var(--space-5);">${currentLesson.title}</h1>

    <div class="lesson-section">
      <h2>فيديو الدرس 🎬</h2>
      <div class="video-frame"><iframe src="${currentLesson.video_url}" allowfullscreen loading="lazy"></iframe></div>
    </div>

    ${homeworkImageUrl ? `
      <div class="lesson-section">
        <h2>صورة الواجب 📝</h2>
        <img class="homework-image-preview" src="${homeworkImageUrl}" alt="صورة الواجب">
      </div>
    ` : ""}

    ${solutionAudioUrl ? `
      <div class="lesson-section">
        <h2>تسجيل صوتي يشرح الحل 🔊</h2>
        <audio controls style="width:100%;" src="${solutionAudioUrl}"></audio>
      </div>
    ` : ""}

    ${submissionSectionHtml}
  `;

  if (!existingSubmission) wireUpSubmissionForm();
}

// ============ نموذج الرفع (تسجيل صوت + صورة) ============
function wireUpSubmissionForm() {
  const imageInput = document.getElementById("solutionImageInput");
  const recordBtn = document.getElementById("recordBtn");
  const submitBtn = document.getElementById("submitSolutionBtn");

  imageInput.addEventListener("change", () => {
    selectedImageFile = imageInput.files[0] || null;
    updateSubmitEnabled();
  });

  recordBtn.addEventListener("click", async () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      return;
    }
    await startRecording();
  });

  document.getElementById("rerecordBtn")?.addEventListener("click", () => {
    recordedBlob = null;
    document.getElementById("audioPreviewWrap").style.display = "none";
    document.getElementById("recordTimer").textContent = "00:00";
    updateSubmitEnabled();
  });

  submitBtn.addEventListener("click", submitSolution);
  updateSubmitEnabled();
}

async function startRecording() {
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
      document.getElementById("audioPreview").src = url;
      document.getElementById("audioPreviewWrap").style.display = "block";
      document.getElementById("recordBtn").classList.remove("recording");
      document.getElementById("recordBtn").textContent = "🎙️";
      stream.getTracks().forEach(t => t.stop());
      updateSubmitEnabled();
    };

    mediaRecorder.start();
    document.getElementById("recordBtn").classList.add("recording");
    document.getElementById("recordBtn").textContent = "⏹️";

    recordTimerInterval = setInterval(() => {
      recordSeconds++;
      document.getElementById("recordTimer").textContent = fmtTimer(recordSeconds);
    }, 1000);
  } catch (err) {
    document.getElementById("submitMsg").innerHTML = `<div class="msg msg-error">تعذّر الوصول للميكروفون: ${err.message}. تأكد من السماح للمتصفح باستخدام الميكروفون.</div>`;
  }
}

function updateSubmitEnabled() {
  const submitBtn = document.getElementById("submitSolutionBtn");
  if (!submitBtn) return;
  submitBtn.disabled = !(selectedImageFile && recordedBlob);
}

async function submitSolution() {
  const submitBtn = document.getElementById("submitSolutionBtn");
  const msgEl = document.getElementById("submitMsg");
  submitBtn.disabled = true;
  submitBtn.textContent = "جارٍ الإرسال...";

  try {
    const uid = studentProfile.id;
    const imagePath = `${uid}/${Date.now()}-${selectedImageFile.name.replace(/\s+/g, "_")}`;
    const audioPath = `${uid}/${Date.now()}-solution.webm`;

    const { error: imgErr } = await supabaseClient.storage.from("submission-images").upload(imagePath, selectedImageFile);
    if (imgErr) throw new Error(`تعذّر رفع الصورة: ${imgErr.message}`);

    const { error: audioErr } = await supabaseClient.storage.from("submission-audio").upload(audioPath, recordedBlob);
    if (audioErr) throw new Error(`تعذّر رفع التسجيل الصوتي: ${audioErr.message}`);

    const { error: insertErr } = await supabaseClient.from("submissions").insert({
      lesson_id: currentLesson.id,
      student_id: uid,
      solution_image_url: imagePath,
      solution_audio_url: audioPath,
      status: "pending",
    });
    if (insertErr) throw new Error(insertErr.message);

    existingSubmission = { status: "pending", teacher_audio_url: null };
    triggerConfetti();
    renderLesson();
  } catch (err) {
    msgEl.innerHTML = `<div class="msg msg-error">${err.message}</div>`;
    submitBtn.disabled = false;
    submitBtn.textContent = "أرسل الحل 🚀";
  }
}

// ============ تشغيل الصفحة ============
(async () => {
  studentProfile = await requireRole("student");
  if (!studentProfile) return;

  const lessonId = getLessonIdFromUrl();
  if (!lessonId) {
    document.getElementById("lessonContent").innerHTML = `<div class="empty-state">درس غير محدد.</div>`;
    return;
  }

  const { data: lesson, error: lessonErr } = await supabaseClient
    .from("lessons")
    .select("id, title, video_url, homework_image_url, solution_audio_path")
    .eq("id", lessonId)
    .single();

  if (lessonErr || !lesson) {
    document.getElementById("lessonContent").innerHTML = `<div class="empty-state">تعذّر تحميل الدرس.</div>`;
    return;
  }
  currentLesson = lesson;

  const { data: submission } = await supabaseClient
    .from("submissions")
    .select("status, teacher_audio_url")
    .eq("lesson_id", lessonId)
    .eq("student_id", studentProfile.id)
    .maybeSingle();

  existingSubmission = submission || null;
  renderLesson();
})();
