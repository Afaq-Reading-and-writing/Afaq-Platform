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
let selectedImageFile2 = null; // الصورة الثانية (اختيارية - حد أقصى صورتان)
let retryMode = false; // الطالب يعيد الواجب بعد تقييمه "خطأ"

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

  // دروس البرامج الجديدة: إن لم يضع المشرف واجباً للدرس فلا يظهر للطالب أي واجب أو نموذج رفع
  // (يبقى القسم ظاهراً إن كان للطالب حل مُرسَل سابقاً)
  const hideSubmission = !!currentLesson.program_id && !currentLesson.homework_image_url && !existingSubmission;

  let submissionSectionHtml;

  if (!existingSubmission || retryMode) {
    submissionSectionHtml = `
      <div class="lesson-section">
        <h2>${retryMode ? "أعد حلّ الواجب 🔁" : "ارفع حلّك ✍️"}</h2>
        <div class="stack" style="gap: var(--space-5);">
          <div>
            <label>صورة الحل</label>
            <input type="file" id="solutionImageInput" accept="image/*" capture="environment">
            <button type="button" class="btn-ghost btn--sm" id="addSecondImageBtn" style="margin-top:10px;">➕ أرسل صورة أخرى (إذا لم تكفِ صورة واحدة)</button>
            <div id="secondImageWrap" style="display:none; margin-top:10px;">
              <label>الصورة الثانية</label>
              <input type="file" id="solutionImageInput2" accept="image/*" capture="environment">
              <button type="button" class="btn-ghost btn--sm" id="removeSecondImageBtn" style="margin-top:8px;">إلغاء الصورة الثانية</button>
            </div>
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
          ${existingSubmission.status === "incorrect" ? `
            <div style="margin-top: var(--space-4);">
              <button type="button" class="btn-primary btn--lg" id="retryBtn">إعادة 🔁</button>
            </div>
          ` : ""}
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

    ${hideSubmission ? "" : submissionSectionHtml}
  `;

  if ((!existingSubmission || retryMode) && !hideSubmission) wireUpSubmissionForm();

  document.getElementById("retryBtn")?.addEventListener("click", () => {
    retryMode = true;
    selectedImageFile = null;
    selectedImageFile2 = null;
    recordedBlob = null;
    renderLesson();
  });
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

  const addSecondBtn = document.getElementById("addSecondImageBtn");
  const secondWrap = document.getElementById("secondImageWrap");
  const imageInput2 = document.getElementById("solutionImageInput2");

  addSecondBtn.addEventListener("click", () => {
    secondWrap.style.display = "block";
    addSecondBtn.style.display = "none";
  });
  imageInput2.addEventListener("change", () => {
    selectedImageFile2 = imageInput2.files[0] || null;
  });
  document.getElementById("removeSecondImageBtn").addEventListener("click", () => {
    imageInput2.value = "";
    selectedImageFile2 = null;
    secondWrap.style.display = "none";
    addSecondBtn.style.display = "";
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

    // الصورة الثانية (اختيارية)
    let imagePath2 = null;
    if (selectedImageFile2) {
      imagePath2 = `${uid}/${Date.now()}-2-${selectedImageFile2.name.replace(/\s+/g, "_")}`;
      const { error: img2Err } = await supabaseClient.storage.from("submission-images").upload(imagePath2, selectedImageFile2);
      if (img2Err) throw new Error(`تعذّر رفع الصورة الثانية: ${img2Err.message}`);
    }

    if (retryMode && existingSubmission?.id) {
      // إعادة المحاولة: نحدّث نفس السجل ونعيده لحالة "بانتظار المراجعة"
      const { error: updErr } = await supabaseClient.from("submissions").update({
        solution_image_url: imagePath,
        solution_image_url_2: imagePath2,
        solution_audio_url: audioPath,
        status: "pending",
        teacher_audio_url: null,
        reviewed_by: null,
        reviewed_at: null,
        submitted_at: new Date().toISOString(),
      }).eq("id", existingSubmission.id);
      if (updErr) throw new Error(updErr.message);
    } else {
      const { error: insertErr } = await supabaseClient.from("submissions").insert({
        lesson_id: currentLesson.id,
        student_id: uid,
        solution_image_url: imagePath,
        solution_image_url_2: imagePath2,
        solution_audio_url: audioPath,
        status: "pending",
      });
      if (insertErr) throw new Error(insertErr.message);
    }

    existingSubmission = { id: existingSubmission?.id || null, status: "pending", teacher_audio_url: null };
    retryMode = false;
    selectedImageFile = null;
    selectedImageFile2 = null;
    recordedBlob = null;
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
    .select("id, title, video_url, homework_image_url, solution_audio_path, program_id")
    .eq("id", lessonId)
    .single();

  if (lessonErr || !lesson) {
    document.getElementById("lessonContent").innerHTML = `<div class="empty-state">تعذّر تحميل الدرس.</div>`;
    return;
  }
  currentLesson = lesson;

  const { data: submission } = await supabaseClient
    .from("submissions")
    .select("id, status, teacher_audio_url")
    .eq("lesson_id", lessonId)
    .eq("student_id", studentProfile.id)
    .maybeSingle();

  existingSubmission = submission || null;
  renderLesson();
})();
