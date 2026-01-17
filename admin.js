import { requireSession, setMsg, getMyProfile, callInviteEdge } from "./shared.js";

(async () => {
  const { supabase, session } = await requireSession();
  if (!supabase || !session) {
    window.location.href = "./index.html";
    return;
  }

  // Logout
  document.getElementById("btnLogout")?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.href = "./index.html";
  });

  // AuthZ: solo admin
  const user = session.user;
  const { profile } = await getMyProfile(supabase, user.id);
  if (!profile || profile.role !== "admin") {
    window.location.href = "./app.html";
    return;
  }

  // -----------------------------
  // Navegación (Inicio / Secciones)
  // -----------------------------
  const sections = {
    home: document.getElementById("sectionHome"),
    invite: document.getElementById("sectionInvite"),
    calendar: document.getElementById("sectionCalendar"),
    announcements: document.getElementById("sectionAnnouncements"),
    materials: document.getElementById("sectionMaterials"),
  };

  function showSection(key) {
    Object.values(sections).forEach(el => el?.classList.remove("active"));
    sections[key]?.classList.add("active");
  }

  // Menu buttons
  document.getElementById("navInvite")?.addEventListener("click", () => showSection("invite"));
  document.getElementById("navCalendar")?.addEventListener("click", async () => {
    showSection("calendar");
    await loadCalActivities();
  });

  document.getElementById("navAnnouncements")?.addEventListener("click", async () => {
    showSection("announcements");
    await loadAnnouncements();
  });

  document.getElementById("navMaterials")?.addEventListener("click", async () => {
    showSection("materials");
    await loadMaterials();
  });


  // Back to home buttons
  document.getElementById("backFromInvite")?.addEventListener("click", () => showSection("home"));
  document.getElementById("backFromCalendar")?.addEventListener("click", () => showSection("home"));
  document.getElementById("backFromAnnouncements")?.addEventListener("click", () => showSection("home"));
  document.getElementById("backFromMaterials")?.addEventListener("click", () => showSection("home"));

  // -----------------------------
  // Invitar usuario
  // -----------------------------
  const btnInvite = document.getElementById("btnInvite");
  let inviteLoadingTimer = null;

  function setInviteLoading(isLoading) {
    if (!btnInvite) return;
    if (!btnInvite.dataset.originalText) {
      btnInvite.dataset.originalText = btnInvite.textContent || "Enviar invitación";
    }

    if (!isLoading) {
      btnInvite.disabled = false;
      btnInvite.textContent = btnInvite.dataset.originalText;
      if (inviteLoadingTimer) {
        clearInterval(inviteLoadingTimer);
        inviteLoadingTimer = null;
      }
      return;
    }

    btnInvite.disabled = true;
    const base = "Enviando";
    let dots = 0;
    btnInvite.textContent = base;
    inviteLoadingTimer = setInterval(() => {
      dots = (dots + 1) % 4;
      btnInvite.textContent = base + ".".repeat(dots);
    }, 350);
  }

  btnInvite?.addEventListener("click", async () => {
    if (btnInvite.disabled) return;

    const email = (document.getElementById("inviteEmail")?.value || "").trim().toLowerCase();
    const full_name = (document.getElementById("inviteName")?.value || "").trim();

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

    setMsg("msg", "Enviando invitación…", false);
    setInviteLoading(true);

    try {
      const { data, error } = await callInviteEdge(supabase, user.email, null, payload);
      if (error) return setMsg("msg", error.message, true);

      try {
        const parsed = typeof data === "string" ? JSON.parse(data) : data;
        if (parsed?.ok) setMsg("msg", `Invitación enviada: ${parsed.email}`, false);
        else setMsg("msg", JSON.stringify(parsed), true);
      } catch {
        setMsg("msg", String(data), false);
      }
    } finally {
      setInviteLoading(false);
    }
  });

  // -----------------------------
  // Calendario / Actividades CRUD
  // -----------------------------
  const calEls = {
    activity: document.getElementById("calActivity"),
    eventDate: document.getElementById("calEventDate"),
    ownerName: document.getElementById("calOwnerName"),
    contactPhone: document.getElementById("calContactPhone"),
    investment: document.getElementById("calInvestment"),
    btnSave: document.getElementById("calBtnSave"),
    btnCancel: document.getElementById("calBtnCancel"),
    tbody: document.getElementById("calTbody"),
  };

  let calSelectedId = null;
  let calRows = [];
  let calBusy = false;

  function safeText(v) {
    return (v ?? "").toString();
  }

  function fmtMoney(v) {
    if (v === null || v === undefined || v === "") return "";
    const num = Number(v);
    if (Number.isNaN(num)) return safeText(v);
    return num.toLocaleString("es-CR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function setCalMsg(text, isError) {
    setMsg("calMsg", text, !!isError);
  }

  function setCalSaveLoading(isLoading, idleText) {
    if (!calEls.btnSave) return;
    if (!calEls.btnSave.dataset.originalText) {
      calEls.btnSave.dataset.originalText = calEls.btnSave.textContent || "Guardar";
    }

    if (!isLoading) {
      calEls.btnSave.disabled = false;
      calEls.btnSave.textContent = idleText || calEls.btnSave.dataset.originalText;
      return;
    }

    calEls.btnSave.disabled = true;
    calEls.btnSave.textContent = "Procesando…";
  }

  function setCalCancelVisible(isVisible) {
    if (!calEls.btnCancel) return;
    calEls.btnCancel.style.display = isVisible ? "" : "none";
  }

  function resetCalForm() {
    calSelectedId = null;
    if (calEls.activity) calEls.activity.value = "";
    if (calEls.eventDate) calEls.eventDate.value = "";
    if (calEls.ownerName) calEls.ownerName.value = "";
    if (calEls.contactPhone) calEls.contactPhone.value = "";
    if (calEls.investment) calEls.investment.value = "";
    if (calEls.btnSave) calEls.btnSave.textContent = "Crear actividad";
    setCalCancelVisible(false);
  }

  function readCalForm() {
    const activity = (calEls.activity?.value || "").trim();
    const event_date = (calEls.eventDate?.value || "").trim();
    const owner_name = (calEls.ownerName?.value || "").trim();
    const contact_phone = (calEls.contactPhone?.value || "").trim();
    const invRaw = (calEls.investment?.value || "").toString().trim();
    const investment = invRaw === "" ? null : Number(invRaw);

    return { activity, event_date, owner_name, contact_phone, investment };
  }

  function validateCalPayload(p) {
    if (!p.activity) return "Falta Actividad.";
    if (!p.event_date) return "Falta Fecha.";
    if (p.investment !== null && Number.isNaN(p.investment)) return "Inversión inválida.";
    return null;
  }

  function renderCalTable() {
    if (!calEls.tbody) return;

    if (!Array.isArray(calRows) || calRows.length === 0) {
      calEls.tbody.innerHTML = '<tr><td colspan="6" style="padding:10px;" class="muted">No hay actividades.</td></tr>';
      return;
    }

    calEls.tbody.innerHTML = calRows.map(r => {
      const id = safeText(r.id);
      const activity = safeText(r.activity);
      const date = safeText(r.event_date);
      const owner = safeText(r.owner_name);
      const phone = safeText(r.contact_phone);
      const inv = fmtMoney(r.investment);

      return `
        <tr data-row-id="${id}">
          <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.08);">${activity}</td>
          <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.08);">${date}</td>
          <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.08);">${owner}</td>
          <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.08);">${phone}</td>
          <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.08);">${inv}</td>
          <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.08);white-space:nowrap;">
            <button data-action="edit" data-id="${id}" class="secondary" style="margin-right:8px;">Editar</button>
            <button data-action="delete" data-id="${id}" class="secondary">Eliminar</button>
          </td>
        </tr>
      `;
    }).join("");
  }

  async function loadCalActivities() {
    if (calBusy) return;
    calBusy = true;
    try {
      if (calEls.tbody) {
        calEls.tbody.innerHTML = '<tr><td colspan="6" style="padding:10px;" class="muted">Cargando…</td></tr>';
      }

      const { data, error } = await supabase
        .from("calendar_activities")
        .select("*")
        .order("event_date", { ascending: true });

      if (error) {
        setCalMsg(error.message, true);
        calRows = [];
        renderCalTable();
        return;
      }

      calRows = Array.isArray(data) ? data : [];
      renderCalTable();
      setCalMsg("", false);
    } finally {
      calBusy = false;
    }
  }

  function fillFormForEdit(row) {
    calSelectedId = row.id;
    if (calEls.activity) calEls.activity.value = row.activity ?? "";
    if (calEls.eventDate) calEls.eventDate.value = row.event_date ?? "";
    if (calEls.ownerName) calEls.ownerName.value = row.owner_name ?? "";
    if (calEls.contactPhone) calEls.contactPhone.value = row.contact_phone ?? "";
    if (calEls.investment) calEls.investment.value = row.investment ?? "";

    if (calEls.btnSave) calEls.btnSave.textContent = "Guardar cambios";
    setCalCancelVisible(true);

    setCalMsg("Editando actividad…", false);
  }

  calEls.btnCancel?.addEventListener("click", () => {
    resetCalForm();
    setCalMsg("", false);
  });

  calEls.btnSave?.addEventListener("click", async () => {
    if (calBusy) return;

    const payload = readCalForm();
    const err = validateCalPayload(payload);
    if (err) {
      setCalMsg(err, true);
      return;
    }

    calBusy = true;
    setCalSaveLoading(true);

    try {
      if (!calSelectedId) {
        // INSERT (SIN created_by; lo asigna el trigger)
        const { error } = await supabase
          .from("calendar_activities")
          .insert({
            activity: payload.activity,
            event_date: payload.event_date,
            owner_name: payload.owner_name,
            contact_phone: payload.contact_phone,
            investment: payload.investment,
          });

        if (error) {
          setCalMsg(error.message, true);
          return;
        }

        setCalMsg("Actividad creada.", false);
        resetCalForm();
        await loadCalActivities();
        return;
      }

      // UPDATE
      const { error } = await supabase
        .from("calendar_activities")
        .update({
          activity: payload.activity,
          event_date: payload.event_date,
          owner_name: payload.owner_name,
          contact_phone: payload.contact_phone,
          investment: payload.investment,
        })
        .eq("id", calSelectedId);

      if (error) {
        setCalMsg(error.message, true);
        return;
      }

      setCalMsg("Cambios guardados.", false);
      resetCalForm();
      await loadCalActivities();
    } finally {
      setCalSaveLoading(false, calSelectedId ? "Guardar cambios" : "Crear actividad");
      calBusy = false;
    }
  });

  // Delegación de acciones (Editar/Eliminar)
  calEls.tbody?.addEventListener("click", async (ev) => {
    const btn = ev.target?.closest?.("button");
    if (!btn) return;

    const action = btn.getAttribute("data-action");
    const id = btn.getAttribute("data-id");
    if (!action || !id) return;

    const row = calRows.find(x => String(x.id) === String(id));
    if (!row) return;

    if (action === "edit") {
      fillFormForEdit(row);
      return;
    }

    if (action === "delete") {
      if (calBusy) return;
      const ok = window.confirm("¿Eliminar esta actividad? Esta acción no se puede deshacer.");
      if (!ok) return;

      calBusy = true;
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Procesando…";

      try {
        const { error } = await supabase
          .from("calendar_activities")
          .delete()
          .eq("id", id);

        if (error) {
          setCalMsg(error.message, true);
          return;
        }

        setCalMsg("Actividad eliminada.", false);
        if (String(calSelectedId) === String(id)) resetCalForm();
        await loadCalActivities();
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
        calBusy = false;
      }
    }
  });

  // Carga inicial del menu
  showSection("home");


  // -----------------------------
  // Anuncios (subir imagen a Storage + registrar en tabla)
  // -----------------------------
  const annEls = {
    title: document.getElementById("annTitle"),
    file: document.getElementById("annFile"),
    btnPublish: document.getElementById("annBtnPublish"),
    list: document.getElementById("annList"),
  };

  let annBusy = false;
  let annRows = [];

  function setAnnMsg(text, isError) {
    setMsg("annMsg", text, !!isError);
  }

  function escapeHtml(s) {
    const str = (s == null) ? "" : String(s);
    return str
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function parseFileNameFromUrl(url) {
    try {
      const u = new URL(url);
      const parts = u.pathname.split("/").filter(Boolean);
      return parts[parts.length - 1] || "archivo";
    } catch {
      const parts = String(url || "").split("/");
      return parts[parts.length - 1] || "archivo";
    }
  }

  function renderAnnList() {
    if (!annEls.list) return;

    if (!Array.isArray(annRows) || annRows.length === 0) {
      annEls.list.innerHTML = '<div class="muted">No hay anuncios.</div>';
      return;
    }

    annEls.list.innerHTML = annRows.map(r => {
      const title = escapeHtml(r.title || "(Sin título)");
      const created = r.created_at ? new Date(r.created_at).toLocaleString() : "";
      const url = r.image_url || "";
      const fileName = url ? escapeHtml(parseFileNameFromUrl(url)) : "";
      const id = r.id;

      const preview = url
        ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="secondary" style="text-decoration:none;">Ver</a>`
        : '<span class="muted">(sin imagen)</span>';

      const download = url
        ? `<a href="${escapeHtml(url)}" download class="secondary" style="text-decoration:none;">Descargar</a>`
        : '';

      return `
        <div style="border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:12px;display:flex;gap:12px;align-items:flex-start;justify-content:space-between;">
          <div style="min-width:0;">
            <div style="font-weight:700;">${title}</div>
            <div class="muted small" style="margin-top:4px;">${escapeHtml(created)}${fileName ? ` • ${fileName}` : ''}</div>
            <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;">${preview}${download}</div>
          </div>
          <div style="display:flex;gap:10px;align-items:center;">
            <button data-ann-action="delete" data-id="${escapeHtml(id)}" class="secondary" type="button">Eliminar</button>
          </div>
        </div>
      `;
    }).join("");
  }

  async function loadAnnouncements() {
    if (annBusy) return;
    annBusy = true;
    try {
      if (annEls.list) annEls.list.innerHTML = '<div class="muted">Cargando…</div>';

      const { data, error } = await supabase
        .from("announcements")
        .select("id, title, image_url, created_at")
        .order("created_at", { ascending: false });

      if (error) {
        setAnnMsg(error.message, true);
        annRows = [];
        renderAnnList();
        return;
      }

      annRows = Array.isArray(data) ? data : [];
      renderAnnList();
      setAnnMsg("", false);
    } finally {
      annBusy = false;
    }
  }

  function setAnnPublishLoading(isLoading) {
    if (!annEls.btnPublish) return;
    if (!annEls.btnPublish.dataset.originalText) {
      annEls.btnPublish.dataset.originalText = annEls.btnPublish.textContent || "Publicar anuncio";
    }

    if (!isLoading) {
      annEls.btnPublish.disabled = false;
      annEls.btnPublish.textContent = annEls.btnPublish.dataset.originalText;
      return;
    }

    annEls.btnPublish.disabled = true;
    annEls.btnPublish.textContent = "Procesando…";
  }

  async function getPublicOrSignedUrl(bucket, path) {
    try {
      const pub = supabase.storage.from(bucket).getPublicUrl(path);
      if (pub?.data?.publicUrl) return pub.data.publicUrl;
    } catch {}

    try {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24 * 7);
      if (!error && data?.signedUrl) return data.signedUrl;
    } catch {}

    return null;
  }

  annEls.btnPublish?.addEventListener("click", async () => {
    if (annBusy) return;

    const title = (annEls.title?.value || "").trim();
    const file = annEls.file?.files?.[0] || null;

    if (!file) {
      setAnnMsg("Selecciona una imagen.", true);
      return;
    }

    annBusy = true;
    setAnnPublishLoading(true);
    setAnnMsg("Subiendo anuncio…", false);

    try {
      // Upload a Storage: bucket announcements
      const ext = (file.name || "").split(".").pop() || "png";
      const safeExt = ext.replace(/[^a-zA-Z0-9]/g, "") || "png";
      const filePath = `ann_${Date.now()}_${Math.random().toString(16).slice(2)}.${safeExt}`;

      const { error: upErr } = await supabase
        .storage
        .from("announcements")
        .upload(filePath, file, { upsert: false, contentType: file.type || undefined });

      if (upErr) {
        setAnnMsg(upErr.message, true);
        return;
      }

      const url = await getPublicOrSignedUrl("announcements", filePath);
      if (!url) {
        setAnnMsg("No se pudo obtener URL del archivo en Storage.", true);
        return;
      }

      // Insert a tabla announcements
      const { error: insErr } = await supabase
        .from("announcements")
        .insert({
          title: title || null,
          image_url: url,
        });

      if (insErr) {
        setAnnMsg(insErr.message, true);
        return;
      }

      if (annEls.title) annEls.title.value = "";
      if (annEls.file) annEls.file.value = "";

      setAnnMsg("Anuncio publicado.", false);
      await loadAnnouncements();
    } finally {
      setAnnPublishLoading(false);
      annBusy = false;
    }
  });

  annEls.list?.addEventListener("click", async (ev) => {
    const btn = ev.target?.closest?.("button");
    if (!btn) return;
    const action = btn.getAttribute("data-ann-action");
    const id = btn.getAttribute("data-id");
    if (action !== "delete" || !id) return;

    if (annBusy) return;
    const ok = window.confirm("¿Eliminar este anuncio? Esta acción no se puede deshacer.");
    if (!ok) return;

    annBusy = true;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Procesando…";

    try {
      const { error } = await supabase
        .from("announcements")
        .delete()
        .eq("id", id);

      if (error) {
        setAnnMsg(error.message, true);
        return;
      }

      setAnnMsg("Anuncio eliminado.", false);
      await loadAnnouncements();
    } finally {
      btn.disabled = false;
      btn.textContent = originalText || "Eliminar";
      annBusy = false;
    }
  });

  // -----------------------------
  // Material de apoyo (subir imagen a Storage + registrar en tabla)
  // -----------------------------
  const matEls = {
    title: document.getElementById("matTitle"),
    file: document.getElementById("matFile"),
    btnPublish: document.getElementById("matBtnPublish"),
    list: document.getElementById("matList"),
  };

  let matBusy = false;
  let matRows = [];

  function setMatMsg(text, isError) {
    setMsg("matMsg", text, !!isError);
  }

  function renderMatList() {
    if (!matEls.list) return;

    if (!Array.isArray(matRows) || matRows.length === 0) {
      matEls.list.innerHTML = '<div class="muted">No hay materiales.</div>';
      return;
    }

    matEls.list.innerHTML = matRows.map(r => {
      const title = escapeHtml(r.title || "(Sin título)");
      const created = r.created_at ? new Date(r.created_at).toLocaleString() : "";
      const url = r.image_url || "";
      const fileName = (r.file_name || (url ? parseFileNameFromUrl(url) : "")) || "";
      const id = r.id;

      const preview = url
        ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="secondary" style="text-decoration:none;">Ver</a>`
        : '<span class="muted">(sin imagen)</span>';

      const download = url
        ? `<a href="${escapeHtml(url)}" download class="secondary" style="text-decoration:none;">Descargar</a>`
        : '';

      return `
        <div style="border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:12px;display:flex;gap:12px;align-items:flex-start;justify-content:space-between;">
          <div style="min-width:0;">
            <div style="font-weight:700;">${title}</div>
            <div class="muted small" style="margin-top:4px;">${escapeHtml(created)}${fileName ? ` • ${escapeHtml(fileName)}` : ''}</div>
            <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;">${preview}${download}</div>
          </div>
          <div style="display:flex;gap:10px;align-items:center;">
            <button data-mat-action="delete" data-id="${escapeHtml(id)}" class="secondary" type="button">Eliminar</button>
          </div>
        </div>
      `;
    }).join("");
  }

  async function loadMaterials() {
    if (matBusy) return;
    matBusy = true;
    try {
      if (matEls.list) matEls.list.innerHTML = '<div class="muted">Cargando…</div>';

      const { data, error } = await supabase
        .from("materials")
        .select("id, title, image_url, file_name, created_at")
        .order("created_at", { ascending: false });

      if (error) {
        setMatMsg(error.message, true);
        matRows = [];
        renderMatList();
        return;
      }

      matRows = Array.isArray(data) ? data : [];
      renderMatList();
      setMatMsg("", false);
    } finally {
      matBusy = false;
    }
  }

  function setMatPublishLoading(isLoading) {
    if (!matEls.btnPublish) return;
    if (!matEls.btnPublish.dataset.originalText) {
      matEls.btnPublish.dataset.originalText = matEls.btnPublish.textContent || "Publicar material";
    }

    if (!isLoading) {
      matEls.btnPublish.disabled = false;
      matEls.btnPublish.textContent = matEls.btnPublish.dataset.originalText;
      return;
    }

    matEls.btnPublish.disabled = true;
    matEls.btnPublish.textContent = "Procesando…";
  }

  matEls.btnPublish?.addEventListener("click", async () => {
    if (matBusy) return;

    const title = (matEls.title?.value || "").trim();
    const file = matEls.file?.files?.[0] || null;

    if (!file) {
      setMatMsg("Selecciona una imagen.", true);
      return;
    }

    matBusy = true;
    setMatPublishLoading(true);
    setMatMsg("Subiendo material…", false);

    try {
      const ext = (file.name || "").split(".").pop() || "png";
      const safeExt = ext.replace(/[^a-zA-Z0-9]/g, "") || "png";
      const filePath = `mat_${Date.now()}_${Math.random().toString(16).slice(2)}.${safeExt}`;

      const { error: upErr } = await supabase
        .storage
        .from("materials")
        .upload(filePath, file, { upsert: false, contentType: file.type || undefined });

      if (upErr) {
        setMatMsg(upErr.message, true);
        return;
      }

      const url = await getPublicOrSignedUrl("materials", filePath);
      if (!url) {
        setMatMsg("No se pudo obtener URL del archivo en Storage.", true);
        return;
      }

      const { error: insErr } = await supabase
        .from("materials")
        .insert({
          title: title || null,
          image_url: url,
          file_name: file.name || null,
        });

      if (insErr) {
        setMatMsg(insErr.message, true);
        return;
      }

      if (matEls.title) matEls.title.value = "";
      if (matEls.file) matEls.file.value = "";

      setMatMsg("Material publicado.", false);
      await loadMaterials();
    } finally {
      setMatPublishLoading(false);
      matBusy = false;
    }
  });

  matEls.list?.addEventListener("click", async (ev) => {
    const btn = ev.target?.closest?.("button");
    if (!btn) return;
    const action = btn.getAttribute("data-mat-action");
    const id = btn.getAttribute("data-id");
    if (action !== "delete" || !id) return;

    if (matBusy) return;
    const ok = window.confirm("¿Eliminar este material? Esta acción no se puede deshacer.");
    if (!ok) return;

    matBusy = true;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Procesando…";

    try {
      const { error } = await supabase
        .from("materials")
        .delete()
        .eq("id", id);

      if (error) {
        setMatMsg(error.message, true);
        return;
      }

      setMatMsg("Material eliminado.", false);
      await loadMaterials();
    } finally {
      btn.disabled = false;
      btn.textContent = originalText || "Eliminar";
      matBusy = false;
    }
  });

})();
