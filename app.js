import { requireSession, setMsg, getMyProfile } from "./shared.js";

(async () => {
  const { supabase, session } = await requireSession();
  if (!supabase || !session) return window.location.href = "./index.html";

  document.getElementById("btnLogout").addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.href = "./index.html";
  });

  const user = session.user;
  document.getElementById("who").textContent = user.email || user.id;

  const { profile, error } = await getMyProfile(supabase, user.id);
  if (error) return setMsg("msg", error.message, true);

  document.getElementById("profile").textContent = JSON.stringify(profile, null, 2);

  if (profile?.role === "admin") {
    document.getElementById("adminLink").style.display = "inline";
  }
})();
