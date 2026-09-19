// ============================================
// تسجيل الدخول + التوجيه حسب الدور
// ============================================

const loginForm = document.getElementById("loginForm");
const loginMsg = document.getElementById("loginMsg");
const loginBtn = document.getElementById("loginBtn");

function showMsg(text, type = "error") {
  loginMsg.innerHTML = `<div class="msg msg-${type === "error" ? "error" : "success"}">${text}</div>`;
}

async function redirectByRole() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;

  const { data: profile, error } = await supabaseClient
    .from("users")
    .select("role, is_active")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    showMsg("تعذّر العثور على بيانات الحساب. تواصل مع الإدارة.");
    await supabaseClient.auth.signOut();
    return;
  }

  if (!profile.is_active) {
    showMsg("حسابك لم يُفعّل بعد. تواصل مع الإدارة عبر واتساب لإتمام التفعيل.");
    await supabaseClient.auth.signOut();
    return;
  }

  if (profile.role === "admin") {
    window.location.href = "admin.html";
  } else if (profile.role === "teacher") {
    window.location.href = "teacher.html";
  } else {
    window.location.href = "student.html";
  }
}

loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginBtn.disabled = true;
  loginBtn.textContent = "جارٍ الدخول...";
  loginMsg.innerHTML = "";

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    console.error("تفاصيل خطأ تسجيل الدخول (للتشخيص فقط):", error);
    showMsg("البريد الإلكتروني أو كلمة المرور غير صحيحة.");
    loginBtn.disabled = false;
    loginBtn.textContent = "تسجيل الدخول";
    return;
  }

  await redirectByRole();
  loginBtn.disabled = false;
  loginBtn.textContent = "تسجيل الدخول";
});

// إن كان المستخدم مسجّلاً دخوله بالفعل عند فتح صفحة الدخول، وجّهه مباشرة
(async () => {
  if (document.getElementById("loginForm")) {
    // حماية: إن كانت الجلسة قادمة من رابط دعوة أو استرجاع كلمة مرور (لم تُستكمل بعد)
    // نوجّه المستخدم لصفحة تعيين كلمة المرور بدل تسجيل دخوله تلقائياً بلا كلمة مرور
    const hash = window.location.hash || "";
    if (hash.includes("type=invite") || hash.includes("type=recovery")) {
      window.location.href = "reset-password.html" + hash;
      return;
    }

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) await redirectByRole();
  }
})();

// ============================================
// دالة حماية الصفحات الداخلية (تُستخدم في admin.js وغيرها)
// تتحقق من الجلسة والدور، وتُعيد التوجيه لصفحة الدخول عند الفشل
// ============================================
async function requireRole(requiredRole) {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) {
    window.location.href = "index.html";
    return null;
  }

  const { data: profile, error } = await supabaseClient
    .from("users")
    .select("id, full_name, email, role, is_active")
    .eq("id", user.id)
    .single();

  if (error || !profile || !profile.is_active || profile.role !== requiredRole) {
    await supabaseClient.auth.signOut();
    window.location.href = "index.html";
    return null;
  }

  return profile;
}

async function logout() {
  await supabaseClient.auth.signOut();
  window.location.href = "index.html";
}
