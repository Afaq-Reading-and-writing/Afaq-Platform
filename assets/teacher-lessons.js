// ============================================
// لوحة المشرف - إدارة الدروس
// ============================================

let adminProfile = null;
let lessonsCache = [];

let mediaRecorder = null;
let recordedChunks = [];
let recordedBlob = null;
let recordTimerInterval = null;
let recordSeconds = 0;
let existingAudioPath = null; // مسار التسجيل الحالي عند التعديل (يبقى محفوظاً إن لم يسجّل المعلم تسجيلاً جديداً)

function fmtTimer(s) {
  const m = String(Math.floor(s / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${m}:${sec}`;
}

// تحويل أي رابط يوتيوب عادي (watch?v=... أو youtu.be/... أو shorts/...) لصيغة embed القابلة للعرض داخل إطار
// روابط Bunny أو أي منصة أخرى تُترك كما هي دون تغيير
function normalizeVideoUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace("www.", "").replace("m.", "");

    if (host === "youtu.be") {
      const id = u.pathname.slice(1);
      return id ? `https://www.youtube.com/embed/${id}` : url;
    }

    if (host === "youtube.com") {
      if (u.pathname === "/watch") {
        const id = u.searchParams.get("v");
        return id ? `https://www.youtube.com/embed/${id}` : url;
      }
      if (u.pathname.startsWith("/shorts/")) {
        const id = u.pathname.split("/")[2];
        return id ? `https://www.youtube.com/embed/${id}` : url;
      }
    }

    return url; // أي رابط آخر (Bunny، embed جاهز، إلخ) يبقى كما هو
  } catch {
    return url;
  }
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" });
}

async function getSignedImageUrl(path) {
  if (!path) return null;
  const { data, error } = await supabaseClient
    .storage
    .from("homework-images")
    .createSignedUrl(path, 60 * 10); // صالح لـ 10 دقائق، يكفي للمعاينة
  if (error) return null;
  return data.signedUrl;
}

async function getSignedAudioUrl(path) {
  if (!path) return null;
  const { data, error } = await supabaseClient
    .storage
    .from("lesson-audio")
    .createSignedUrl(path, 60 * 10);
  if (error) return null;
  return data.signedUrl;
}

async function loadLessons() {
  const listEl = document.getElementById("lessonsList");
  listEl.innerHTML = `<div class="empty-state">جارٍ التحميل...</div>`;

  const { data, error } = await supabaseClient
    .from("lessons")
    .select("id, title, video_url, homework_image_url, solution_audio_path, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    listEl.innerHTML = `<div class="empty-state">تعذّر تحميل الدروس: ${error.message}</div>`;
    return;
  }

  lessonsCache = data;

  if (!data.length) {
    listEl.innerHTML = `<div class="empty-state">لا توجد دروس بعد. أضف أول درس من الزر أعلاه.</div>`;
    return;
  }

  listEl.innerHTML = data.map(l => `
    <div class="register-row" style="grid-template-columns: 1.4fr 0.7fr 0.9fr 0.9fr;">
      <div class="name">${l.title}</div>
      <div>${l.homework_image_url ? `<a href="#" onclick="previewImage('${l.id}'); return false;" style="color:var(--indigo); font-weight:600;">معاينة</a>` : `<span class="meta">لا يوجد</span>`}</div>
      <div class="meta">${fmtDate(l.created_at)}</div>
      <div class="row-actions">
        <button class="btn-ghost" onclick="openLessonModal('${l.id}')">تعديل</button>
        <button class="btn-ghost" onclick="deleteLesson('${l.id}')">حذف</button>
      </div>
    </div>
  `).join("");
}

async function previewImage(lessonId) {
  const lesson = lessonsCache.find(l => l.id === lessonId);
  if (!lesson?.homework_image_url) return;
  const url = await getSignedImageUrl(lesson.homework_image_url);
  if (url) window.open(url, "_blank");
  else alert("تعذّر توليد رابط المعاينة.");
}

// ============ نافذة الإضافة/التعديل ============
function openLessonModal(lessonId = null) {
  document.getElementById("lessonForm").reset();
  document.getElementById("lessonMsg").innerHTML = "";
  document.getElementById("lessonId").value = lessonId || "";
  document.getElementById("currentImageNote").textContent = "";
  document.getElementById("currentAudioNote").textContent = "";

  // تصفير عناصر رفع فيديو الدرس والمسجّل الصوتي من المحاولة السابقة
  document.getElementById("lessonVideoUploadStatus").textContent = "";
  document.getElementById("lessonVideoProgressWrap").style.display = "none";
  document.getElementById("lessonVideoFile").value = "";
  document.getElementById("lessonAudioPreviewWrap").style.display = "none";
  document.getElementById("lessonAudioTimer").textContent = "00:00";
  recordedBlob = null;
  existingAudioPath = null;

  if (lessonId) {
    const lesson = lessonsCache.find(l => l.id === lessonId);
    document.getElementById("lessonModalTitle").textContent = "تعديل الدرس";
    document.getElementById("lessonTitle").value = lesson.title;
    document.getElementById("lessonVideoUrl").value = lesson.video_url;
    if (lesson.homework_image_url) {
      document.getElementById("currentImageNote").textContent = "(يوجد ملف حالياً — اختر ملفاً جديداً لاستبداله فقط)";
    }
    if (lesson.solution_audio_path) {
      existingAudioPath = lesson.solution_audio_path;
      document.getElementById("currentAudioNote").textContent = "(يوجد تسجيل حالياً — سجّل تسجيلاً جديداً لاستبداله فقط)";
    }
  } else {
    document.getElementById("lessonModalTitle").textContent = "إضافة درس جديد";
  }

  document.getElementById("lessonModalOverlay").hidden = false;
}

function closeLessonModal() {
  if (mediaRecorder && mediaRecorder.state === "recording") mediaRecorder.stop();
  document.getElementById("lessonModalOverlay").hidden = true;
}

async function deleteLesson(lessonId) {
  if (!confirm("هل أنت متأكد من حذف هذا الدرس؟ لا يمكن التراجع عن هذا الإجراء.")) return;

  const { error } = await supabaseClient.from("lessons").delete().eq("id", lessonId);
  if (error) {
    document.getElementById("listMsg").innerHTML = `<div class="msg msg-error">تعذّر الحذف: ${error.message}</div>`;
    return;
  }
  loadLessons();
}

// ============ التسجيل الصوتي لشرح الحل ============
document.getElementById("lessonAudioRecordBtn").addEventListener("click", async () => {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    return;
  }
  await startAudioRecording();
});

document.getElementById("lessonAudioRerecordBtn").addEventListener("click", () => {
  recordedBlob = null;
  document.getElementById("lessonAudioPreviewWrap").style.display = "none";
  document.getElementById("lessonAudioTimer").textContent = "00:00";
});

async function startAudioRecording() {
  const btn = document.getElementById("lessonAudioRecordBtn");
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
      document.getElementById("lessonAudioPreview").src = url;
      document.getElementById("lessonAudioPreviewWrap").style.display = "block";
      btn.classList.remove("recording");
      btn.textContent = "🎙️";
      stream.getTracks().forEach(t => t.stop());
    };

    mediaRecorder.start();
    btn.classList.add("recording");
    btn.textContent = "⏹️";

    recordTimerInterval = setInterval(() => {
      recordSeconds++;
      document.getElementById("lessonAudioTimer").textContent = fmtTimer(recordSeconds);
    }, 1000);
  } catch (err) {
    document.getElementById("lessonMsg").innerHTML = `<div class="msg msg-error">تعذّر الوصول للميكروفون: ${err.message}</div>`;
  }
}

document.getElementById("lessonForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("lessonSubmitBtn");
  btn.disabled = true;
  btn.textContent = "جارٍ الحفظ...";

  const lessonId = document.getElementById("lessonId").value || null;
  const title = document.getElementById("lessonTitle").value.trim();
  const video_url = normalizeVideoUrl(document.getElementById("lessonVideoUrl").value.trim());
  const file = document.getElementById("lessonImageFile").files[0];

  try {
    let homework_image_url = null;
    let solution_audio_path = existingAudioPath; // يبقى كما هو إن لم يسجّل المعلم تسجيلاً جديداً

    if (file) {
      const path = `${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
      const { error: uploadError } = await supabaseClient
        .storage
        .from("homework-images")
        .upload(path, file);

      if (uploadError) throw new Error(`تعذّر رفع الصورة: ${uploadError.message}`);
      homework_image_url = path;
    }

    if (recordedBlob) {
      const audioPath = `${Date.now()}-solution-audio.webm`;
      const { error: audioErr } = await supabaseClient
        .storage
        .from("lesson-audio")
        .upload(audioPath, recordedBlob);

      if (audioErr) throw new Error(`تعذّر رفع التسجيل الصوتي: ${audioErr.message}`);
      solution_audio_path = audioPath;
    }

    if (lessonId) {
      const updatePayload = { title, video_url, solution_audio_path };
      if (homework_image_url) updatePayload.homework_image_url = homework_image_url;

      const { error } = await supabaseClient.from("lessons").update(updatePayload).eq("id", lessonId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseClient.from("lessons").insert({
        title, video_url, solution_audio_path,
        homework_image_url,
        created_by: adminProfile.id,
      });
      if (error) throw new Error(error.message);
    }

    closeLessonModal();
    document.getElementById("listMsg").innerHTML = `<div class="msg msg-success">تم حفظ الدرس بنجاح.</div>`;
    loadLessons();
  } catch (err) {
    document.getElementById("lessonMsg").innerHTML = `<div class="msg msg-error">${err.message}</div>`;
  }

  btn.disabled = false;
  btn.textContent = "حفظ الدرس";
});

// ============ رفع الفيديو المباشر إلى Bunny Stream عبر TUS ============
async function uploadVideoToBunny(file, cfg) {
  const statusEl = document.getElementById(cfg.statusElId);
  const progressWrap = document.getElementById(cfg.progressWrapId);
  const progressBar = document.getElementById(cfg.progressBarId);
  const targetInput = document.getElementById(cfg.targetInputId);

  statusEl.textContent = "جارٍ التحضير...";
  progressWrap.style.display = "block";
  progressBar.style.width = "0%";

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();

    const res = await fetch(CREATE_BUNNY_VIDEO_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ title: file.name }),
    });
    const result = await res.json();

    if (!res.ok) {
      statusEl.textContent = `❌ ${result.error || "تعذّر بدء الرفع"}`;
      return;
    }

    const { videoId, libraryId, expirationTime, signature } = result;

    const upload = new tus.Upload(file, {
      endpoint: "https://video.bunnycdn.com/tusupload",
      retryDelays: [0, 3000, 5000, 10000, 20000, 30000, 60000, 60000, 60000],
      chunkSize: 5 * 1024 * 1024, // أجزاء 5 ميغابايت - يقلّل حجم البيانات المفقودة عند أي انقطاع اتصال
      headers: {
        AuthorizationSignature: signature,
        AuthorizationExpire: String(expirationTime),
        VideoId: videoId,
        LibraryId: String(libraryId),
      },
      metadata: {
        filetype: file.type,
        title: file.name,
      },
      onError: (err) => {
        statusEl.textContent = `❌ فشل الرفع: ${err.message || err}`;
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        const pct = ((bytesUploaded / bytesTotal) * 100).toFixed(0);
        progressBar.style.width = pct + "%";
        statusEl.textContent = `جارٍ الرفع... ${pct}%`;
      },
      onSuccess: () => {
        const embedUrl = `https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}`;
        targetInput.value = embedUrl;
        statusEl.textContent = "✅ تم الرفع بنجاح";
        progressBar.style.width = "100%";
      },
    });

    upload.start();
  } catch (err) {
    statusEl.textContent = `❌ خطأ: ${err.message}`;
  }
}

document.getElementById("lessonVideoFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  uploadVideoToBunny(file, {
    statusElId: "lessonVideoUploadStatus",
    progressWrapId: "lessonVideoProgressWrap",
    progressBarId: "lessonVideoProgressBar",
    targetInputId: "lessonVideoUrl",
  });
});

// ============ تشغيل الصفحة ============
(async () => {
  adminProfile = await requireRole("teacher");
  if (!adminProfile) return;

  document.getElementById("whoAmI").textContent = `مرحباً، ${adminProfile.full_name}`;
  loadLessons();
})();
