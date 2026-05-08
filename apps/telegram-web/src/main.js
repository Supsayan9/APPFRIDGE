import './styles.css';

const apiUrl =
  import.meta.env.VITE_API_URL ||
  'https://appfridgeserver-production.up.railway.app';

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

const app = document.getElementById('app');

const state = {
  owner: 'vlad',
  loading: false,
  inventory: [],
  ai: [],
  aiExpanded: {}
};

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function daysLeftFromDate(dateStr) {
  const target = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = target.getTime() - today.getTime();
  return Math.ceil(diff / 86400000);
}

function statusFromItem(item) {
  if (item.location === 'freezer') {
    return { label: 'Заморожено', tone: 'frozen', daysLeft: null };
  }
  const daysLeft = daysLeftFromDate(item.expirationDate);
  if (daysLeft == null) {
    return { label: 'Свіжий', tone: 'fresh', daysLeft: null };
  }
  if (daysLeft < 0) {
    return { label: 'Прострочено', tone: 'expired', daysLeft };
  }
  if (daysLeft <= 7) {
    return { label: 'Скоро', tone: 'expiring', daysLeft };
  }
  return { label: 'Свіжий', tone: 'fresh', daysLeft };
}

function sortByPriority(items) {
  return [...items].sort((a, b) => {
    const aStatus = statusFromItem(a);
    const bStatus = statusFromItem(b);
    const aDays = aStatus.daysLeft ?? Number.MAX_SAFE_INTEGER;
    const bDays = bStatus.daysLeft ?? Number.MAX_SAFE_INTEGER;
    if (aDays !== bDays) return aDays - bDays;
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
}

function formatLocation(location) {
  return location === 'freezer' ? 'Морозильна камера' : 'Холодильник';
}

function renderProductCard(item) {
  const status = statusFromItem(item);
  const statusClass = `tone-${status.tone}`;
  const subtitle = item.location === 'freezer'
    ? 'Без терміну в морозилці'
    : `Термін: ${escapeHtml(item.expirationDate)}`;

  return `
    <article class="product-card ${statusClass}">
      <div class="product-name">${escapeHtml(item.name)}</div>
      <div class="product-meta">${escapeHtml(item.quantity || 1)} шт. · ${formatLocation(item.location)}</div>
      <div class="product-meta">${subtitle}</div>
      <div class="status-pill ${statusClass}">${status.label}</div>
    </article>
  `;
}

function renderRecipeCard(recipe, index) {
  const expanded = Boolean(state.aiExpanded[index]);
  const body = escapeHtml(recipe.content || recipe.description || '');
  return `
    <article class="recipe-card">
      <button class="recipe-head" data-expand="${index}">
        <span>${escapeHtml(recipe.title || `Рецепт ${index + 1}`)}</span>
        <span class="chevron">${expanded ? '▾' : '▸'}</span>
      </button>
      <div class="recipe-body ${expanded ? 'expanded' : ''}">${body.replaceAll('\n', '<br/>')}</div>
    </article>
  `;
}

function render() {
  const user = tg?.initDataUnsafe?.user;
  const sorted = sortByPriority(state.inventory);
  const fridge = sorted.filter((i) => i.location !== 'freezer');
  const freezer = sorted.filter((i) => i.location === 'freezer');

  app.innerHTML = `
    <main class="screen ${state.owner === 'rimma' ? 'rimma' : 'vlad'}">
      <div class="stars"></div>

      <header class="hero card">
        <h1>APPFRIDGE</h1>
        <p>${user ? `Привіт, ${escapeHtml(user.first_name)}!` : 'Telegram Mini App'}</p>
        <div class="profile-switch">
          <button class="chip ${state.owner === 'vlad' ? 'active' : ''}" data-owner="vlad">Влад</button>
          <button class="chip ${state.owner === 'rimma' ? 'active' : ''}" data-owner="rimma">Римма</button>
        </div>
      </header>

      <section class="card ai-card">
        <h2>AI помічник</h2>
        <p>Рецепти з продуктів у холодильнику та морозильній камері.</p>
        <div class="actions">
          <button id="refresh" ${state.loading ? 'disabled' : ''}>Оновити продукти</button>
          <button id="ai" ${state.loading ? 'disabled' : ''}>Отримати AI-рецепти</button>
        </div>
      </section>

      <section class="card">
        <div class="section-head">
          <h2>Холодильник</h2>
          <span>${fridge.length}</span>
        </div>
        <div class="grid">
          ${fridge.length ? fridge.map(renderProductCard).join('') : '<p class="muted">Порожньо</p>'}
        </div>
      </section>

      <section class="card">
        <div class="section-head">
          <h2>Морозильна камера</h2>
          <span>${freezer.length}</span>
        </div>
        <div class="grid">
          ${freezer.length ? freezer.map(renderProductCard).join('') : '<p class="muted">Порожньо</p>'}
        </div>
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
    </main>
  `;

  app.querySelectorAll('[data-owner]').forEach((el) => {
    el.addEventListener('click', async () => {
      const owner = el.getAttribute('data-owner');
      if (!owner || owner === state.owner) return;
      state.owner = owner;
      await loadInventory();
    });
  });

  app.querySelectorAll('[data-expand]').forEach((el) => {
    el.addEventListener('click', () => {
      const index = Number(el.getAttribute('data-expand'));
      state.aiExpanded[index] = !state.aiExpanded[index];
      render();
    });
  });

  const refreshEl = document.getElementById('refresh');
  const aiEl = document.getElementById('ai');
  refreshEl?.addEventListener('click', () => loadInventory());
  aiEl?.addEventListener('click', () => loadAi());
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
    const res = await fetch(`${apiUrl}/recipes/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner: state.owner })
    });
    state.ai = await res.json();
    state.aiExpanded = {};
  } catch {
    state.ai = [];
  } finally {
    state.loading = false;
    render();
  }
}

render();
loadInventory();
