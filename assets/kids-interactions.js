/* ==========================================================================
   محفوظ من v0 لاستخدامه لاحقاً عند بناء صفحة الطالب (بطاقات الدروس، الأوسمة، شريط التقدّم)
   غير مرتبط بأي صفحة حالياً في لوحة الأدمن.
   ========================================================================== */
(function () {
  "use strict";

  function toArabicDigits(value) {
    var map = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
    return String(value).replace(/[0-9]/g, function (d) { return map[Number(d)]; });
  }

  var bar = document.getElementById("progress-bar");
  var label = document.getElementById("progress-label");
  var current = 40;

  function renderProgress() {
    if (!bar || !label) return;
    bar.style.width = current + "%";
    label.textContent = "٪" + toArabicDigits(current);
  }

  document.querySelectorAll("[data-progress]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var action = btn.getAttribute("data-progress");
      current = action === "reset" ? 0 : Math.min(100, current + Number(action));
      renderProgress();
    });
  });

  document.querySelectorAll(".card--interactive").forEach(function (card) {
    function activate() {
      card.animate(
        [{ transform: "scale(1)" }, { transform: "scale(0.97)" }, { transform: "scale(1)" }],
        { duration: 220, easing: "ease-out" }
      );
    }
    card.addEventListener("click", activate);
    card.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(); }
    });
  });

  document.querySelectorAll("[data-chip-group] .chip").forEach(function (chip) {
    chip.addEventListener("click", function () {
      var pressed = chip.getAttribute("aria-pressed") === "true";
      chip.setAttribute("aria-pressed", String(!pressed));
    });
  });

  document.querySelectorAll(".medal__disc:not(.medal__disc--locked)").forEach(function (disc) {
    disc.style.cursor = "pointer";
    disc.addEventListener("click", function () {
      disc.animate(
        [
          { transform: "rotate(0) scale(1)" },
          { transform: "rotate(-12deg) scale(1.15)" },
          { transform: "rotate(12deg) scale(1.15)" },
          { transform: "rotate(0) scale(1)" },
        ],
        { duration: 500, easing: "ease-in-out" }
      );
    });
  });

  if (bar) renderProgress();
})();
