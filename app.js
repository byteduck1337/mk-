(function() {
  const STORAGE_KEYS = {
    USERS: 'mira_users_v7',
    CURRENT_USER: 'mira_current_v7',
    NOTES: 'mira_notes_v7',
    CONNECTIONS: 'mira_connections_v7',
    SETTINGS: 'mira_settings_v7'
  };

  let currentUser = null;
  let notes = [];
  let connections = [];
  let settings = { 
    theme: 'light', 
    autoTheme: false,
    showNotesCount: false,
    showLinesCount: false,
    showFPS: false
  };

  let canvasScale = 1;
  let canvasOffsetX = 0;
  let canvasOffsetY = 0;
  let isPanning = false;
  let panStart = { x: 0, y: 0 };
  let contextMenu = null;
  let settingsModal = null;

  let connectingSourceId = null;
  let recentlyCreatedNoteId = null;
  let recentlyUpdatedNoteId = null;

  const defaultColors = ['#6b7b8f', '#c44b4b', '#4b8c6f', '#b8904b', '#8b6baf', '#4b8bb0', '#d46b8b', '#5b9e8a'];
  const MIN_WIDTH = 160;
  const MAX_WIDTH = 500;
  const MIN_HEIGHT = 100;

  let statsOverlay = null;
  let fpsData = {
    frames: 0,
    lastTime: performance.now(),
    fps: 0
  };

  function loadFromStorage() {
    try { currentUser = JSON.parse(localStorage.getItem(STORAGE_KEYS.CURRENT_USER)); } catch(e){}
    try { notes = JSON.parse(localStorage.getItem(STORAGE_KEYS.NOTES)) || []; } catch(e){ notes = []; }
    try { connections = JSON.parse(localStorage.getItem(STORAGE_KEYS.CONNECTIONS)) || []; } catch(e){ connections = []; }
    try { 
      const savedSettings = JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS));
      settings = { 
        theme: 'light', 
        autoTheme: false,
        showNotesCount: false,
        showLinesCount: false,
        showFPS: false,
        ...savedSettings
      };
    } catch(e){}
  }

  function saveAll() {
    if (currentUser) localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(currentUser));
    localStorage.setItem(STORAGE_KEYS.NOTES, JSON.stringify(notes));
    localStorage.setItem(STORAGE_KEYS.CONNECTIONS, JSON.stringify(connections));
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  }

  function createDefaultUser() {
    const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '{}');
    const defaultEmail = 'user@mirakeep.local';
    if (!users[defaultEmail]) {
      users[defaultEmail] = { password: 'mira', name: 'Исследователь', avatarBase64: '' };
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    }
    currentUser = { email: defaultEmail, name: users[defaultEmail].name, avatarBase64: users[defaultEmail].avatarBase64 || '' };
    saveAll();
  }

  function updateProfile(name, avatarBase64) {
    if (!currentUser) return;
    const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '{}');
    if (users[currentUser.email]) {
      users[currentUser.email].name = name;
      users[currentUser.email].avatarBase64 = avatarBase64;
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    }
    currentUser.name = name;
    currentUser.avatarBase64 = avatarBase64;
    saveAll();
  }

  function applyTheme() {
    if (settings.autoTheme) {
      const h = new Date().getHours();
      document.body.className = (h >= 19 || h < 8) ? 'dark' : 'light';
    } else {
      document.body.className = settings.theme;
    }
  }

  function createStatsOverlay() {
    if (statsOverlay) statsOverlay.remove();
    
    statsOverlay = document.createElement('div');
    statsOverlay.className = 'stats-overlay';
    statsOverlay.innerHTML = `
      <div class="stats-item notes-count" style="display: ${settings.showNotesCount ? 'flex' : 'none'};">
        <span class="stats-icon">📝</span>
        <span class="stats-label">Заметки:</span>
        <span class="stats-value" id="notesCountValue">${notes.length}</span>
      </div>
      <div class="stats-item lines-count" style="display: ${settings.showLinesCount ? 'flex' : 'none'};">
        <span class="stats-icon">🔗</span>
        <span class="stats-label">Линии:</span>
        <span class="stats-value" id="linesCountValue">${connections.length}</span>
      </div>
      <div class="stats-item fps-counter" style="display: ${settings.showFPS ? 'flex' : 'none'};">
        <span class="stats-icon">⚡</span>
        <span class="stats-label">FPS:</span>
        <span class="stats-value" id="fpsValue">0</span>
      </div>
    `;
    
    document.body.appendChild(statsOverlay);
  }

  function updateStatsOverlay() {
    if (!statsOverlay) return;
    
    const notesCountEl = document.getElementById('notesCountValue');
    const linesCountEl = document.getElementById('linesCountValue');
    
    if (notesCountEl) notesCountEl.textContent = notes.length;
    if (linesCountEl) linesCountEl.textContent = connections.length;
  }

  function updateFPS() {
    fpsData.frames++;
    const now = performance.now();
    const elapsed = now - fpsData.lastTime;
    
    if (elapsed >= 1000) {
      fpsData.fps = Math.round((fpsData.frames * 1000) / elapsed);
      fpsData.frames = 0;
      fpsData.lastTime = now;
      
      const fpsEl = document.getElementById('fpsValue');
      if (fpsEl && settings.showFPS) {
        fpsEl.textContent = fpsData.fps;
      }
    }
    
    requestAnimationFrame(updateFPS);
  }

  function toggleStatsVisibility() {
    if (!statsOverlay) return;
    
    const notesCountEl = statsOverlay.querySelector('.notes-count');
    const linesCountEl = statsOverlay.querySelector('.lines-count');
    const fpsCounterEl = statsOverlay.querySelector('.fps-counter');
    
    if (notesCountEl) notesCountEl.style.display = settings.showNotesCount ? 'flex' : 'none';
    if (linesCountEl) linesCountEl.style.display = settings.showLinesCount ? 'flex' : 'none';
    if (fpsCounterEl) fpsCounterEl.style.display = settings.showFPS ? 'flex' : 'none';
  }

  const appRoot = document.getElementById('appRoot');

  function showLoadingScreen() {
    document.body.className = settings.theme || 'light';
    appRoot.innerHTML = `
      <div class="loading-screen" id="loadingScreen">
        <div class="loading-content">
          <div class="loading-text">Mira Keep</div>
          <div class="loading-spinner"></div>
          <div class="loading-subtitle">Загрузка пространства...</div>
        </div>
      </div>
    `;
    
    const minLoadTime = 1800;
    const startTime = Date.now();
    
    function finishLoading() {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, minLoadTime - elapsed);
      
      setTimeout(() => {
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) {
          loadingScreen.style.opacity = '0';
          setTimeout(() => {
            if (!currentUser) createDefaultUser();
            renderMain();
          }, 600);
        }
      }, remaining);
    }
    
    setTimeout(finishLoading, 200);
  }

  function renderMain() {
    applyTheme();
    notes.forEach((n, i) => {
      if (n.x === undefined) n.x = 200 + (i % 4) * 340;
      if (n.y === undefined) n.y = 200 + Math.floor(i / 4) * 300;
      if (!n.color) n.color = defaultColors[0];
      if (n.scale === undefined) n.scale = 1;
      if (n.height === undefined) n.height = 120;
      if (n.width === undefined) n.width = 260;
    });

    appRoot.innerHTML = `
      <div class="top-bar">
        <div class="profile-section">
          <div class="avatar-wrapper" id="avatarUploadTrigger">
            ${currentUser.avatarBase64 ? `<img src="${currentUser.avatarBase64}" alt="avatar">` : '👤'}
          </div>
          <strong style="font-size:1rem;">${escapeHtml(currentUser.name)}</strong>
        </div>
        <div class="controls">
          <button id="zoomOutBtn" title="Уменьшить">−</button>
          <span style="min-width:50px; text-align:center; font-size:0.85rem;" id="zoomLabel">100%</span>
          <button id="zoomInBtn" title="Увеличить">+</button>
          <button id="themeToggleBtn" title="Сменить тему">🌓</button>
          <button id="settingsBtn" title="Настройки">⚙️</button>
        </div>
      </div>
      <div class="infinite-canvas" id="infiniteCanvas">
        <div class="canvas-world" id="canvasWorld">
          <svg class="connections-layer" id="connectionsLayer"></svg>
        </div>
      </div>
    `;

    createStatsOverlay();
    updateCanvasTransform();
    renderCanvasContent();
    attachCanvasListeners();
    attachTopListeners();
    startConnectionAnimation();
    
    if (recentlyCreatedNoteId) {
      setTimeout(() => {
        const card = document.querySelector(`.note-card[data-id="${recentlyCreatedNoteId}"]`);
        if (card) card.classList.remove('just-created');
        recentlyCreatedNoteId = null;
      }, 400);
    }
  }

  function escapeHtml(s) { 
    return String(s).replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[m]); 
  }

  function updateCanvasTransform() {
    const world = document.getElementById('canvasWorld');
    if (world) {
      world.style.transform = `translate(${canvasOffsetX}px, ${canvasOffsetY}px) scale(${canvasScale})`;
    }
    const zoomLabel = document.getElementById('zoomLabel');
    if (zoomLabel) zoomLabel.textContent = Math.round(canvasScale * 100) + '%';
  }

  function getNoteCenter(note) {
    const width = note.width || 260;
    const height = note.height || 120;
    return {
      x: note.x + width / 2,
      y: note.y + height / 2
    };
  }

  function getBoundingBox() {
    if (notes.length === 0) return { minX: 0, minY: 0, maxX: 10000, maxY: 10000 };
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    notes.forEach(n => {
      const w = n.width || 260;
      const h = n.height || 120;
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + w);
      maxY = Math.max(maxY, n.y + h);
    });
    
    const padding = 500;
    return {
      minX: minX - padding,
      minY: minY - padding,
      maxX: maxX + padding,
      maxY: maxY + padding
    };
  }

  function renderConnections() {
    const svg = document.getElementById('connectionsLayer');
    if (!svg) return;

    const bounds = getBoundingBox();
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    
    svg.setAttribute('viewBox', `${bounds.minX} ${bounds.minY} ${width} ${height}`);
    svg.style.width = width + 'px';
    svg.style.height = height + 'px';
    svg.style.left = bounds.minX + 'px';
    svg.style.top = bounds.minY + 'px';

    let paths = '';
    connections.forEach((conn) => {
      const from = notes.find(n => n.id === conn.from);
      const to = notes.find(n => n.id === conn.to);
      if (!from || !to) return;

      const fromCenter = getNoteCenter(from);
      const toCenter = getNoteCenter(to);
      
      const dx = toCenter.x - fromCenter.x;
      const dy = toCenter.y - fromCenter.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const offset = Math.min(40, dist * 0.15);
      
      const perpX = -dy / dist * offset;
      const perpY = dx / dist * offset;
      
      const cp1x = fromCenter.x + dx * 0.4 + perpX;
      const cp1y = fromCenter.y + dy * 0.4 + perpY;
      const cp2x = toCenter.x - dx * 0.4 + perpX;
      const cp2y = toCenter.y - dy * 0.4 + perpY;
      
      const isActive = connectingSourceId === conn.from || connectingSourceId === conn.to;
      
      paths += `
        <path class="connection-line ${isActive ? 'active glow-pulse' : ''} dash-animated" 
              d="M ${fromCenter.x} ${fromCenter.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${toCenter.x} ${toCenter.y}"
              stroke-dasharray="12 8" />
      `;
    });

    svg.innerHTML = paths;
    updateStatsOverlay();
  }

  function startConnectionAnimation() {
    let offset = 0;
    const speed = 0.5;
    
    function animate() {
      const svg = document.getElementById('connectionsLayer');
      if (!svg) {
        requestAnimationFrame(animate);
        return;
      }
      
      offset = (offset - speed) % 20;
      
      const lines = svg.querySelectorAll('.dash-animated');
      lines.forEach(line => {
        line.style.strokeDashoffset = offset;
      });
      
      requestAnimationFrame(animate);
    }
    
    requestAnimationFrame(animate);
  }

  function renderCanvasContent() {
    const world = document.getElementById('canvasWorld');
    if (!world) return;
    
    const notesHtml = notes.map(n => {
      const borderColor = n.color || defaultColors[0];
      const noteHeight = n.height || 120;
      const noteWidth = n.width || 260;
      const isConnecting = connectingSourceId === n.id;
      const isJustCreated = n.id === recentlyCreatedNoteId;
      const isJustUpdated = n.id === recentlyUpdatedNoteId;
      
      let animationClass = '';
      if (isJustCreated) animationClass = 'just-created';
      else if (isJustUpdated) animationClass = 'just-updated';
      
      return `
        <div class="note-card ${isConnecting ? 'connecting-source' : ''} ${animationClass}" 
             data-id="${n.id}" 
             style="left:${n.x}px; top:${n.y}px; --note-scale:${n.scale || 1}; transform:scale(${n.scale || 1}); border-color:${borderColor}; min-height:${noteHeight}px; height:${noteHeight}px; width:${noteWidth}px; min-width:${Math.min(noteWidth, MIN_WIDTH)}px; max-width:${Math.min(noteWidth, MAX_WIDTH)}px;">
          <div class="note-handle" data-id="${n.id}" title="Перетащить заметку"></div>
          <div class="note-content">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.2rem;">
              <div style="flex:1; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">${(n.markers||[]).map(m=>`<span class="marker">${escapeHtml(m)}</span>`).join('')}</div>
              <button class="delete-note-btn" data-id="${n.id}" 
                      style="background:transparent; border:none; padding:0.1rem 0.3rem; cursor:pointer; opacity:0.4; font-size:0.85rem;"
                      title="Удалить">×</button>
            </div>
            <textarea class="note-editor" data-id="${n.id}" 
                      placeholder="Введите текст заметки..."
                      rows="2" style="min-height:${Math.max(25, noteHeight - 80)}px; height:${Math.max(25, noteHeight - 80)}px;">${escapeHtml(n.text)}</textarea>
            <div class="color-picker-wrapper">
              <div class="color-picker-btn" title="Выбрать цвет бордера">
                <input type="color" class="custom-color-input" data-note-id="${n.id}" value="${borderColor}">
                <div class="current-color-indicator" style="background:${borderColor};"></div>
              </div>
              <span class="color-label">цвет бордера</span>
            </div>
          </div>
          <div class="note-resize-handle" data-id="${n.id}" title="Изменить размер (перетащите вниз/вверх или влево/вправо)">
            <span class="resize-hint">размер</span>
          </div>
          <div class="connection-point ${isConnecting ? 'active' : ''}" 
               data-note-id="${n.id}" 
               style="left:calc(50% - 9px); bottom:-4px; top:auto;"
               title="Кликните для связывания заметок"></div>
        </div>
      `;
    }).join('');

    const svg = world.querySelector('#connectionsLayer');
    world.innerHTML = notesHtml + (svg ? svg.outerHTML : '<svg class="connections-layer" id="connectionsLayer"></svg>');
    
    if (recentlyUpdatedNoteId) {
      recentlyUpdatedNoteId = null;
    }
    
    attachNoteListeners();
    attachResizeHandlers();
    attachConnectionListeners();
    renderConnections();
  }

  function markNoteUpdated(noteId) {
    recentlyUpdatedNoteId = noteId;
  }

  function attachResizeHandlers() {
    document.querySelectorAll('.note-resize-handle').forEach(handle => {
      handle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        
        const card = handle.closest('.note-card');
        const id = card.dataset.id;
        const note = notes.find(n => n.id === id);
        if (!note) return;
        
        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = note.width || 260;
        const startHeight = note.height || 120;
        const startScale = canvasScale;
        
        card.classList.add('resizing');
        
        function onMove(ev) {
          const dx = (ev.clientX - startX) / startScale;
          const dy = (ev.clientY - startY) / startScale;
          
          let newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + dx));
          let newHeight = Math.min(500, Math.max(MIN_HEIGHT, startHeight + dy));
          
          note.width = newWidth;
          note.height = newHeight;
          
          card.style.width = newWidth + 'px';
          card.style.minWidth = Math.min(newWidth, MIN_WIDTH) + 'px';
          card.style.maxWidth = Math.min(newWidth, MAX_WIDTH) + 'px';
          card.style.height = newHeight + 'px';
          card.style.minHeight = newHeight + 'px';
          
          const editor = card.querySelector('.note-editor');
          if (editor) {
            const editorHeight = Math.max(25, newHeight - 80);
            editor.style.height = editorHeight + 'px';
            editor.style.minHeight = editorHeight + 'px';
          }
          
          renderConnections();
        }
        
        function onUp() {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          card.classList.remove('resizing');
          markNoteUpdated(id);
          saveAll();
          renderConnections();
        }
        
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });
    });
  }

  function attachConnectionListeners() {
    document.querySelectorAll('.connection-point').forEach(point => {
      point.addEventListener('click', (e) => {
        e.stopPropagation();
        const noteId = point.dataset.noteId;
        
        if (!connectingSourceId) {
          connectingSourceId = noteId;
          markNoteUpdated(noteId);
          renderCanvasContent();
          return;
        }
        
        if (connectingSourceId === noteId) {
          connectingSourceId = null;
          markNoteUpdated(noteId);
          renderCanvasContent();
          return;
        }
        
        const exists = connections.find(c => 
          (c.from === connectingSourceId && c.to === noteId) || 
          (c.from === noteId && c.to === connectingSourceId)
        );
        
        if (!exists) {
          connections.push({ from: connectingSourceId, to: noteId });
          markNoteUpdated(noteId);
          markNoteUpdated(connectingSourceId);
          saveAll();
        }
        
        connectingSourceId = null;
        renderCanvasContent();
      });
    });
  }

  function attachNoteListeners() {
    document.querySelectorAll('.delete-note-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        notes = notes.filter(n => n.id !== id);
        connections = connections.filter(c => c.from !== id && c.to !== id);
        if (connectingSourceId === id) connectingSourceId = null;
        saveAll();
        renderCanvasContent();
      });
    });

    document.querySelectorAll('.note-editor').forEach(editor => {
      const noteId = editor.dataset.id;
      
      editor.addEventListener('input', function() {
        const note = notes.find(n => n.id === noteId);
        if (note) {
          note.text = this.value;
          this.style.height = 'auto';
          this.style.height = Math.max(25, this.scrollHeight) + 'px';
          const card = this.closest('.note-card');
          if (card) {
            const newHeight = Math.max(MIN_HEIGHT, this.scrollHeight + 80);
            const currentWidth = note.width || 260;
            note.height = newHeight;
            card.style.height = newHeight + 'px';
            card.style.minHeight = newHeight + 'px';
          }
          markNoteUpdated(noteId);
          saveAll();
          renderConnections();
        }
      });

      editor.addEventListener('focus', function() {
        this.closest('.note-card').classList.add('editing');
        const note = notes.find(n => n.id === noteId);
        if (note) {
          this.style.height = 'auto';
          this.style.height = Math.max(25, this.scrollHeight) + 'px';
        }
      });

      editor.addEventListener('blur', function() {
        this.closest('.note-card').classList.remove('editing');
      });

      editor.addEventListener('mousedown', (e) => {
        e.stopPropagation();
      });
    });

    document.querySelectorAll('.note-handle').forEach(handle => {
      handle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        
        const card = handle.closest('.note-card');
        const id = card.dataset.id;
        const note = notes.find(n => n.id === id);
        if (!note) return;
        
        const startX = e.clientX;
        const startY = e.clientY;
        const origX = note.x;
        const origY = note.y;
        
        card.classList.add('dragging');
        
        function onMove(ev) {
          const dx = (ev.clientX - startX) / canvasScale;
          const dy = (ev.clientY - startY) / canvasScale;
          note.x = origX + dx;
          note.y = origY + dy;
          card.style.left = note.x + 'px';
          card.style.top = note.y + 'px';
          renderConnections();
        }
        
        function onUp() {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          card.classList.remove('dragging');
          markNoteUpdated(id);
          saveAll();
        }
        
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });
    });

    document.querySelectorAll('.note-card').forEach(card => {
      card.addEventListener('wheel', (e) => {
        if (e.target.closest('textarea') || e.target.closest('.color-picker-wrapper') || e.target.closest('.note-resize-handle') || e.target.closest('.connection-point')) return;
        e.stopPropagation();
        e.preventDefault();
        const note = notes.find(n => n.id === card.dataset.id);
        if (!note) return;
        note.scale = Math.min(2.5, Math.max(0.5, (note.scale || 1) + (e.deltaY > 0 ? -0.08 : 0.08)));
        card.style.transform = `scale(${note.scale})`;
        markNoteUpdated(note.id);
        saveAll();
        renderConnections();
      }, { passive: false });
    });

    document.querySelectorAll('.custom-color-input').forEach(input => {
      input.addEventListener('input', (e) => {
        e.stopPropagation();
        const noteId = input.dataset.noteId;
        const note = notes.find(n => n.id === noteId);
        if (note) {
          note.color = e.target.value;
          const card = document.querySelector(`.note-card[data-id="${noteId}"]`);
          if (card) card.style.borderColor = note.color;
          const indicator = input.closest('.color-picker-btn').querySelector('.current-color-indicator');
          if (indicator) indicator.style.background = note.color;
          markNoteUpdated(noteId);
          saveAll();
        }
      });
      input.addEventListener('click', (e) => e.stopPropagation());
    });
  }

  function showContextMenu(x, y, items) {
    if (contextMenu) contextMenu.remove();
    contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.style.left = Math.min(x, window.innerWidth - 240) + 'px';
    contextMenu.style.top = Math.min(y, window.innerHeight - 220) + 'px';
    
    items.forEach(item => {
      const div = document.createElement('div');
      div.className = 'context-menu-item';
      div.textContent = item.label;
      div.onclick = (e) => {
        e.stopPropagation();
        item.action();
        if (contextMenu) contextMenu.remove();
        contextMenu = null;
      };
      contextMenu.appendChild(div);
    });
    
    document.body.appendChild(contextMenu);
    
    const closeMenu = () => {
      if (contextMenu) {
        contextMenu.remove();
        contextMenu = null;
      }
      document.removeEventListener('click', closeMenu);
    };
    
    setTimeout(() => document.addEventListener('click', closeMenu), 50);
  }

  function attachCanvasListeners() {
    const canvas = document.getElementById('infiniteCanvas');
    if (!canvas) return;

    canvas.addEventListener('mousedown', (e) => {
      if (e.target === canvas || e.target.id === 'canvasWorld' || e.target.closest('.connections-layer')) {
        if (e.button === 2) return;
        isPanning = true;
        panStart = { x: e.clientX - canvasOffsetX, y: e.clientY - canvasOffsetY };
        canvas.classList.add('panning');
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!isPanning) return;
      canvasOffsetX = e.clientX - panStart.x;
      canvasOffsetY = e.clientY - panStart.y;
      updateCanvasTransform();
      renderConnections();
    });

    window.addEventListener('mouseup', () => {
      if (isPanning) {
        isPanning = false;
        const canvas = document.getElementById('infiniteCanvas');
        if (canvas) canvas.classList.remove('panning');
      }
    });

    canvas.addEventListener('wheel', (e) => {
      if (e.target.closest('.note-card')) return;
      e.preventDefault();
      
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const zoomFactor = e.deltaY > 0 ? 0.92 : 1.08;
      const newScale = Math.min(3, Math.max(0.2, canvasScale * zoomFactor));

      canvasOffsetX = mouseX - (mouseX - canvasOffsetX) * (newScale / canvasScale);
      canvasOffsetY = mouseY - (mouseY - canvasOffsetY) * (newScale / canvasScale);
      canvasScale = newScale;
      updateCanvasTransform();
      renderConnections();
    }, { passive: false });

    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const target = e.target.closest('.note-card');
      
      if (target) {
        const id = target.dataset.id;
        
        showContextMenu(e.clientX, e.clientY, [
          { 
            label: '✎ Редактировать', 
            action: () => {
              const editor = target.querySelector('.note-editor');
              if (editor) {
                editor.focus();
                editor.select();
                markNoteUpdated(id);
              }
            }
          },
          { 
            label: '🗑️ Удалить', 
            action: () => {
              notes = notes.filter(n => n.id !== id);
              connections = connections.filter(c => c.from !== id && c.to !== id);
              if (connectingSourceId === id) connectingSourceId = null;
              saveAll();
              renderCanvasContent();
            }
          },
          { 
            label: '✂️ Удалить все связи', 
            action: () => {
              connections = connections.filter(c => c.from !== id && c.to !== id);
              markNoteUpdated(id);
              saveAll();
              renderCanvasContent();
            }
          }
        ]);
      } else {
        const rect = canvas.getBoundingClientRect();
        const worldX = (e.clientX - rect.left - canvasOffsetX) / canvasScale;
        const worldY = (e.clientY - rect.top - canvasOffsetY) / canvasScale;
        
        const newNote = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
          text: '',
          markers: [],
          x: worldX - 130,
          y: worldY - 60,
          color: defaultColors[0],
          scale: 1,
          height: 120,
          width: 260,
        };
        
        recentlyCreatedNoteId = newNote.id;
        notes.push(newNote);
        saveAll();
        renderCanvasContent();
        
        setTimeout(() => {
          const editor = document.querySelector(`.note-editor[data-id="${newNote.id}"]`);
          if (editor) editor.focus();
        }, 100);
        
        setTimeout(() => {
          const card = document.querySelector(`.note-card[data-id="${newNote.id}"]`);
          if (card) card.classList.remove('just-created');
          if (recentlyCreatedNoteId === newNote.id) recentlyCreatedNoteId = null;
        }, 400);
      }
    });
  }

  function openSettingsModal() {
    if (settingsModal) settingsModal.remove();
    
    settingsModal = document.createElement('div');
    settingsModal.className = 'settings-modal-overlay';
    settingsModal.innerHTML = `
      <div class="settings-modal">
        <h2 style="margin-bottom:2rem; font-weight:400; letter-spacing:-0.02em;">⚙️ Настройки</h2>
        
        <div class="settings-section">
          <label>Имя пользователя</label>
          <input type="text" class="settings-input" id="settingsNameInput" value="${escapeHtml(currentUser.name)}" placeholder="Ваше имя">
        </div>
        
        <div class="settings-section">
          <label>Аватар</label>
          <div style="display:flex; align-items:center; gap:1rem;">
            <div class="avatar-wrapper" id="settingsAvatarPreview" style="width:56px; height:56px;">
              ${currentUser.avatarBase64 ? `<img src="${currentUser.avatarBase64}" alt="avatar">` : '👤'}
            </div>
            <button id="changeAvatarBtn" class="btn-secondary" style="font-size:0.85rem;">Загрузить фото</button>
          </div>
        </div>
        
        <div class="settings-section">
          <label style="display:flex; align-items:center; justify-content:space-between;">
            <span>Автоматическая тема</span>
            <label class="toggle-switch">
              <input type="checkbox" id="autoThemeToggle" ${settings.autoTheme ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </label>
          <p style="font-size:0.75rem; color:var(--text-secondary); margin-top:0.5rem;">
            Ночная тема включается с 19:00 до 8:00
          </p>
        </div>
        
        <div class="settings-section">
          <label style="margin-bottom:1rem;">Включить отображение:</label>
          
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.8rem;">
            <span style="font-size:0.9rem;">📝 Общее кол-во заметок</span>
            <label class="toggle-switch">
              <input type="checkbox" id="showNotesCountToggle" ${settings.showNotesCount ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
          
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.8rem;">
            <span style="font-size:0.9rem;">🔗 Кол-во линий</span>
            <label class="toggle-switch">
              <input type="checkbox" id="showLinesCountToggle" ${settings.showLinesCount ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
          
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.8rem;">
            <span style="font-size:0.9rem;">⚡ FPS</span>
            <label class="toggle-switch">
              <input type="checkbox" id="showFPSToggle" ${settings.showFPS ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
        
        <div class="settings-actions">
          <button id="closeSettingsBtn" class="btn-secondary">Отмена</button>
          <button id="saveSettingsBtn" class="btn-primary">Сохранить</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(settingsModal);
    
    document.getElementById('closeSettingsBtn').addEventListener('click', closeSettingsModal);
    settingsModal.addEventListener('click', (e) => {
      if (e.target === settingsModal) closeSettingsModal();
    });
    
    document.getElementById('changeAvatarBtn').addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'image/*';
      inp.onchange = e => {
        const f = e.target.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = ev => {
          const preview = document.getElementById('settingsAvatarPreview');
          if (preview) {
            preview.innerHTML = `<img src="${ev.target.result}" alt="avatar">`;
            preview.dataset.newAvatar = ev.target.result;
          }
        };
        r.readAsDataURL(f);
      };
      inp.click();
    });
    
    document.getElementById('saveSettingsBtn').addEventListener('click', () => {
      const newName = document.getElementById('settingsNameInput').value.trim();
      const autoTheme = document.getElementById('autoThemeToggle').checked;
      const showNotesCount = document.getElementById('showNotesCountToggle').checked;
      const showLinesCount = document.getElementById('showLinesCountToggle').checked;
      const showFPS = document.getElementById('showFPSToggle').checked;
      const preview = document.getElementById('settingsAvatarPreview');
      const newAvatar = preview?.dataset?.newAvatar || currentUser.avatarBase64;
      
      if (newName) {
        updateProfile(newName, newAvatar);
      }
      
      settings.autoTheme = autoTheme;
      settings.showNotesCount = showNotesCount;
      settings.showLinesCount = showLinesCount;
      settings.showFPS = showFPS;
      saveAll();
      applyTheme();
      closeSettingsModal();
      renderMain();
    });
  }

  function closeSettingsModal() {
    if (settingsModal) {
      settingsModal.style.opacity = '0';
      settingsModal.style.transition = 'opacity 0.3s ease';
      setTimeout(() => {
        if (settingsModal) settingsModal.remove();
        settingsModal = null;
      }, 300);
    }
  }

  function attachTopListeners() {
    document.getElementById('zoomInBtn')?.addEventListener('click', () => {
      canvasScale = Math.min(3, canvasScale * 1.15);
      updateCanvasTransform();
      renderConnections();
    });
    
    document.getElementById('zoomOutBtn')?.addEventListener('click', () => {
      canvasScale = Math.max(0.2, canvasScale * 0.85);
      updateCanvasTransform();
      renderConnections();
    });

    document.getElementById('themeToggleBtn')?.addEventListener('click', () => {
      settings.autoTheme = false;
      settings.theme = document.body.classList.contains('dark') ? 'light' : 'dark';
      saveAll();
      applyTheme();
      renderMain();
    });

    document.getElementById('settingsBtn')?.addEventListener('click', openSettingsModal);

    document.getElementById('avatarUploadTrigger')?.addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'image/*';
      inp.onchange = e => {
        const f = e.target.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = ev => {
          updateProfile(currentUser.name, ev.target.result);
          renderMain();
        };
        r.readAsDataURL(f);
      };
      inp.click();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (settingsModal) closeSettingsModal();
      if (contextMenu) { contextMenu.remove(); contextMenu = null; }
      if (connectingSourceId) {
        const prevSourceId = connectingSourceId;
        connectingSourceId = null;
        markNoteUpdated(prevSourceId);
        renderCanvasContent();
      }
    }
    
    if (e.ctrlKey && e.key === 'n') {
      e.preventDefault();
      const newNote = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        text: '',
        markers: [],
        x: (window.innerWidth / 2 - canvasOffsetX) / canvasScale - 130,
        y: (window.innerHeight / 2 - canvasOffsetY) / canvasScale - 60,
        color: defaultColors[0],
        scale: 1,
        height: 120,
        width: 260,
      };
      recentlyCreatedNoteId = newNote.id;
      notes.push(newNote);
      saveAll();
      renderCanvasContent();
      setTimeout(() => {
        const editor = document.querySelector(`.note-editor[data-id="${newNote.id}"]`);
        if (editor) editor.focus();
      }, 100);
      
      setTimeout(() => {
        const card = document.querySelector(`.note-card[data-id="${newNote.id}"]`);
        if (card) card.classList.remove('just-created');
        if (recentlyCreatedNoteId === newNote.id) recentlyCreatedNoteId = null;
      }, 400);
    }
  });

  loadFromStorage();
  showLoadingScreen();
  updateFPS();
  
  setInterval(() => {
    if (settings.autoTheme && currentUser) applyTheme();
  }, 60000);
})();
