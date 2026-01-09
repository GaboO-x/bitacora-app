import { requireSession, setMsg, getMyProfile, callInviteEdge } from "./shared.js";

(async () => {
  const { supabase, session } = await requireSession();
  if (!supabase || !session) return window.location.href = "./index.html";

  document.getElementById("btnLogout").addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.href = "./index.html";
  });

  const user = session.user;
  const { profile } = await getMyProfile(supabase, user.id);
  if (!profile || profile.role !== "admin") return window.location.href = "./app.html";

  document.getElementById("btnInvite").addEventListener("click", async () => {
    const email = (document.getElementById("inviteEmail").value || "").trim().toLowerCase();
    const full_name = (document.getElementById("inviteName").value || "").trim();
    const role = document.getElementById("inviteRole").value;
    const division = (document.getElementById("inviteDivision").value || "").trim() || null;
    const squad_code = (document.getElementById("inviteSquad").value || "").trim() || null;

    if (!email) return setMsg("msg", "Falta email.", true);
    if (!full_name) return setMsg("msg", "Falta nombre completo.", true);

    const adminPassword = prompt("Password del admin (solo para enviar invitación):");
    if (!adminPassword) return setMsg("msg", "Cancelado.", true);

    const payload = { email, full_name, role, division, squad_code };

    const { data, error } = await callInviteEdge(supabase, user.email, adminPassword, payload);
    if (error) return setMsg("msg", error.message, true);

    try {
      const parsed = typeof data === "string" ? JSON.parse(data) : data;
      if (parsed?.ok) setMsg("msg", `Invitación enviada: ${parsed.email}`, false);
      else setMsg("msg", JSON.stringify(parsed), true);
    } catch {
      setMsg("msg", String(data), false);
    }
  });
})();
