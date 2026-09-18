/* ==========================================================================
   تأثير احتفال بسيط (Confetti) بدون أي مكتبة خارجية
   الاستخدام: triggerConfetti() من أي مكان بعد تضمين هذا الملف
   ========================================================================== */
function triggerConfetti() {
  const colors = ["#01A896", "#ffb020", "#46c9a0", "#ff7a7a", "#a97be8"];
  const emojis = ["🎉", "⭐", "🌟", "✨"];
  const count = 26;

  for (let i = 0; i < count; i++) {
    const piece = document.createElement("div");
    const isEmoji = Math.random() > 0.6;

    piece.textContent = isEmoji ? emojis[Math.floor(Math.random() * emojis.length)] : "";
    piece.style.position = "fixed";
    piece.style.zIndex = "9999";
    piece.style.pointerEvents = "none";
    piece.style.top = "-20px";
    piece.style.left = Math.random() * 100 + "vw";
    piece.style.fontSize = isEmoji ? (14 + Math.random() * 14) + "px" : "0";

    if (!isEmoji) {
      piece.style.width = "10px";
      piece.style.height = "10px";
      piece.style.borderRadius = Math.random() > 0.5 ? "50%" : "2px";
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    }

    document.body.appendChild(piece);

    const duration = 1800 + Math.random() * 1200;
    const driftX = (Math.random() - 0.5) * 200;
    const rotate = (Math.random() - 0.5) * 720;

    piece.animate(
      [
        { transform: "translate(0, 0) rotate(0deg)", opacity: 1 },
        { transform: `translate(${driftX}px, ${window.innerHeight + 40}px) rotate(${rotate}deg)`, opacity: 0.9 },
      ],
      { duration, easing: "cubic-bezier(0.25, 0.46, 0.45, 0.94)" }
    );

    setTimeout(() => piece.remove(), duration);
  }
}
