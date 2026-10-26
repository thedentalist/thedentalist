// Click the map to enlarge it; click the enlarged map again to zoom to full size and scroll around.
(function () {
  const link = document.querySelector(".map-zoom");
  if (!link) return;
  const thumb = link.querySelector("img");
  const en = /\/en(?:\/|$)/.test(window.location.pathname);
  const text = en
    ? { close: "Close", hint: "Click the map to zoom in or out" }
    : { close: "Bezárás", hint: "Kattintson a térképre a nagyításhoz vagy kicsinyítéshez" };

  function open() {
    const overlay = document.createElement("div");
    overlay.className = "map-lightbox";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", thumb.alt);

    const view = document.createElement("div");
    view.className = "map-lightbox-view";
    const big = document.createElement("img");
    big.src = link.href;
    big.alt = thumb.alt;
    big.addEventListener("click", () => overlay.classList.toggle("is-zoomed"));
    view.appendChild(big);

    const close = document.createElement("button");
    close.type = "button";
    close.className = "map-lightbox-close";
    close.setAttribute("aria-label", text.close);
    close.textContent = "×";

    const hint = document.createElement("p");
    hint.className = "map-lightbox-hint";
    hint.textContent = text.hint;

    overlay.append(view, close, hint);
    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";
    close.focus();

    function shut() {
      overlay.remove();
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
      link.focus();
    }
    function onKey(e) { if (e.key === "Escape") shut(); }
    close.addEventListener("click", shut);
    view.addEventListener("click", e => { if (e.target === view) shut(); });
    document.addEventListener("keydown", onKey);
  }

  link.addEventListener("click", e => { e.preventDefault(); open(); });
})();
