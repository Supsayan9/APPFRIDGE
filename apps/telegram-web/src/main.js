import './styles.css';

const apiUrl = import.meta.env.VITE_API_URL || 'https://appfridgeserver-production.up.railway.app';

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

const SALAD_MARKET_ITEMS = [
  { name: 'Помідор', category: 'Овочі', country: 'PL/UA' },
  { name: 'Огірок', category: 'Овочі', country: 'PL/UA' },
  { name: 'Рукола', category: 'Зелень', country: 'PL/UA' },
  { name: 'Шпинат', category: 'Зелень', country: 'PL/UA' },
  { name: 'Фета', category: 'Сири', country: 'PL/UA' },
  { name: 'Моцарела', category: 'Сири', country: 'PL/UA' },
  { name: 'Кукурудза', category: 'Додатки', country: 'PL/UA' },
  { name: 'Оливки', category: 'Додатки', country: 'PL/UA' },
  { name: 'Болгарський перець', category: 'Овочі', country: 'PL/UA' },
  { name: 'Авокадо', category: 'Овочі', country: 'PL/UA' }
];

const app = document.getElementById('app');

const state = {
  owner: 'vlad',
  loading: false,
  inventory: [],
  ai: [],
  aiExpanded: {},
  aiSelected: new Set(),
  scannerOpen: false,
  scannerStep: 'barcode',
  savingItem: false,
  scanningPhoto: false,
  current: {
    barcode: '',
    name: '',
    quantity: 1,
    expirationDate: '',
    location: 'fridge',
    imageBase64: '',
    imageMime: 'image/jpeg'
  },
  saladOpen: false,
  saladBowl: {},
  saladOrders: [],
  favoriteSaladIds: new Set(JSON.parse(localStorage.getItem('favoriteSalads') || '[]')),
  saladFavCollapsed: JSON.parse(localStorage.getItem('favoriteSaladsCollapsed') || 'false')
};

function escapeHtml(text) {
  return String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function toast(msg) {
  if (tg?.showAlert) tg.showAlert(msg);
  else alert(msg);
}

function getTodayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysLeftFromDate(dateStr) {
  const target = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function statusFromItem(item) {
  if (item.location === 'freezer') return { label: 'Заморожено', tone: 'frozen', daysLeft: null };
  const daysLeft = item.insight?.daysLeft ?? daysLeftFromDate(item.expirationDate);
  if (daysLeft == null) return { label: 'Свіжий', tone: 'fresh', daysLeft: null };
  if (daysLeft < 0) return { label: 'Прострочено', tone: 'expired', daysLeft };
  if (daysLeft <= 7) return { label: 'Скоро', tone: 'expiring', daysLeft };
  return { label: 'Свіжий', tone: 'fresh', daysLeft };
}

function sortByPriority(items) {
  return [...items].sort((a, b) => {
    const aDays = statusFromItem(a).daysLeft ?? Number.MAX_SAFE_INTEGER;
    const bDays = statusFromItem(b).daysLeft ?? Number.MAX_SAFE_INTEGER;
    if (aDays !== bDays) return aDays - bDays;
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
}

function locationLabel(location) {
  return location === 'freezer' ? 'Морозильна камера' : 'Холодильник';
}

function persistFavorites() {
  localStorage.setItem('favoriteSalads', JSON.stringify([...state.favoriteSaladIds]));
  localStorage.setItem('favoriteSaladsCollapsed', JSON.stringify(state.saladFavCollapsed));
}

function renderProductCard(item) {
  const status = statusFromItem(item);
  const statusClass = `tone-${status.tone}`;
  const selected = state.aiSelected.has(item.id);
  return `
    <article class="product-card ${statusClass}">
      <button class="delete-mini" data-delete="${item.id}">✕</button>
      <div class="product-name">${escapeHtml(item.name)}</div>
      <div class="product-meta">${escapeHtml(item.quantity || 1)} шт. · ${locationLabel(item.location)}</div>
      <div class="product-meta">${item.location === 'freezer' ? 'Без терміну (морозилка)' : `Термін: ${escapeHtml(item.expirationDate)}`}</div>
      <div class="product-actions">
        <button class="mini ${selected ? 'active' : ''}" data-ai-select="${item.id}">${selected ? 'Прибрати з AI' : 'Додати в AI'}</button>
        <button class="mini" data-move="${item.id}">${item.location === 'freezer' ? '→ Холодильник' : '→ Морозилка'}</button>
      </div>
      <div class="status-pill ${statusClass}">${status.label}</div>
    </article>
  `;
}

function renderRecipeCard(recipe, index) {
  const expanded = Boolean(state.aiExpanded[index]);
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients.join(', ') : '';
  const steps = Array.isArray(recipe.steps) ? recipe.steps.map((s, i) => `${i + 1}. ${s}`).join('\n') : '';
  const content = recipe.content || recipe.description || [ingredients && `Інгредієнти: ${ingredients}`, steps].filter(Boolean).join('\n\n');
  return `
    <article class="recipe-card">
      <button class="recipe-head" data-expand="${index}">
        <span>${escapeHtml(recipe.title || `Рецепт ${index + 1}`)}</span>
        <span class="chevron">${expanded ? '▾' : '▸'}</span>
      </button>
      <div class="recipe-body ${expanded ? 'expanded' : ''}">${escapeHtml(content).replaceAll('\n', '<br/>')}</div>
    </article>
  `;
}

function renderSaladOrder(order, index) {
  const fav = state.favoriteSaladIds.has(order.id);
  return `
    <article class="salad-order">
      <div class="salad-order-head">
        <h4>${escapeHtml(order.title)}</h4>
        <button class="heart ${fav ? 'active' : ''}" data-fav="${order.id}">${fav ? '♥' : '♡'}</button>
      </div>
      <p>${escapeHtml(order.description)}</p>
      <button class="mini" data-open-salad-recipe="${index}">Відкрити рецепт</button>
    </article>
  `;
}

function renderScannerModal() {
  if (!state.scannerOpen) return '';

  const step = state.scannerStep;

  return `
    <div class="modal-overlay" data-close-scanner="1">
      <div class="modal card" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3>Додавання продукту</h3>
          <button class="ghost" data-close-scanner="1">Закрити</button>
        </div>

        <div class="steps">Крок: ${step === 'barcode' ? '1/4' : step === 'name' ? '2/4' : step === 'date' ? '3/4' : '4/4'}</div>

        ${step === 'barcode' ? `
          <label>Штрихкод</label>
          <input id="scan-barcode" placeholder="Введи або встав код" value="${escapeHtml(state.current.barcode)}" />
          <label>Або фото штрихкоду</label>
          <input id="scan-barcode-photo" type="file" accept="image/*" />
          <div class="actions single">
            <button class="ghost" ${state.scanningPhoto ? 'disabled' : ''} data-scan-barcode-photo="1">${state.scanningPhoto ? 'Скануємо...' : 'Сканувати штрихкод з фото'}</button>
            <button data-next-barcode="1">Далі</button>
          </div>
        ` : ''}

        ${step === 'name' ? `
          <label>Назва продукту</label>
          <input id="scan-name" placeholder="Введи назву" value="${escapeHtml(state.current.name)}" />
          <label>Або фото назви</label>
          <input id="scan-name-photo" type="file" accept="image/*" />
          <label>Кількість</label>
          <input id="scan-qty" type="number" min="1" max="99" value="${escapeHtml(state.current.quantity)}" />
          <div class="actions">
            <button class="ghost" data-prev-step="barcode">Назад</button>
            <button class="ghost" ${state.scanningPhoto ? 'disabled' : ''} data-scan-name-photo="1">${state.scanningPhoto ? 'Скануємо...' : 'Сканувати назву з фото'}</button>
            <button data-next-name="1">Далі</button>
          </div>
        ` : ''}

        ${step === 'date' ? `
          <label>Дата придатності</label>
          <input id="scan-date" type="date" value="${escapeHtml(state.current.expirationDate || getTodayIso())}" />
          <label>Або фото для AI-розпізнавання</label>
          <input id="scan-photo" type="file" accept="image/*" />
          <div class="actions">
            <button class="ghost" data-prev-step="name">Назад</button>
            <button ${state.scanningPhoto ? 'disabled' : ''} data-ai-date="1">${state.scanningPhoto ? 'Зчитуємо...' : 'Зчитати з фото'}</button>
            <button data-next-date="1">Далі</button>
          </div>
        ` : ''}

        ${step === 'location' ? `
          <label>Локація</label>
          <div class="chips">
            <button class="chip ${state.current.location === 'fridge' ? 'active' : ''}" data-set-loc="fridge">Холодильник</button>
            <button class="chip ${state.current.location === 'freezer' ? 'active' : ''}" data-set-loc="freezer">Морозильна камера</button>
          </div>
          <div class="actions">
            <button class="ghost" data-prev-step="date">Назад</button>
            <button ${state.savingItem ? 'disabled' : ''} data-save-item="1">${state.savingItem ? 'Зберігаємо...' : 'Зберегти продукт'}</button>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function renderSaladModal() {
  if (!state.saladOpen) return '';

  const bowlEntries = Object.entries(state.saladBowl).filter(([, qty]) => qty > 0);

  return `
    <div class="modal-overlay" data-close-salad="1">
      <div class="modal card" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3>САЛАТИК МММ...</h3>
          <button class="ghost" data-close-salad="1">Закрити</button>
        </div>

        <div class="salad-grid">
          ${SALAD_MARKET_ITEMS.map((item) => {
            const qty = state.saladBowl[item.name] || 0;
            return `
              <div class="salad-item">
                <div class="salad-title">${escapeHtml(item.name)}</div>
                <div class="salad-sub">${item.category} · ${item.country}</div>
                <div class="qty-row">
                  <button class="mini" data-salad-minus="${escapeHtml(item.name)}">-</button>
                  <span>${qty}</span>
                  <button class="mini" data-salad-plus="${escapeHtml(item.name)}">+</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <div class="actions single">
          <button data-salad-order="1" ${state.loading ? 'disabled' : ''}>Замовити шефу (2 салати)</button>
        </div>

        <div class="muted">У тарілці: ${bowlEntries.map(([name, qty]) => `${escapeHtml(name)} x${qty}`).join(', ') || 'нічого'}</div>
      </div>
    </div>
  `;
}

function render() {
  const user = tg?.initDataUnsafe?.user;
  const sorted = sortByPriority(state.inventory);
  const fridge = sorted.filter((i) => i.location !== 'freezer');
  const freezer = sorted.filter((i) => i.location === 'freezer');
  const selectedCount = state.aiSelected.size;
  const favoriteOrders = state.saladOrders.filter((o) => state.favoriteSaladIds.has(o.id));

  app.innerHTML = `
    <main class="screen ${state.owner === 'rimma' ? 'rimma' : 'vlad'}">
      <div class="stars"></div>

      <header class="hero card">
        <h1>APPFRIDGE ☠️🖤✨</h1>
        <p>${user ? `Привіт, ${escapeHtml(user.first_name)}!` : 'Telegram Mini App'}</p>
        <div class="profile-switch">
          <button class="chip ${state.owner === 'vlad' ? 'active' : ''}" data-owner="vlad">Влад</button>
          <button class="chip ${state.owner === 'rimma' ? 'active' : ''}" data-owner="rimma">Римма</button>
        </div>
      </header>

      <section class="card ai-card">
        <h2>AI помічник</h2>
        <p>Обирай продукти і отримуй 5 рецептів.</p>
        <div class="actions">
          <button id="open-scanner">Відкрити сканер</button>
          <button id="ai" ${state.loading ? 'disabled' : ''}>Отримати AI-рецепти ${selectedCount ? `(${selectedCount})` : ''}</button>
        </div>
      </section>

      <section class="card salad-block">
        <div class="section-head">
          <h2>САЛАТИК МММ...</h2>
          <button class="mini" id="open-salad">Відкрити</button>
        </div>
        ${favoriteOrders.length ? `
          <button class="collapse" id="toggle-fav-salads">${state.saladFavCollapsed ? '▸' : '▾'} Улюблені салати (${favoriteOrders.length})</button>
          <div class="${state.saladFavCollapsed ? 'hidden' : ''}">
            ${favoriteOrders.map((order, index) => renderSaladOrder(order, index)).join('')}
          </div>
        ` : '<p class="muted">Ще немає улюблених салатів.</p>'}
      </section>

      <section class="card">
        <div class="section-head">
          <h2>Холодильник</h2>
          <span>${fridge.length}</span>
        </div>
        <div class="grid">${fridge.length ? fridge.map(renderProductCard).join('') : '<p class="muted">Порожньо</p>'}</div>
      </section>

      <section class="card">
        <div class="section-head">
          <h2>Морозильна камера</h2>
          <span>${freezer.length}</span>
        </div>
        <div class="grid">${freezer.length ? freezer.map(renderProductCard).join('') : '<p class="muted">Порожньо</p>'}</div>
      </section>

      <section class="card">
        <div class="section-head">
          <h2>AI-рецепти</h2>
          <span>${state.ai.length}</span>
        </div>
        <div class="recipes">
          ${state.ai.length ? state.ai.map((recipe, index) => renderRecipeCard(recipe, index)).join('') : '<p class="muted">Натисни “Отримати AI-рецепти”.</p>'}
        </div>
      </section>

      ${renderScannerModal()}
      ${renderSaladModal()}
    </main>
  `;

  bindEvents();
}

function bindEvents() {
  app.querySelectorAll('[data-owner]').forEach((el) => {
    el.addEventListener('click', async () => {
      const owner = el.getAttribute('data-owner');
      if (!owner || owner === state.owner) return;
      state.owner = owner;
      state.aiSelected.clear();
      await loadInventory();
    });
  });

  const openScanner = document.getElementById('open-scanner');
  const aiEl = document.getElementById('ai');
  const openSalad = document.getElementById('open-salad');
  const toggleFav = document.getElementById('toggle-fav-salads');

  openScanner?.addEventListener('click', () => {
    state.scannerOpen = true;
    state.scannerStep = 'barcode';
    state.current = {
      barcode: '',
      name: '',
      quantity: 1,
      expirationDate: getTodayIso(),
      location: 'fridge',
      imageBase64: '',
      imageMime: 'image/jpeg'
    };
    render();
  });

  aiEl?.addEventListener('click', () => loadAi());
  openSalad?.addEventListener('click', () => {
    state.saladOpen = true;
    render();
  });

  toggleFav?.addEventListener('click', () => {
    state.saladFavCollapsed = !state.saladFavCollapsed;
    persistFavorites();
    render();
  });

  app.querySelectorAll('[data-expand]').forEach((el) => {
    el.addEventListener('click', () => {
      const index = Number(el.getAttribute('data-expand'));
      state.aiExpanded[index] = !state.aiExpanded[index];
      render();
    });
  });

  app.querySelectorAll('[data-ai-select]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-ai-select');
      if (!id) return;
      if (state.aiSelected.has(id)) state.aiSelected.delete(id);
      else state.aiSelected.add(id);
      render();
    });
  });

  app.querySelectorAll('[data-delete]').forEach((el) => {
    el.addEventListener('click', async () => {
      const id = el.getAttribute('data-delete');
      if (!id) return;
      if (!confirm('Видалити продукт?')) return;
      await fetch(`${apiUrl}/inventory/${encodeURIComponent(id)}?owner=${encodeURIComponent(state.owner)}`, { method: 'DELETE' });
      state.aiSelected.delete(id);
      await loadInventory();
    });
  });

  app.querySelectorAll('[data-move]').forEach((el) => {
    el.addEventListener('click', async () => {
      const id = el.getAttribute('data-move');
      if (!id) return;
      const item = state.inventory.find((x) => x.id === id);
      if (!item) return;
      const location = item.location === 'freezer' ? 'fridge' : 'freezer';
      await fetch(`${apiUrl}/inventory/${encodeURIComponent(id)}?owner=${encodeURIComponent(state.owner)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location })
      });
      await loadInventory();
    });
  });

  app.querySelectorAll('[data-close-scanner]').forEach((el) => {
    el.addEventListener('click', () => {
      state.scannerOpen = false;
      render();
    });
  });

  app.querySelectorAll('[data-prev-step]').forEach((el) => {
    el.addEventListener('click', () => {
      const prev = el.getAttribute('data-prev-step');
      if (!prev) return;
      state.scannerStep = prev;
      render();
    });
  });

  app.querySelectorAll('[data-next-barcode]').forEach((el) => {
    el.addEventListener('click', async () => {
      const barcode = document.getElementById('scan-barcode')?.value?.trim();
      if (!barcode) return toast('Введи штрихкод');
      state.current.barcode = barcode;

      try {
        const res = await fetch(`${apiUrl}/products/${encodeURIComponent(barcode)}`);
        const product = await res.json();
        if (product?.name) state.current.name = product.name;
      } catch {
        // ignore
      }

      state.scannerStep = 'name';
      render();
    });
  });

  app.querySelectorAll('[data-scan-barcode-photo]').forEach((el) => {
    el.addEventListener('click', async () => {
      const file = document.getElementById('scan-barcode-photo')?.files?.[0];
      if (!file) return toast('Додай фото штрихкоду');
      state.scanningPhoto = true;
      render();
      try {
        const barcode = await detectBarcodeFromImage(file);
        if (!barcode) {
          toast('Не вдалося розпізнати штрихкод. Введи вручну.');
          return;
        }
        state.current.barcode = barcode;
        state.scannerStep = 'name';
      } catch {
        toast('Не вдалося розпізнати штрихкод. Введи вручну.');
      } finally {
        state.scanningPhoto = false;
        render();
      }
    });
  });

  app.querySelectorAll('[data-next-name]').forEach((el) => {
    el.addEventListener('click', () => {
      const name = document.getElementById('scan-name')?.value?.trim();
      const qty = Number(document.getElementById('scan-qty')?.value || 1);
      if (!name) return toast('Введи назву продукту');
      state.current.name = name;
      state.current.quantity = Math.max(1, Math.round(qty || 1));
      state.scannerStep = 'date';
      render();
    });
  });

  app.querySelectorAll('[data-scan-name-photo]').forEach((el) => {
    el.addEventListener('click', async () => {
      const file = document.getElementById('scan-name-photo')?.files?.[0];
      if (!file) return toast('Додай фото назви');
      state.scanningPhoto = true;
      render();
      try {
        const base64 = await fileToBase64(file);
        const res = await fetch(`${apiUrl}/ai/name-from-image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64, mimeType: file.type || 'image/jpeg' })
        });
        if (!res.ok) {
          const err = await safeJson(res);
          throw new Error(err?.message || 'Не вдалося зчитати назву');
        }
        const data = await res.json();
        if (!data?.name) {
          throw new Error('Не вдалося зчитати назву');
        }
        state.current.name = data.name;
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Не вдалося зчитати назву');
      } finally {
        state.scanningPhoto = false;
        render();
      }
    });
  });

  app.querySelectorAll('[data-ai-date]').forEach((el) => {
    el.addEventListener('click', async () => {
      const file = document.getElementById('scan-photo')?.files?.[0];
      if (!file) return toast('Додай фото дати');
      state.scanningPhoto = true;
      render();
      try {
        const base64 = await fileToBase64(file);
        const res = await fetch(`${apiUrl}/ai/expiry-from-image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64, mimeType: file.type || 'image/jpeg' })
        });
        if (!res.ok) {
          const err = await safeJson(res);
          throw new Error(err?.message || 'Не вдалося зчитати дату');
        }
        const data = await res.json();
        state.current.expirationDate = data.isoDate;
        toast(`Знайшли дату: ${data.isoDate}`);
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Не вдалося зчитати дату, введи вручну.');
      } finally {
        state.scanningPhoto = false;
        render();
      }
    });
  });

  app.querySelectorAll('[data-next-date]').forEach((el) => {
    el.addEventListener('click', () => {
      const date = document.getElementById('scan-date')?.value;
      if (!date) return toast('Вкажи дату');
      state.current.expirationDate = date;
      state.scannerStep = 'location';
      render();
    });
  });

  app.querySelectorAll('[data-set-loc]').forEach((el) => {
    el.addEventListener('click', () => {
      const loc = el.getAttribute('data-set-loc');
      if (loc !== 'fridge' && loc !== 'freezer') return;
      state.current.location = loc;
      render();
    });
  });

  app.querySelectorAll('[data-save-item]').forEach((el) => {
    el.addEventListener('click', async () => {
      state.savingItem = true;
      render();
      try {
        await fetch(`${apiUrl}/inventory`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            owner: state.owner,
            barcode: state.current.barcode,
            name: state.current.name,
            quantity: state.current.quantity,
            expirationDate: state.current.expirationDate,
            location: state.current.location
          })
        });
        state.scannerOpen = false;
        toast('Продукт додано');
        await loadInventory();
      } catch {
        toast('Не вдалося зберегти продукт');
      } finally {
        state.savingItem = false;
        render();
      }
    });
  });

  app.querySelectorAll('[data-close-salad]').forEach((el) => {
    el.addEventListener('click', () => {
      state.saladOpen = false;
      render();
    });
  });

  app.querySelectorAll('[data-salad-plus]').forEach((el) => {
    el.addEventListener('click', () => {
      const name = el.getAttribute('data-salad-plus');
      if (!name) return;
      state.saladBowl[name] = (state.saladBowl[name] || 0) + 1;
      render();
    });
  });

  app.querySelectorAll('[data-salad-minus]').forEach((el) => {
    el.addEventListener('click', () => {
      const name = el.getAttribute('data-salad-minus');
      if (!name) return;
      state.saladBowl[name] = Math.max(0, (state.saladBowl[name] || 0) - 1);
      render();
    });
  });

  app.querySelectorAll('[data-salad-order]').forEach((el) => {
    el.addEventListener('click', () => loadSaladOrders());
  });

  app.querySelectorAll('[data-fav]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-fav');
      if (!id) return;
      if (state.favoriteSaladIds.has(id)) state.favoriteSaladIds.delete(id);
      else state.favoriteSaladIds.add(id);
      persistFavorites();
      render();
    });
  });

  app.querySelectorAll('[data-open-salad-recipe]').forEach((el) => {
    el.addEventListener('click', () => {
      const idx = Number(el.getAttribute('data-open-salad-recipe'));
      const order = state.saladOrders[idx];
      if (!order) return;
      const recipeText = `${order.title}\n\nІнгредієнти:\n- ${order.ingredients.join('\n- ')}\n\nКроки:\n${order.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
      toast(recipeText);
    });
  });
}

async function loadInventory() {
  state.loading = true;
  render();
  try {
    const res = await fetch(`${apiUrl}/inventory?owner=${encodeURIComponent(state.owner)}`);
    state.inventory = await res.json();
  } catch {
    state.inventory = [];
  } finally {
    state.loading = false;
    render();
  }
}

async function loadAi() {
  state.loading = true;
  render();
  try {
    const ids = [...state.aiSelected];
    const res = await fetch(`${apiUrl}/recipes/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner: state.owner, itemIds: ids.length ? ids : undefined })
    });
    if (!res.ok) {
      const err = await safeJson(res);
      throw new Error(err?.message || 'AI помічник тимчасово недоступний');
    }
    const data = await res.json();
    state.ai = Array.isArray(data) ? data.slice(0, 5) : [];
    state.aiExpanded = {};
    state.aiSelected.clear();
  } catch (error) {
    state.ai = [];
    toast(error instanceof Error ? error.message : 'Не вдалося отримати AI-рецепти');
  } finally {
    state.loading = false;
    render();
  }
}

async function loadSaladOrders() {
  const ingredients = Object.entries(state.saladBowl)
    .filter(([, qty]) => qty > 0)
    .map(([name, quantity]) => ({ name, quantity }));

  if (!ingredients.length) {
    toast('Додай інгредієнти в тарілку.');
    return;
  }

  state.loading = true;
  render();
  try {
    const res = await fetch(`${apiUrl}/recipes/salad-chef`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ingredients })
    });
    const data = await res.json();
    state.saladOrders = Array.isArray(data)
      ? data.map((x, i) => ({ ...x, id: x.id || `${Date.now()}-${i}` }))
      : [];
    state.saladOpen = false;
  } catch {
    toast('Не вдалося згенерувати салати');
  } finally {
    state.loading = false;
    render();
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function detectBarcodeFromImage(file) {
  if (!('BarcodeDetector' in window)) {
    throw new Error('Цей браузер не підтримує скан штрихкоду з фото.');
  }
  const detector = new window.BarcodeDetector({
    formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf']
  });
  const bitmap = await createImageBitmap(file);
  const found = await detector.detect(bitmap);
  bitmap.close();
  return found?.[0]?.rawValue?.trim() || '';
}

render();
loadInventory();
