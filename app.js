import { requireSession, getMyProfile } from "./shared.js";

(async () => {
  const { supabase, session } = await requireSession();
  if (!supabase || !session) {
    window.location.href = "./index.html";
    return;
  }

  let cachedProfile = null;

  const user = session.user;

  // Logout real (con confirmación)
  const doLogout = async () => {
    const ok = confirm('Seguro que deseas salir?');
    if (!ok) return;
    try {
      await supabase.auth.signOut();
    } catch {}
    window.location.href = "./index.html";
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
        state.dcDirty = false;
        setStatus(dcStatus, `Guardado automáticamente: ${nowLabel()} (local)`);
        return;
      }

      if (state.notesOpenSheet === 'takers' && state.takersDirty) {
        setWeekDraft(state.selectedWeek, { takers: collectRteDraft(takersTema, takersDate, takersNotes) });
        state.takersDirty = false;
        setStatus(takersStatus, `Guardado automáticamente: ${nowLabel()} (local)`);
        return;
      }

      if (state.notesOpenSheet === 'cultos' && state.cultosDirty) {
        setWeekDraft(state.selectedWeek, { cultos: collectRteDraft(cultosTema, cultosDate, cultosNotes) });
        state.cultosDirty = false;
        setStatus(cultosStatus, `Guardado automáticamente: ${nowLabel()} (local)`);
        return;
      }

      if (state.notesOpenSheet === 'lideres' && state.lideresDirty) {
        setWeekDraft(state.selectedWeek, { lideres: collectRteDraft(lideresTema, lideresDate, lideresNotes) });
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

      // Cargar borrador local (si existe)
      const draft = getWeekDraft(state.selectedWeek).dc;
      setSheetVisible(true);
      if (draft) {
        applyDcDraft(draft);
      } else {
        // Defaults solo si NO hay borrador
        if (dcDate && !dcDate.value) dcDate.value = todayISO();
        initDcDefaults();
      }
      rebuildJustNames();
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
      const draft = getWeekDraft(state.selectedWeek).takers;
      if (draft) applyRteDraft(draft, takersTema, takersDate, takersNotes);
      showNoteSheet(notesSheetTakers);
    };

    const openCultosSheet = () => {
      if (!state.selectedWeek) { alert('Primero selecciona una semana.'); return; }
      cultosSheetTitle && (cultosSheetTitle.textContent = `Cultos • Semana ${state.selectedWeek}`);
      cultosStatus && (cultosStatus.textContent = '');
      setDateIfEmpty(cultosDate);
      const draft = getWeekDraft(state.selectedWeek).cultos;
      if (draft) applyRteDraft(draft, cultosTema, cultosDate, cultosNotes);
      showNoteSheet(notesSheetCultos);
    };

    const openLideresSheet = () => {
      if (!state.selectedWeek) { alert('Primero selecciona una semana.'); return; }
      lideresSheetTitle && (lideresSheetTitle.textContent = `Reunión de Líderes/Ministerios • Semana ${state.selectedWeek}`);
      lideresStatus && (lideresStatus.textContent = '');
      setDateIfEmpty(lideresDate);
      const draft = getWeekDraft(state.selectedWeek).lideres;
      if (draft) applyRteDraft(draft, lideresTema, lideresDate, lideresNotes);
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
      return [title, week, tema, fecha, '', body].filter(Boolean).join('
');
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
