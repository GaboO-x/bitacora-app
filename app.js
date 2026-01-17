import { requireSession, getMyProfile } from "./shared.js";

(async () => {
  const { supabase, session } = await requireSession();
  if (!supabase || !session) {
    // Usa replace para evitar bucles con el botón Atrás.
    window.location.replace("./index.html?next=" + encodeURIComponent("./app.html"));
    return;
  }

  let cachedProfile = null;

  const user = session.user;

  // Logout real (con confirmación)
  const doLogout = async () => {
    const ok = confirm('Seguro que deseas salir?');
    if (!ok) return;
    try {
      // Local scope is enough for a browser app and avoids edge cases with stale cached session.
      await supabase.auth.signOut({ scope: 'local' });
    } catch {}
    // Marca explícita para que index NO auto-redirija por sesión (y evita volver a app con Atrás).
    window.location.replace("./index.html?loggedout=1");
  };

  const btnLogoutTop = document.querySelector('#btnLogout');
  btnLogoutTop?.addEventListener('click', doLogout);

  const btnLogoutSide = document.querySelector('#btnLogoutSide');
  btnLogoutSide?.addEventListener('click', doLogout);

  // Boton Atras
const btnBack = document.querySelector('#btnBack');
btnBack?.addEventListener('click', () => {
  goBack();
});

  // --- UI original (sin cambios de comportamiento visual / navegación)
  (() => {
    const qs = (sel, el=document) => el.querySelector(sel);
    const qsa = (sel, el=document) => Array.from(el.querySelectorAll(sel));

    const state = {
      view: 'home',
      selectedWeek: null,
      dcOpen: false,
      dcDirty: false,
      dcRowCount: 2,
      history: [],
      notesOpenSheet: null,
      takersDirty: false,
      cultosDirty: false,
      lideresDirty: false,
    };

    // ---- Sidebar toggle (móvil / escritorio)
    const shell = qs('#appShell');
    const btnToggleSidebar = qs('#btnToggleSidebar');
    const isMobile = () => window.matchMedia('(max-width: 920px)').matches;

    const toggleSidebar = () => {
      if (isMobile()) {
        shell.classList.toggle('is-sidebar-open');
      } else {
        shell.classList.toggle('is-sidebar-collapsed');
      }
    };

    btnToggleSidebar?.addEventListener('click', toggleSidebar);

    // Limpia estado al cambiar de tamaño
    window.addEventListener('resize', () => {
      if (!isMobile()) shell.classList.remove('is-sidebar-open');
    });

    // Cerrar sidebar al cambiar de vista en móvil
    const closeSidebarOnMobile = () => {
      if (window.matchMedia('(max-width: 920px)').matches) {
        shell.classList.remove('is-sidebar-open');
      }
    };

    // ---- Navegación por vistas
    const setActiveNav = (view) => {
      qsa('.nav-btn').forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.view === view);
      });
    };

    const setCrumb = (text) => {
      const crumb = qs('#crumb');
      if (crumb) crumb.textContent = text;
    };

    const showView = (view) => {
      state.view = view;
      qsa('.view').forEach(v => v.classList.remove('is-visible'));
      const section = qs(`#view-${view}`);
      section?.classList.add('is-visible');

      setActiveNav(view);
      setCrumb(viewLabel(view));
      closeSidebarOnMobile();

      if (view === 'calendario') {
        // Carga/refresh del calendario al entrar en la vista
        loadCalendar();
      }

      if (view === 'anuncios') {
        loadAnnouncements();
      }

      if (view === 'material') {
        loadMaterials();
      }
    };

    const NOTES_DRAFT_KEY = 'bitacora_notes_drafts_v1';

    const readDrafts = () => {
      try { return JSON.parse(localStorage.getItem(NOTES_DRAFT_KEY) || '{}'); }
      catch { return {}; }
    };

    const writeDrafts = (obj) => {
      try { localStorage.setItem(NOTES_DRAFT_KEY, JSON.stringify(obj)); } catch {}
    };

    const getWeekDraft = (week) => {
      const all = readDrafts();
      return all[String(week)] || {};
    };

    const setWeekDraft = (week, patch) => {
      const all = readDrafts();
      const k = String(week);
      all[k] = { ...(all[k] || {}), ...(patch || {}) };
      writeDrafts(all);
    };


    // --- Supabase persistence for Notas (notes table)
    // Keeps local drafts as fallback, but the source of truth becomes Supabase.
    const NOTES_DB_SHEETS = new Set(['dc','takers','cultos','lideres']);

    const getMyUserId = () => {
      try { return user && user.id ? user.id : null; } catch { return null; }
    };

    const loadNoteRow = async (week, sheet) => {
      const uid = getMyUserId();
      if (!uid || !week || !sheet || !NOTES_DB_SHEETS.has(sheet)) return null;
      const { data, error } = await supabase
        .from('notes')
        .select('id, user_id, week, sheet, week_done, data, updated_at')
        .eq('user_id', uid)
        .eq('week', week)
        .eq('sheet', sheet)
        .maybeSingle();
      if (error) return null;
      return data || null;
    };

    const saveNoteRow = async (week, sheet, payloadData) => {
      const uid = getMyUserId();
      if (!uid || !week || !sheet || !NOTES_DB_SHEETS.has(sheet)) return { ok: false };

      const row = {
        user_id: uid,
        week,
        sheet,
        // semana completada se mantiene en localStorage por ahora
        week_done: false,
        data: payloadData || {},
      };

      const { error } = await supabase
        .from('notes')
        .upsert(row, { onConflict: 'user_id,week,sheet' });

      return { ok: !error, error };
    };

    const setStatus = (statusEl, msg) => {
      if (!statusEl) return;
      statusEl.textContent = msg || '';
    };

    const nowLabel = () => {
      try { return new Date().toLocaleString(); } catch { return ''; }
    };

    const collectDcDraft = () => {
      if (!notesSheetScreen) return null;
      const blocks = qsa('.dc-item', notesSheetScreen).map(item => {
        const inputs = qsa('input', item);
        const t = inputs[0].value || '';
        const r = inputs[1].value || '';
        return { t, r };
      });

      const asistieron = qs('#dcAsistieron')?.value || '';
      const faltaron = qs('#dcFaltaron')?.value || '';
      const nuevos = qs('#dcNuevos')?.value || '';

      const follow = qsa('tr', dcFollowBody || document).map(tr => {
        const name = qs('td:nth-child(1) input', tr)?.value || '';
        const enc = qs('td:nth-child(2) input', tr)?.value || '';
        const yes = qs('input[type="radio"][value="si"]', tr);
        const no = qs('input[type="radio"][value="no"]', tr);
        const just = (yes && yes.checked) ? 'si' : ((no && no.checked) ? 'no' : '');
        const date = qs('td:nth-child(4) input[type="date"]', tr)?.value || '';
        return { name, enc, just, date };
      });

      return {
        date: dcDate?.value || '',
        blocks,
        asistencia: { asistieron, faltaron, nuevos },
        follow,
        notes: dcNotes?.value || '',
      };
    };

    const applyDcDraft = (draft) => {
      if (!draft || !notesSheetScreen) return;
      if (dcDate && draft.date) dcDate.value = draft.date;
      if (dcNotes && typeof draft.notes === 'string') dcNotes.value = draft.notes;

      const a = draft.asistencia || {};
      const dcAsistieron = qs('#dcAsistieron');
      const dcFaltaron = qs('#dcFaltaron');
      const dcNuevos = qs('#dcNuevos');
      if (dcAsistieron && a.asistieron != null) dcAsistieron.value = a.asistieron;
      if (dcFaltaron && a.faltaron != null) dcFaltaron.value = a.faltaron;
      if (dcNuevos && a.nuevos != null) dcNuevos.value = a.nuevos;

      const items = qsa('.dc-item', notesSheetScreen);
      (draft.blocks || []).forEach((b, i) => {
        const item = items[i];
        if (!item) return;
        const inputs = qsa('input', item);
        if (inputs[0] && b.t != null) inputs[0].value = b.t;
        if (inputs[1] && b.r != null) inputs[1].value = b.r;
      });

      if (dcFollowBody && Array.isArray(draft.follow)) {
        const rows = qsa('tr', dcFollowBody);
        draft.follow.forEach((row, i) => {
          const tr = rows[i];
          if (!tr) return;
          const name = qs('td:nth-child(1) input', tr);
          const enc = qs('td:nth-child(2) input', tr);
          const yes = qs('input[type="radio"][value="si"]', tr);
          const no = qs('input[type="radio"][value="no"]', tr);
          const date = qs('td:nth-child(4) input[type="date"]', tr);
          if (name && row.name != null) name.value = row.name;
          if (enc && row.enc != null) enc.value = row.enc;
          if (yes && no) {
            yes.checked = row.just == 'si';
            no.checked = row.just == 'no';
          }
          if (date && row.date != null) date.value = row.date;
        });
      }
    };

    const collectRteDraft = (temaEl, dateEl, editorEl) => ({
      tema: temaEl?.value || '',
      date: dateEl?.value || '',
      html: editorEl?.innerHTML || '',
    });

    const applyRteDraft = (draft, temaEl, dateEl, editorEl) => {
      if (!draft) return;
      if (temaEl && draft.tema != null) temaEl.value = draft.tema;
      if (dateEl && draft.date != null) dateEl.value = draft.date;
      if (editorEl && typeof draft.html === 'string' && draft.html.length) editorEl.innerHTML = draft.html;
    };

    const autosaveNotesIfNeeded = () => {
      if (!state.selectedWeek) return;

      if (state.notesOpenSheet === 'dc' && state.dcDirty) {
        const d = collectDcDraft();
        if (d) setWeekDraft(state.selectedWeek, { dc: d });
          // Persist to Supabase (fire-and-forget)
          if (d) saveNoteRow(state.selectedWeek, 'dc', d).then(r => {
            if (r && r.ok) setStatus(dcStatus, `Guardado automáticamente: ${nowLabel()} (Supabase)`);
          }).catch(() => {});
        state.dcDirty = false;
        setStatus(dcStatus, `Guardado automáticamente: ${nowLabel()} (local)`);
        return;
      }

      if (state.notesOpenSheet === 'takers' && state.takersDirty) {
        const payload = collectRteDraft(takersTema, takersDate, takersNotes);
          setWeekDraft(state.selectedWeek, { takers: payload });
          // Persist to Supabase (fire-and-forget)
          saveNoteRow(state.selectedWeek, 'takers', payload).then(r => {
            if (r && r.ok) setStatus(takersStatus, `Guardado automáticamente: ${nowLabel()} (Supabase)`);
          }).catch(() => {});
        state.takersDirty = false;
        setStatus(takersStatus, `Guardado automáticamente: ${nowLabel()} (local)`);
        return;
      }

      if (state.notesOpenSheet === 'cultos' && state.cultosDirty) {
        const payload = collectRteDraft(cultosTema, cultosDate, cultosNotes);
          setWeekDraft(state.selectedWeek, { cultos: payload });
          // Persist to Supabase (fire-and-forget)
          saveNoteRow(state.selectedWeek, 'cultos', payload).then(r => {
            if (r && r.ok) setStatus(cultosStatus, `Guardado automáticamente: ${nowLabel()} (Supabase)`);
          }).catch(() => {});
        state.cultosDirty = false;
        setStatus(cultosStatus, `Guardado automáticamente: ${nowLabel()} (local)`);
        return;
      }

      if (state.notesOpenSheet === 'lideres' && state.lideresDirty) {
        const payload = collectRteDraft(lideresTema, lideresDate, lideresNotes);
          setWeekDraft(state.selectedWeek, { lideres: payload });
          // Persist to Supabase (fire-and-forget)
          saveNoteRow(state.selectedWeek, 'lideres', payload).then(r => {
            if (r && r.ok) setStatus(lideresStatus, `Guardado automáticamente: ${nowLabel()} (Supabase)`);
          }).catch(() => {});
        state.lideresDirty = false;
        setStatus(lideresStatus, `Guardado automáticamente: ${nowLabel()} (local)`);
        return;
      }
    };

    const confirmLeaveDcSheet = () => {
      // Ahora: auto-guardado implícito (sin confirmación)
      autosaveNotesIfNeeded();
      return true;
    };


    const navigate = (view, opts = {}) => {
      if (!confirmLeaveDcSheet()) return;
      const { push = true } = opts;
      if (push && state.view && state.view !== view) {
        state.history.push(state.view);
      }
      showView(view);
    };

    const goBack = () => {
      if (!confirmLeaveDcSheet()) return;
      const prev = state.history.pop();
      if (prev) showView(prev);
      else showView('home');
    };


    const viewLabel = (view) => {
      switch(view){
        case 'home': return 'Inicio';
        case 'notas': return 'Notas';
        case 'calendario': return 'Calendario';
        case 'anuncios': return 'Anuncios';
        case 'material': return 'Material de apoyo';
        case 'misdoce': return 'Mis Doce';
        default: return view;
      }
    };

    qsa('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => navigate(btn.dataset.view));
    });
    // ---- Accesos directos (cards en Inicio)
    qsa('.card--action[data-view]').forEach(card => {
      card.addEventListener('click', () => navigate(card.dataset.view));
    });

    // ---- Botones globales dentro de cada sección
    document.addEventListener('click', (e) => {
      const goHome = e.target.closest('[data-go="home"]');
      if (goHome) {
        e.preventDefault();
        navigate('home');
        return;
      }
      const goBackBtn = e.target.closest('[data-go="back"]');
      if (goBackBtn) {
        e.preventDefault();
        goBack();
        return;
      }
    });


    // ---- Calendario (tabla tipo “Excel”) - Supabase calendar_activities
    const calendarContainer = qs('#calendarContainer');
    const calendarStatus = qs('#calendarStatus');
    const btnCalNew = qs('#btnCalNew');

    const normalizeProfile = (p) => {
      if (!p) return null;
      if (p.data && typeof p.data === 'object') return p.data;
      if (p.profile && typeof p.profile === 'object') return p.profile;
      return p;
    };

    const getRole = async () => {
      if (!cachedProfile) {
        try {
          cachedProfile = normalizeProfile(await getMyProfile(supabase));
        } catch {
          cachedProfile = null;
        }
      }
      return (cachedProfile && cachedProfile.role) ? String(cachedProfile.role) : 'user';
    };

    const escapeHtml = (s) => {
      const str = (s == null) ? '' : String(s);
      return str
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    };


    // ---- Anuncios (tabla announcements + Storage bucket announcements)
    const announcementsList = qs('#announcementsList');

    const renderAnnouncements = (rows) => {
      if (!announcementsList) return;
      const data = Array.isArray(rows) ? rows : [];
      if (!data.length) {
        announcementsList.innerHTML = '<div class="muted">No hay anuncios.</div>';
        return;
      }

      announcementsList.innerHTML = data.map(r => {
        const title = escapeHtml(r.title || 'Anuncio');
        const url = r.image_url || '';
        const safeUrl = escapeHtml(url);

        const img = url
          ? (
            '<a href="' + safeUrl + '" target="_blank" rel="noopener" style="text-decoration:none;display:block;">'
              + '<img src="' + safeUrl + '" alt="' + title + '" '
                + 'style="max-width:100%;border-radius:12px;border:1px solid rgba(255,255,255,0.12);cursor:pointer;"/>'
            + '</a>'
          )
          : '<div class="muted">(sin imagen)</div>';

        const actions = url
          ? (
            '<div style="display:flex;gap:10px;align-items:center;">'
              + '<a class="pill" href="' + safeUrl + '" download title="Descargar" aria-label="Descargar" '
                + 'style="text-decoration:none;min-width:44px;text-align:center;">⬇️</a>'
              + '<a class="pill" href="' + safeUrl + '" target="_blank" rel="noopener" title="Abrir" aria-label="Abrir" '
                + 'style="text-decoration:none;min-width:44px;text-align:center;">🔍</a>'
            + '</div>'
          )
          : '';

        return (
          '<div style="border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:12px;display:grid;gap:10px;">'
            + '<div style="display:flex;gap:10px;justify-content:space-between;align-items:center;flex-wrap:wrap;">'
              + '<div style="min-width:0;font-weight:800;">' + title + '</div>'
              + actions
            + '</div>'
            + img
          + '</div>'
        );
      }).join('');
    };

    const loadAnnouncements = async () => {
      if (!announcementsList) return;
      announcementsList.textContent = 'Cargando…';

      const { data, error } = await supabase
        .from('announcements')
        .select('id, title, image_url, created_at')
        .order('created_at', { ascending: false });

      if (error) {
        announcementsList.innerHTML = '<div class="msg err">' + escapeHtml(error.message) + '</div>';
        return;
      }

      renderAnnouncements(data);
    };


    // ---- Material de apoyo (tabla materials + Storage bucket materials)
    const supportGrid = qs('#supportGrid');

    const renderMaterials = (rows) => {
      if (!supportGrid) return;
      const data = Array.isArray(rows) ? rows : [];
      if (!data.length) {
        supportGrid.innerHTML = '<div class="muted">No hay material de apoyo.</div>';
        return;
      }

      supportGrid.innerHTML = data.map(r => {
        const title = escapeHtml(r.title || 'Material');
        const url = r.image_url || '';
        const safeUrl = escapeHtml(url);

        const img = url
          ? (
            '<a href="' + safeUrl + '" target="_blank" rel="noopener" style="text-decoration:none;display:block;">'
              + '<img src="' + safeUrl + '" alt="' + title + '" '
                + 'style="width:100%;border-radius:12px;border:1px solid rgba(255,255,255,0.12);cursor:pointer;"/>'
            + '</a>'
          )
          : '<div class="muted">(sin imagen)</div>';

        const actions = url
          ? (
            '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">'
              + '<a class="pill" href="' + safeUrl + '" download title="Descargar" aria-label="Descargar" '
                + 'style="text-decoration:none;min-width:44px;text-align:center;">⬇️</a>'
              + '<a class="pill" href="' + safeUrl + '" target="_blank" rel="noopener" title="Abrir" aria-label="Abrir" '
                + 'style="text-decoration:none;min-width:44px;text-align:center;">🔍</a>'
            + '</div>'
          )
          : '';

        return (
          '<div style="border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:12px;display:grid;gap:10px;">'
            + '<div style="font-weight:800;">' + title + '</div>'
            + img
            + actions
          + '</div>'
        );
      }).join('');
    };

    const loadMaterials = async () => {
      if (!supportGrid) return;
      supportGrid.textContent = 'Cargando…';

      const { data, error } = await supabase
        .from('materials')
        .select('id, title, image_url, created_at')
        .order('created_at', { ascending: false });

      if (error) {
        supportGrid.innerHTML = '<div class="msg err">' + escapeHtml(error.message) + '</div>';
        return;
      }

      renderMaterials(data);
    };

    const fmtInvestment = (v) => {
      if (v == null || v === '') return '';
      const n = Number(v);
      if (Number.isNaN(n)) return String(v);
      return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const readActivityFromPrompts = (seed = {}) => {
      const activity = prompt('Actividad:', seed.activity || '');
      if (activity === null) return null;

      const event_date = prompt('Fecha (YYYY-MM-DD):', seed.event_date || '');
      if (event_date === null) return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(event_date.trim())) {
        alert('Fecha inválida. Usa el formato YYYY-MM-DD.');
        return null;
      }

      const owner_name = prompt('Encargado:', seed.owner_name || '');
      if (owner_name === null) return null;

      const contact_phone = prompt('#Contacto:', seed.contact_phone || '');
      if (contact_phone === null) return null;

      const invRaw = prompt('Inversión (número):', (seed.investment ?? '') === '' ? '' : String(seed.investment));
      if (invRaw === null) return null;
      const investment = invRaw.trim() === '' ? null : Number(invRaw);
      if (investment !== null && Number.isNaN(investment)) {
        alert('Inversión inválida. Debe ser un número (o dejar vacío).');
        return null;
      }

      return {
        activity: activity.trim(),
        event_date: event_date.trim(),
        owner_name: owner_name.trim(),
        contact_phone: contact_phone.trim(),
        investment,
      };
    };

    const renderCalendarTable = (rows, isAdmin) => {
      if (!calendarContainer) return;

      const headCells = [
        '<th>Actividad</th>',
        '<th>Fecha</th>',
        '<th>Encargado</th>',
        '<th>#Contacto</th>',
        '<th>Inversión</th>',
      ];
      if (isAdmin) headCells.append('<th class="cal-actions">Acciones</th>');

      const body = (rows || []).map(r => {
        const cells = [
          `<td>${escapeHtml(r.activity)}</td>`,
          `<td>${escapeHtml(r.event_date)}</td>`,
          `<td>${escapeHtml(r.owner_name)}</td>`,
          `<td>${escapeHtml(r.contact_phone)}</td>`,
          `<td>${escapeHtml(fmtInvestment(r.investment))}</td>`,
        ];
        if (isAdmin) {
          cells.append(
            `<td class="cal-actions">` +
              `<button class="pill" data-cal-action="edit" data-id="${escapeHtml(r.id)}" type="button">Editar</button> ` +
              `<button class="pill danger" data-cal-action="delete" data-id="${escapeHtml(r.id)}" type="button">Eliminar</button>` +
            `</td>`
          );
        }
        return `<tr>${cells.join('')}</tr>`;
      }).join('');

      calendarContainer.innerHTML = `
        <table class="table cal-table" id="calendarTable">
          <thead><tr>${headCells.join('')}</tr></thead>
          <tbody id="calendarBody">${body || ''}</tbody>
        </table>
      `;
    };

    const loadCalendar = async () => {
      if (!calendarContainer) return;

      setStatus(calendarStatus, 'Cargando…');

      const role = await getRole();
      const isAdmin = role === 'admin';

      if (btnCalNew) btnCalNew.style.display = isAdmin ? '' : 'none';

      const { data, error } = await supabase
        .from('calendar_activities')
        .select('*')
        .order('event_date', { ascending: true });

      if (error) {
        setStatus(calendarStatus, 'Error cargando calendario.');
        calendarContainer.textContent = 'No se pudo cargar.';
        return;
      }

      renderCalendarTable(data || [], isAdmin);
      setStatus(calendarStatus, `Registros: ${(data || []).length}`);
    };

    const createCalendarActivity = async () => {
      const role = await getRole();
      if (role !== 'admin') return;

      const payload = readActivityFromPrompts({});
      if (!payload) return;

      setStatus(calendarStatus, 'Guardando…');

      const { error } = await supabase
        .from('calendar_activities')
        .insert({ ...payload, created_by: user.id });

      if (error) {
        setStatus(calendarStatus, 'Error al guardar.');
        alert('No se pudo crear la actividad.');
        return;
      }

      await loadCalendar();
      setStatus(calendarStatus, 'Actividad creada.');
    };

    const editCalendarActivity = async (id) => {
      const role = await getRole();
      if (role !== 'admin') return;

      const { data, error } = await supabase
        .from('calendar_activities')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error || !data) {
        alert('No se pudo cargar la actividad.');
        return;
      }

      const payload = readActivityFromPrompts(data);
      if (!payload) return;

      setStatus(calendarStatus, 'Actualizando…');

      const upd = await supabase
        .from('calendar_activities')
        .update(payload)
        .eq('id', id);

      if (upd.error) {
        setStatus(calendarStatus, 'Error al actualizar.');
        alert('No se pudo actualizar la actividad.');
        return;
      }

      await loadCalendar();
      setStatus(calendarStatus, 'Actividad actualizada.');
    };

    const deleteCalendarActivity = async (id) => {
      const role = await getRole();
      if (role !== 'admin') return;

      const ok = confirm('¿Eliminar esta actividad?');
      if (!ok) return;

      setStatus(calendarStatus, 'Eliminando…');

      const del = await supabase
        .from('calendar_activities')
        .delete()
        .eq('id', id);

      if (del.error) {
        setStatus(calendarStatus, 'Error al eliminar.');
        alert('No se pudo eliminar la actividad.');
        return;
      }

      await loadCalendar();
      setStatus(calendarStatus, 'Actividad eliminada.');
    };

    btnCalNew?.addEventListener('click', (e) => {
      e.preventDefault();
      createCalendarActivity();
    });

    calendarContainer?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cal-action]');
      if (!btn) return;
      e.preventDefault();
      const action = btn.getAttribute('data-cal-action');
      const id = btn.getAttribute('data-id');
      if (!id) return;
      if (action === 'edit') editCalendarActivity(id);
      if (action === 'delete') deleteCalendarActivity(id);
    });


    // ---- Notas: mini calendario de 52 semanas (solo) + pantalla de semana con botones + semana completada
    const weeksGrid = qs('#weeksGrid');
    const weekTitle = qs('#weekTitle');
    const notesMeta = qs('#notesMeta');
    const notesHint = qs('#notesHint');

    const notesWeekPicker = qs('#notesWeekPicker');
    const notesWeekScreen = qs('#notesWeekScreen');
    const notesSheetScreen = qs('#notesSheetScreen');
    const notesSheetTakers = qs('#notesSheetTakers');
    const notesSheetCultos = qs('#notesSheetCultos');
    const notesSheetLideres = qs('#notesSheetLideres');
    const takersSheetTitle = qs('#takersSheetTitle');
    const cultosSheetTitle = qs('#cultosSheetTitle');
    const lideresSheetTitle = qs('#lideresSheetTitle');
    const takersNotes = qs('#takersNotes');
    const cultosNotes = qs('#cultosNotes');
    const lideresNotes = qs('#lideresNotes');
    const takersTema = qs('#takersTema');
    const cultosTema = qs('#cultosTema');
    const lideresTema = qs('#lideresTema');
    const takersDate = qs('#takersDate');
    const cultosDate = qs('#cultosDate');
    const lideresDate = qs('#lideresDate');
    const takersStatus = qs('#takersStatus');
    const cultosStatus = qs('#cultosStatus');
    const lideresStatus = qs('#lideresStatus');
    const btnTakersBack = qs('#btnTakersBack');
    const btnCultosBack = qs('#btnCultosBack');
    const btnLideresBack = qs('#btnLideresBack');
    const btnTakersShare = qs('#btnTakersShare');
    const btnCultosShare = qs('#btnCultosShare');
    const btnLideresShare = qs('#btnLideresShare');
    const dcSheetTitle = qs('#dcSheetTitle');
    const dcDate = qs('#dcDate');
    const btnDcBack = qs('#btnDcBack');
    const btnDcRowAdd = qs('#btnDcRowAdd');
    const btnDcRowRemove = qs('#btnDcRowRemove');
    const dcFollowBody = qs('#dcFollowBody');
    const dcNotes = qs('#dcNotes');
    const dcStatus = qs('#dcStatus');
    const btnBackToWeeks = qs('#btnBackToWeeks');

    const chkWeekDone = qs('#chkWeekDone');

    const btnNoteDinamica = qs('#btnNoteDinamica');
    const btnNoteTakers = qs('#btnNoteTakers');
    const btnNoteCultos = qs('#btnNoteCultos');
    const btnNoteLideres = qs('#btnNoteLideres');

    const STORAGE_KEY = 'bitacora_week_completed_v1';
    const completed = (() => {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
      catch { return {}; }
    })();

    const saveCompleted = () => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(completed)); } catch {}
    };

    const setWeekScreenVisible = (visible) => {
      notesWeekPicker.classList.toggle('is-hidden', visible);
      notesWeekScreen.classList.toggle('is-hidden', !visible);
      if (notesSheetScreen) notesSheetScreen.classList.add('is-hidden');
      state.dcOpen = false;
      state.notesOpenSheet = null;
	      // Si el elemento fue fijado (p.ej. convertido a botón "Inicio"), no sobrescribimos su texto.
	      if (notesHint && !notesHint.dataset.fixed) {
	        notesHint.textContent = visible ? 'Semana seleccionada: elige una actividad.' : 'Selecciona la semana.';
	      }
    };

    const hideAllNoteSheets = () => {
      notesSheetScreen?.classList.add('is-hidden');
      notesSheetTakers?.classList.add('is-hidden');
      notesSheetCultos?.classList.add('is-hidden');
      notesSheetLideres?.classList.add('is-hidden');
      state.notesOpenSheet = null;
    };

    const showNoteSheet = (sheetEl) => {
      if (!sheetEl) return;
      notesWeekPicker?.classList.add('is-hidden');
      notesWeekScreen?.classList.add('is-hidden');
      hideAllNoteSheets();
      sheetEl.classList.remove('is-hidden');

      // tracking de hoja abierta
      if (sheetEl === notesSheetScreen) state.notesOpenSheet = 'dc';
      else if (sheetEl === notesSheetTakers) state.notesOpenSheet = 'takers';
      else if (sheetEl === notesSheetCultos) state.notesOpenSheet = 'cultos';
      else if (sheetEl === notesSheetLideres) state.notesOpenSheet = 'lideres';
      else state.notesOpenSheet = null;
    };

    const setSheetVisible = (visible) => {
      // Compat: mantiene la hoja de Dinámica Celular
      if (visible) {
        showNoteSheet(notesSheetScreen);
        state.dcOpen = true;
      } else {
        hideAllNoteSheets();
        notesWeekPicker?.classList.add('is-hidden');
        notesWeekScreen?.classList.remove('is-hidden');
        state.dcOpen = false;
        if (dcStatus) dcStatus.textContent = '';
      }
    };

    const markWeekTile = (weekNum) => {
      const tile = qs(`.week[data-week="${weekNum}"]`, weeksGrid);
      if (!tile) return;
      tile.classList.toggle('is-done', !!completed[String(weekNum)]);
    };

    const updateMeta = () => {
      if (!state.selectedWeek) { notesMeta.textContent = ''; return; }
      const done = !!completed[String(state.selectedWeek)];
      notesMeta.textContent = done ? `Semana ${state.selectedWeek} • Completada` : `Semana ${state.selectedWeek}`;
    };

    const populateWeeks = () => {
      if (!weeksGrid) return;
      weeksGrid.innerHTML = '';
      for (let i=1; i<=52; i++){
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'week';
        b.textContent = `Sem ${i}`;
        b.dataset.week = String(i);
        b.addEventListener('click', () => selectWeek(i));
        weeksGrid.appendChild(b);
        markWeekTile(i);
      }
    };

    const selectWeek = (weekNum) => {
      state.selectedWeek = weekNum;

      qsa('.week', weeksGrid).forEach(w => w.classList.toggle('is-selected', Number(w.dataset.week) === weekNum));
      weekTitle.textContent = `Semana ${weekNum}`;

      // Checkbox refleja estado de la semana
      if (chkWeekDone) chkWeekDone.checked = !!completed[String(weekNum)];

      // Mostrar pantalla de semana
      setWeekScreenVisible(true);
      updateMeta();
    };


    // Volver del detalle de semana al selector
    btnBackToWeeks?.addEventListener('click', () => {
      if (!confirmLeaveDcSheet()) return;
      // quitar selección visual
      qsa('.week', weeksGrid).forEach(w => w.classList.remove('is-selected'));
      state.selectedWeek = null;
      if (chkWeekDone) chkWeekDone.checked = false;
      setWeekScreenVisible(false);
      updateMeta();
    });

    // Marcar semana como completada (solo UI; se mantiene en localStorage)
    chkWeekDone?.addEventListener('change', () => {
      if (!state.selectedWeek) return;
      completed[String(state.selectedWeek)] = !!chkWeekDone.checked;
      saveCompleted();
      markWeekTile(state.selectedWeek);
      updateMeta();
    });

  const todayISO = () => new Date().toISOString().slice(0, 10);

    const setDateIfEmpty = (dateEl) => {
      if (!dateEl) return;
      if (!dateEl.value) dateEl.value = todayISO();
    };

    const setDcDirty = (dirty = true) => {
      if (!state.dcOpen) return;
      state.dcDirty = dirty;
      if (dcStatus) dcStatus.textContent = dirty ? 'Cambios sin guardar.' : '';
    };

    // Marcar cambios (placeholder de auto-guardado)
    const setTakersDirty = (dirty = true) => { state.takersDirty = dirty; if (takersStatus) takersStatus.textContent = dirty ? 'Cambios sin guardar.' : ''; };
    const setCultosDirty = (dirty = true) => { state.cultosDirty = dirty; if (cultosStatus) cultosStatus.textContent = dirty ? 'Cambios sin guardar.' : ''; };
    const setLideresDirty = (dirty = true) => { state.lideresDirty = dirty; if (lideresStatus) lideresStatus.textContent = dirty ? 'Cambios sin guardar.' : ''; };

    notesSheetScreen?.addEventListener('input', () => setDcDirty(true));
    notesSheetScreen?.addEventListener('change', () => setDcDirty(true));

    notesSheetTakers?.addEventListener('input', () => setTakersDirty(true));
    notesSheetTakers?.addEventListener('change', () => setTakersDirty(true));
    notesSheetCultos?.addEventListener('input', () => setCultosDirty(true));
    notesSheetCultos?.addEventListener('change', () => setCultosDirty(true));
    notesSheetLideres?.addEventListener('input', () => setLideresDirty(true));
    notesSheetLideres?.addEventListener('change', () => setLideresDirty(true));

    const initDcDefaults = () => {
      const t = todayISO();
      if (dcDate && !dcDate.value) dcDate.value = t;
      qsa('input[type="date"]', notesSheetScreen || document).forEach(el => {
        if (!el.value) el.value = t;
      });
    };

    const rebuildJustNames = () => {
      if (!dcFollowBody) return;
      const rows = qsa('tr', dcFollowBody);
      rows.forEach((tr, idx) => {
        const n = idx + 1;
        qsa('input[type="radio"]', tr).forEach(r => { r.name = `dcJust${n}`; });
      });
      state.dcRowCount = rows.length;
    };

    const makeFollowRow = (n) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input class="input" type="text" placeholder="Nombre"/></td>
        <td><input class="input" type="text" placeholder="Encargado"/></td>
        <td class="dc-table__just">
          <label class="dc-just"><input name="dcJust${n}" type="radio" value="si"/> Sí</label>
          <label class="dc-just"><input name="dcJust${n}" type="radio" value="no"/> No</label>
        </td>
        <td class="dc-table__date"><input class="input" type="date"/></td>
      `;
      // fecha por defecto
      const d = qs('input[type="date"]', tr);
      if (d) d.value = todayISO();
      return tr;
    };

    btnDcRowAdd?.addEventListener('click', () => {
      if (!dcFollowBody) return;
      const n = (qsa('tr', dcFollowBody).length || 0) + 1;
      dcFollowBody.appendChild(makeFollowRow(n));
      rebuildJustNames();
      setDcDirty(true);
    });

    btnDcRowRemove?.addEventListener('click', () => {
      if (!dcFollowBody) return;
      const rows = qsa('tr', dcFollowBody);
      if (rows.length <= 1) return;
      rows[rows.length - 1].remove();
      rebuildJustNames();
      setDcDirty(true);
    });

    const openDinamicaCelular = () => {
      if (!state.selectedWeek) {
        alert('Primero selecciona una semana.');
        return;
      }
      if (dcSheetTitle) dcSheetTitle.textContent = `Dinámica Celular • Semana ${state.selectedWeek}`;
      if (dcStatus) dcStatus.textContent = '';

      // Cargar desde Supabase (si existe), fallback a borrador local
      loadNoteRow(state.selectedWeek, 'dc').then(row => {
        const db = row && row.data ? row.data : null;
        const draftLocal = getWeekDraft(state.selectedWeek).dc;
        const draft = db || draftLocal;
        setSheetVisible(true);
        if (draft) applyDcDraft(draft);
        else {
          if (dcDate && !dcDate.value) dcDate.value = todayISO();
          initDcDefaults();
        }
        rebuildJustNames();
      }).catch(() => {
        const draft = getWeekDraft(state.selectedWeek).dc;
        setSheetVisible(true);
        if (draft) applyDcDraft(draft);
        else {
          if (dcDate && !dcDate.value) dcDate.value = todayISO();
          initDcDefaults();
        }
        rebuildJustNames();
      });

      return;
    };

    btnDcBack?.addEventListener('click', () => {
      if (!confirmLeaveDcSheet()) return;
      setWeekScreenVisible(true);
    });

    // Back/Guardar para hojas de Semana (Takers/Cultos/Líderes)
    qs('#btnTakersBack')?.addEventListener('click', () => { autosaveNotesIfNeeded(); hideAllNoteSheets(); setWeekScreenVisible(true); });
    qs('#btnCultosBack')?.addEventListener('click', () => { autosaveNotesIfNeeded(); hideAllNoteSheets(); setWeekScreenVisible(true); });
    qs('#btnLideresBack')?.addEventListener('click', () => { autosaveNotesIfNeeded(); hideAllNoteSheets(); setWeekScreenVisible(true); });

    const markSaved = (statusEl) => {
      if (!statusEl) return;
      const t = new Date().toLocaleString();
      statusEl.textContent = `Guardado local: ${t} (pendiente Supabase)`;
    };

    const openTakersSheet = () => {
      if (!state.selectedWeek) { alert('Primero selecciona una semana.'); return; }
      takersSheetTitle && (takersSheetTitle.textContent = `Takers • Semana ${state.selectedWeek}`);
      takersStatus && (takersStatus.textContent = '');
      setDateIfEmpty(takersDate);

      // Cargar desde Supabase (si existe), fallback a borrador local
      loadNoteRow(state.selectedWeek, 'takers').then(row => {
        const db = row && row.data ? row.data : null;
        const draftLocal = getWeekDraft(state.selectedWeek).takers;
        const draft = db || draftLocal;
        if (draft) applyRteDraft(draft, takersTema, takersDate, takersNotes);
      }).catch(() => {
        const draftLocal = getWeekDraft(state.selectedWeek).takers;
        if (draftLocal) applyRteDraft(draftLocal, takersTema, takersDate, takersNotes);
      });
      showNoteSheet(notesSheetTakers);
    };

    const openCultosSheet = () => {
      if (!state.selectedWeek) { alert('Primero selecciona una semana.'); return; }
      cultosSheetTitle && (cultosSheetTitle.textContent = `Cultos • Semana ${state.selectedWeek}`);
      cultosStatus && (cultosStatus.textContent = '');
      setDateIfEmpty(cultosDate);

      // Cargar desde Supabase (si existe), fallback a borrador local
      loadNoteRow(state.selectedWeek, 'cultos').then(row => {
        const db = row && row.data ? row.data : null;
        const draftLocal = getWeekDraft(state.selectedWeek).cultos;
        const draft = db || draftLocal;
        if (draft) applyRteDraft(draft, cultosTema, cultosDate, cultosNotes);
      }).catch(() => {
        const draftLocal = getWeekDraft(state.selectedWeek).cultos;
        if (draftLocal) applyRteDraft(draftLocal, cultosTema, cultosDate, cultosNotes);
      });
      showNoteSheet(notesSheetCultos);
    };

    const openLideresSheet = () => {
      if (!state.selectedWeek) { alert('Primero selecciona una semana.'); return; }
      lideresSheetTitle && (lideresSheetTitle.textContent = `Reunión de Líderes/Ministerios • Semana ${state.selectedWeek}`);
      lideresStatus && (lideresStatus.textContent = '');
      setDateIfEmpty(lideresDate);

      // Cargar desde Supabase (si existe), fallback a borrador local
      loadNoteRow(state.selectedWeek, 'lideres').then(row => {
        const db = row && row.data ? row.data : null;
        const draftLocal = getWeekDraft(state.selectedWeek).lideres;
        const draft = db || draftLocal;
        if (draft) applyRteDraft(draft, lideresTema, lideresDate, lideresNotes);
      }).catch(() => {
        const draftLocal = getWeekDraft(state.selectedWeek).lideres;
        if (draftLocal) applyRteDraft(draftLocal, lideresTema, lideresDate, lideresNotes);
      });
      showNoteSheet(notesSheetLideres);
    };

    

    const shareText = async (text) => {
      const payload = { text };
      try {
        if (navigator.share) {
          await navigator.share(payload);
          return;
        }
      } catch {}
      try {
        await navigator.clipboard.writeText(text);
        alert('Contenido copiado al portapapeles.');
      } catch {
        alert('No se pudo compartir/copiar automáticamente en este navegador.');
      }
    };

    const buildShare = (title, temaEl, dateEl, editorEl) => {
      const week = state.selectedWeek ? `Semana ${state.selectedWeek}` : '';
      const tema = temaEl?.value ? `Tema: ${temaEl.value}` : '';
      const fecha = dateEl?.value ? `Fecha: ${dateEl.value}` : '';
      const body = editorEl ? (editorEl.innerText || '').trim() : '';
      return [title, week, tema, fecha, "", body].filter(Boolean).join("\n");
    };

    btnTakersShare?.addEventListener('click', () => {
      const text = buildShare('Takers', takersTema, takersDate, takersNotes);
      shareText(text);
    });

    btnCultosShare?.addEventListener('click', () => {
      const text = buildShare('Cultos', cultosTema, cultosDate, cultosNotes);
      shareText(text);
    });

    btnLideresShare?.addEventListener('click', () => {
      const text = buildShare('Reunión de Líderes/Ministerios', lideresTema, lideresDate, lideresNotes);
      shareText(text);
    });

btnNoteDinamica?.addEventListener('click', openDinamicaCelular);
    btnNoteTakers?.addEventListener('click', openTakersSheet);
    btnNoteCultos?.addEventListener('click', openCultosSheet);
      btnNoteLideres?.addEventListener('click', openLideresSheet);

    // ---- Init
    populateWeeks();
    setWeekScreenVisible(false);
    showView('home');

    // ---- Editor RTE (Takers / Cultos / Reunión de Líderes)
    // Permite: Negrita, Subrayado, Color (Rojo/Verde/Amarillo), Resaltar, Limpiar formato.
    const initRTE = () => {
      document.addEventListener('click', (e) => {
        const tool = e.target.closest('.rte .tool');
        if (!tool) return;

        const rte = tool.closest('.rte');
        const editor = rte ? qs('.rte__editor', rte) : null;
        if (!editor) return;

        // Evita que un click desactive la selección
        e.preventDefault();
        editor.focus();

        try {
          document.execCommand('styleWithCSS', false, true);
        } catch {}

        const cmd = tool.dataset.cmd;
        const color = tool.dataset.color;
        const highlight = tool.dataset.highlight;
        const clear = tool.dataset.clear;

        if (cmd) {
          try { document.execCommand(cmd, false, null); } catch {}
          return;
        }
        if (color) {
          try { document.execCommand('foreColor', false, color); } catch {}
          return;
        }
        if (highlight) {
          // 'hiliteColor' funciona en la mayoría; 'backColor' como fallback
          try { document.execCommand('hiliteColor', false, highlight); }
          catch {
            try { document.execCommand('backColor', false, highlight); } catch {}
          }
          return;
        }
        if (clear) {
          try {
            document.execCommand('removeFormat', false, null);
            document.execCommand('unlink', false, null);
          } catch {}
          return;
        }
      });
    };

    initRTE();

    // ---- Mis Doce: tabla tipo excel (solo UI; persistencia luego con Supabase)
    const misDoceBody = qs('#misDoceBody');
    const btnMdAddRow = qs('#btnMdAddRow');
    const btnMdRemoveRow = qs('#btnMdRemoveRow');

    const mdFormatDdMm = (raw) => {
      const digits = String(raw || '').replace(/\D/g, '').slice(0, 4);
      if (digits.length <= 2) return digits;
      return digits.slice(0,2) + '/' + digits.slice(2);
    };

    const mdFormatPhone = (raw) => {
      const digits = String(raw || '').replace(/\D/g, '').slice(0, 8);
      if (digits.length <= 4) return digits;
      return digits.slice(0,4) + '-' + digits.slice(4);
    };

    const mdClearRow = (tr) => {
      if (!tr) return;
      qsa('input[type="text"]', tr).forEach(inp => { inp.value = ''; });
      qsa('input[type="checkbox"]', tr).forEach(chk => { chk.checked = false; });
      const sel = qs('select', tr);
      if (sel) sel.value = 'N/A';
    };

    const mdAddRow = () => {
      if (!misDoceBody) return;
      const tpl = qs('tr', misDoceBody);
      if (!tpl) return;
      const tr = tpl.cloneNode(true);
      mdClearRow(tr);
      misDoceBody.appendChild(tr);
    };

    const mdRemoveRow = () => {
      if (!misDoceBody) return;
      const rows = qsa('tr', misDoceBody);
      if (rows.length <= 1) return;
      rows[rows.length - 1].remove();
    };

    btnMdAddRow?.addEventListener('click', mdAddRow);
    btnMdRemoveRow?.addEventListener('click', mdRemoveRow);

    // Formateo en vivo (delegación)
    misDoceBody?.addEventListener('input', (e) => {
      const bday = e.target.closest('.md-bday');
      if (bday) {
        const next = mdFormatDdMm(bday.value);
        if (bday.value !== next) bday.value = next;
        return;
      }
      const phone = e.target.closest('.md-phone');
      if (phone) {
        const next = mdFormatPhone(phone.value);
        if (phone.value !== next) phone.value = next;
        return;
      }
    });

    // Defaults: tabla arranca con 4 filas (HTML). Si quedara en blanco por cambios futuros, garantiza 4.
    (() => {
      if (!misDoceBody) return;
      const rows = qsa('tr', misDoceBody);
      if (rows.length) return;
      for (let i=0; i<4; i++) mdAddRow();
    })();


  })();
})();
