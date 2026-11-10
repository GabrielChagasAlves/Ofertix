(() => {
  if (window.top !== window || document.getElementById("__ofertix_extension_root")) return;

  const api = globalThis.browser || globalThis.chrome;
  if (!api?.runtime?.getURL) return;

  const root = document.createElement("div");
  root.id = "__ofertix_extension_root";
  const shadow = root.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    .launcher {
      position: fixed; right: 22px; bottom: 22px; z-index: 2147483647;
      width: 54px; height: 54px; padding: 0; border: 0; border-radius: 17px;
      display: grid; place-items: center; cursor: pointer;
      background: #fff; box-shadow: 0 8px 28px rgba(15,23,42,.24);
      transition: transform .18s ease, box-shadow .18s ease;
    }
    .launcher:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(15,23,42,.3); }
    .launcher img { width: 34px; height: 34px; }
    .panel {
      position: fixed; right: 22px; bottom: 88px; z-index: 2147483647;
      width: min(410px, calc(100vw - 28px)); height: min(680px, calc(100vh - 116px));
      border: 0; border-radius: 18px; background: transparent;
      box-shadow: 0 18px 60px rgba(15,23,42,.28); overflow: hidden;
    }
    .panel[hidden] { display: none; }
    @media (max-width: 480px) {
      .launcher { right: 14px; bottom: 14px; }
      .panel { right: 8px; bottom: 78px; width: calc(100vw - 16px); height: calc(100vh - 92px); }
    }
  `;

  const launcher = document.createElement("button");
  launcher.className = "launcher";
  launcher.type = "button";
  launcher.title = "Abrir Ofertix — Aprovações";
  launcher.setAttribute("aria-label", "Abrir Ofertix — Aprovações");
  const logo = document.createElement("img");
  logo.src = api.runtime.getURL("icons/ofertix.svg");
  logo.alt = "";
  launcher.append(logo);

  const frame = document.createElement("iframe");
  frame.className = "panel";
  frame.title = "Ofertix — Aprovações";
  frame.src = api.runtime.getURL("panel.html");
  frame.hidden = true;
  frame.setAttribute("allow", "clipboard-read; clipboard-write");

  launcher.addEventListener("click", () => { frame.hidden = !frame.hidden; });
  window.addEventListener("message", (event) => {
    if (event.source !== frame.contentWindow) return;
    if (event.data?.type === "OFERTIX_MINIMIZE") frame.hidden = true;
  });

  shadow.append(style, launcher, frame);
  (document.documentElement || document.body).append(root);
})();