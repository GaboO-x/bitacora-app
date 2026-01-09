import { getCfg, saveCfg, ensureSupabase, setMsg } from "./shared.js";

document.getElementById("btnSaveCfg").addEventListener("click", () => {
  const url = (document.getElementById("cfgUrl").value || "").trim();
  const key = (document.getElementById("cfgAnon").value || "").trim();
  if (!url || !key) return setMsg("cfgMsg", "Faltan datos.", true);
  saveCfg(url, key);
  setMsg("cfgMsg", "Configuración guardada.", false);
});

(async () => {
  const cfg = getCfg();
  if (cfg?.url) document.getElementById("cfgUrl").value = cfg.url;
  if (cfg?.anon) document.getElementById("cfgAnon").value = cfg.anon;

  document.getElementById("btnLogin").addEventListener("click", async () => {
    const email = (document.getElementById("email").value || "").trim();
    const password = (document.getElementById("password").value || "").trim();

    if (!email || !password) return setMsg("msg", "Email y contraseña son requeridos.", true);

    const supabase = await ensureSupabase();
    if (!supabase) return setMsg("msg", "Configura Supabase primero (Project URL y Publishable key).", true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return setMsg("msg", error.message, true);

    window.location.href = "./app.html";
  });

  if ("serviceWorker" in navigator) {
    try { await navigator.serviceWorker.register("./sw.js"); } catch {}
  }
})();
