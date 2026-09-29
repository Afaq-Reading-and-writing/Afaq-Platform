// ============================================
// لوحة المشرف - إدارة المستخدمين
// ============================================

let currentTab = "student";
let adminProfile = null;
let usersCache = [];
let searchQuery = "";

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" });
}

function statusPill(isActive) {
  return isActive
    ? `<span class="pill pill-sage">مُفعّل</span>`
    : `<span class="pill pill-amber">بانتظار التفعيل</span>`;
}

async function loadCounts() {
  const [{ count: studentsCount }, { count: teachersCount }] = await Promise.all([
    supabaseClient.from("users").select("id", { count: "exact", head: true }).eq("role", "student"),
    supabaseClient.from("users").select("id", { count: "exact", head: true }).eq("role", "teacher"),
  ]);
  document.getElementById("studentsCount").textContent = studentsCount ?? "—";
  document.getElementById("teachersCount").textContent = teachersCount ?? "—";
}

function renderUsers() {
  const listEl = document.getElementById("usersList");
  const q = searchQuery.trim().toLowerCase();

  const filtered = q
    ? usersCache.filter(u => u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    : usersCache;

  if (!filtered.length) {
    listEl.innerHTML = `<div class="empty-state">${q ? "لا نتائج مطابقة لبحثك." : `لا يوجد ${currentTab === "student" ? "طلاب" : "معلمون"} حتى الآن. أنشئ أول حساب من الزر أعلاه.`}</div>`;
    return;
  }

  listEl.innerHTML = filtered.map(u => `
    <div class="register-row">
      <div class="name">${u.full_name}</div>
      <div class="meta">${u.email}</div>
      <div>${statusPill(u.is_active)}</div>
      <div class="meta">${fmtDate(u.created_at)}</div>
      <div class="row-actions">
        <button class="btn-ghost" onclick="toggleActive('${u.id}', ${u.is_active})">
          ${u.is_active ? "تعطيل" : "تفعيل"}
        </button>
        <button class="btn-ghost" onclick="deleteUser('${u.id}', '${u.full_name.replace(/'/g, "")}')" style="color: var(--brick);">
          حذف
        </button>
      </div>
    </div>
  `).join("");
}

async function loadUsers() {
  const listEl = document.getElementById("usersList");
  listEl.innerHTML = `<div class="empty-state">جارٍ التحميل...</div>`;

  const { data, error } = await supabaseClient
    .from("users")
    .select("id, full_name, email, is_active, created_at")
    .eq("role", currentTab)
    .order("created_at", { ascending: false });

  if (error) {
    listEl.innerHTML = `<div class="empty-state">تعذّر تحميل القائمة: ${error.message}</div>`;
    return;
  }

  usersCache = data;
  renderUsers();
}

document.getElementById("userSearchInput").addEventListener("input", (e) => {
  searchQuery = e.target.value;
  renderUsers();
});

async function deleteUser(userId, userName) {
  if (!confirm(`هل أنت متأكد من حذف حساب "${userName}" نهائياً؟ لا يمكن التراجع عن هذا الإجراء، وستُحذف كل بياناته المرتبطة (دروس/حلول إن وُجدت).`)) return;

  const { data: { session } } = await supabaseClient.auth.getSession();

  try {
    const res = await fetch(DELETE_USER_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ user_id: userId }),
    });
    const result = await res.json();

    if (!res.ok) {
      document.getElementById("listMsg").innerHTML = `<div class="msg msg-error">${result.error || "تعذّر الحذف"}</div>`;
      return;
    }

    document.getElementById("listMsg").innerHTML = `<div class="msg msg-success">تم حذف الحساب بنجاح.</div>`;
    loadUsers();
    loadCounts();
  } catch (err) {
    document.getElementById("listMsg").innerHTML = `<div class="msg msg-error">تعذّر الاتصال بالخادم: ${err.message}</div>`;
  }
}

async function toggleActive(userId, currentlyActive) {
  const { error } = await supabaseClient
    .from("users")
    .update({ is_active: !currentlyActive })
    .eq("id", userId);

  if (error) {
    document.getElementById("listMsg").innerHTML = `<div class="msg msg-error">تعذّر التحديث: ${error.message}</div>`;
    return;
  }
  loadUsers();
}

function switchTab(role) {
  currentTab = role;
  searchQuery = "";
  document.getElementById("userSearchInput").value = "";
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.role === role));
  loadUsers();
}

// ============ نافذة إنشاء حساب ============
function openCreateModal() {
  document.getElementById("createModalTitle").textContent =
    currentTab === "student" ? "إنشاء حساب طالب" : "إنشاء حساب معلم";
  document.getElementById("createUserForm").reset();
  document.getElementById("createMsg").innerHTML = "";
  document.getElementById("createModalOverlay").hidden = false;
}

function closeCreateModal() {
  document.getElementById("createModalOverlay").hidden = true;
}

document.getElementById("createUserForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("createSubmitBtn");
  btn.disabled = true;
  btn.textContent = "جارٍ الإنشاء...";

  const full_name = document.getElementById("newFullName").value.trim();
  const email = document.getElementById("newEmail").value.trim();

  const { data: { session } } = await supabaseClient.auth.getSession();

  try {
    const res = await fetch(CREATE_USER_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ email, full_name, role: currentTab }),
    });
    const result = await res.json();

    if (!res.ok) {
      document.getElementById("createMsg").innerHTML = `<div class="msg msg-error">${result.error || "حدث خطأ غير متوقع"}</div>`;
      btn.disabled = false;
      btn.textContent = "إنشاء الحساب";
      return;
    }

    closeCreateModal();
    document.getElementById("listMsg").innerHTML = `<div class="msg msg-success">تم إنشاء الحساب بنجاح. الحساب بانتظار التفعيل.</div>`;
    loadCounts();
    loadUsers();
  } catch (err) {
    document.getElementById("createMsg").innerHTML = `<div class="msg msg-error">تعذّر الاتصال بالخادم: ${err.message}</div>`;
  }

  btn.disabled = false;
  btn.textContent = "إنشاء الحساب";
});

// ============ تشغيل الصفحة ============
(async () => {
  adminProfile = await requireRole("admin");
  if (!adminProfile) return;

  document.getElementById("whoAmI").textContent = `مرحباً، ${adminProfile.full_name}`;
  loadCounts();
  loadUsers();
})();
