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

    const role = (document.querySelector('input[name="inviteRole"]:checked')?.value || "user").trim();

    const divisions = Array.from(document.querySelectorAll('input[name="inviteDivision"]:checked'))
      .map(x => (x.value || "").trim())
      .filter(Boolean);

    const squads = Array.from(document.querySelectorAll('input[name="inviteSquad"]:checked'))
      .map(x => (x.value || "").trim())
      .filter(Boolean);

    if (!email) return setMsg("msg", "Falta email.", true);
    if (!full_name) return setMsg("msg", "Falta nombre completo.", true);

    // Backward-compatible fields (si el backend aún espera singular)
    const division = divisions[0] || null;
    const squad_code = squads[0] || null;

    const payload = { email, full_name, role, divisions, squads, division, squad_code };

    const { data, error } = await callInviteEdge(supabase, user.email, null, payload);
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
