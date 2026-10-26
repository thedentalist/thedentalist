// Map viewer: click the map to open it, then zoom continuously (mouse wheel, trackpad or pinch),
// drag to move, double-click or double-tap to toggle, or use the + / - buttons and keys.
(function () {
  const link = document.querySelector(".map-zoom");
  if (!link) return;
  const thumb = link.querySelector("img");
  const en = /\/en(?:\/|$)/.test(window.location.pathname);
  const text = en
    ? { close: "Close", zoomIn: "Zoom in", zoomOut: "Zoom out", fit: "Fit to screen", hint: "Scroll or pinch to zoom, drag to move, double-click to toggle" }
    : { close: "Bezárás", zoomIn: "Nagyítás", zoomOut: "Kicsinyítés", fit: "Teljes kép", hint: "Görgessen vagy csippentsen a nagyításhoz, húzza a mozgatáshoz, dupla kattintással válthat" };

  // Logical size of the full-resolution map; the screen shows it scaled between "fit" and MAX_SCALE.
  const NAT_W = 3840, NAT_H = 2160, MAX_SCALE = 2.5;

  function button(label, symbol, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-label", label);
    b.title = label;
    b.textContent = symbol;
    b.addEventListener("click", onClick);
    return b;
  }

  function open() {
    const overlay = document.createElement("div");
    overlay.className = "map-lightbox";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", thumb.alt);

    const view = document.createElement("div");
    view.className = "map-lightbox-view";
    const big = document.createElement("img");
    big.alt = thumb.alt;
    big.draggable = false;
    big.width = NAT_W;
    big.height = NAT_H;
    big.src = thumb.currentSrc || thumb.src;
    view.appendChild(big);

    // Show the already-loaded preview at once, then swap in the full-resolution map when it arrives.
    const full = new Image();
    full.onload = () => { big.src = full.src; };
    full.src = link.href;

    let scale = 1, minScale = 1, tx = 0, ty = 0;
    const vw = () => view.clientWidth;
    const vh = () => view.clientHeight;

    function apply() {
      const w = NAT_W * scale, h = NAT_H * scale;
      tx = w <= vw() ? (vw() - w) / 2 : Math.min(0, Math.max(vw() - w, tx));
      ty = h <= vh() ? (vh() - h) / 2 : Math.min(0, Math.max(vh() - h, ty));
      big.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    }
    function fit() {
      minScale = Math.min(vw() / NAT_W, vh() / NAT_H);
      scale = minScale; tx = 0; ty = 0;
      apply();
    }
    function zoomAt(factor, cx, cy) {
      const next = Math.min(Math.max(MAX_SCALE, minScale), Math.max(minScale, scale * factor));
      const r = next / scale;
      tx = cx - (cx - tx) * r;
      ty = cy - (cy - ty) * r;
      scale = next;
      apply();
    }
    const centre = () => [vw() / 2, vh() / 2];

    const tools = document.createElement("div");
    tools.className = "map-lightbox-tools";
    const close = button(text.close, "×", () => shut());
    close.classList.add("map-lightbox-close");
    tools.append(
      button(text.zoomIn, "+", () => zoomAt(1.5, ...centre())),
      button(text.zoomOut, "−", () => zoomAt(1 / 1.5, ...centre())),
      button(text.fit, "⤢", fit),
      close
    );

    const hint = document.createElement("p");
    hint.className = "map-lightbox-hint";
    hint.textContent = text.hint;

    overlay.append(view, tools, hint);
    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";
    fit();
    close.focus();

    view.addEventListener("wheel", e => {
      e.preventDefault();
      const rect = view.getBoundingClientRect();
      const delta = e.deltaY * (e.deltaMode === 1 ? 16 : 1);
      zoomAt(Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0018)), e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });

    const pointers = new Map();
    let lastDist = 0;
    view.addEventListener("pointerdown", e => {
      view.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      view.classList.add("is-dragging");
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        lastDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    view.addEventListener("pointermove", e => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (pointers.size === 1) {
        tx += dx; ty += dy; apply();
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const rect = view.getBoundingClientRect();
        if (lastDist) zoomAt(dist / lastDist, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top);
        lastDist = dist;
      }
    });
    const release = e => {
      pointers.delete(e.pointerId);
      lastDist = 0;
      if (!pointers.size) view.classList.remove("is-dragging");
    };
    view.addEventListener("pointerup", release);
    view.addEventListener("pointercancel", release);

    view.addEventListener("dblclick", e => {
      const rect = view.getBoundingClientRect();
      if (scale > minScale * 1.05) fit();
      else zoomAt(Math.max(1, minScale * 2) / scale, e.clientX - rect.left, e.clientY - rect.top);
    });

    function onKey(e) {
      const step = 80;
      if (e.key === "Escape") shut();
      else if (e.key === "+" || e.key === "=") zoomAt(1.4, ...centre());
      else if (e.key === "-" || e.key === "_") zoomAt(1 / 1.4, ...centre());
      else if (e.key === "0") fit();
      else if (e.key === "ArrowLeft") { tx += step; apply(); }
      else if (e.key === "ArrowRight") { tx -= step; apply(); }
      else if (e.key === "ArrowUp") { ty += step; apply(); }
      else if (e.key === "ArrowDown") { ty -= step; apply(); }
    }
    function onResize() {
      const wasFit = scale <= minScale * 1.001;
      minScale = Math.min(vw() / NAT_W, vh() / NAT_H);
      scale = wasFit ? minScale : Math.max(minScale, scale);
      apply();
    }
    function shut() {
      overlay.remove();
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      link.focus();
    }
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
  }

  link.addEventListener("click", e => { e.preventDefault(); open(); });
})();
