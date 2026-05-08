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
  ai: []
};

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function render() {
  const user = tg?.initDataUnsafe?.user;
  app.innerHTML = `
    <main class="shell">
      <header class="hero">
        <h1>AppFridge Mini App</h1>
        <p>${user ? `Привіт, ${escapeHtml(user.first_name)}!` : 'Telegram підключено.'}</p>
      </header>

      <section class="card">
        <label for="owner">Профіль</label>
        <select id="owner">
          <option value="vlad" ${state.owner === 'vlad' ? 'selected' : ''}>Влад</option>
          <option value="rimma" ${state.owner === 'rimma' ? 'selected' : ''}>Римма</option>
        </select>
        <div class="actions">
          <button id="refresh" ${state.loading ? 'disabled' : ''}>Оновити продукти</button>
          <button id="ai" ${state.loading ? 'disabled' : ''}>Отримати AI-рецепти</button>
        </div>
      </section>

      <section class="card">
        <h2>Продукти (${state.inventory.length})</h2>
        ${state.inventory.length === 0 ? '<p class="muted">Порожньо</p>' : ''}
        <ul>
          ${state.inventory
            .map(
              (item) => `
            <li>
              <b>${escapeHtml(item.name)}</b>
              <span>${escapeHtml(item.location)} · ${escapeHtml(item.expirationDate)}</span>
            </li>`
            )
            .join('')}
        </ul>
      </section>

      <section class="card">
        <h2>AI-рецепти (${state.ai.length})</h2>
        ${state.ai.length === 0 ? '<p class="muted">Ще немає</p>' : ''}
        <ul>
          ${state.ai
            .map(
              (recipe) => `
            <li>
              <b>${escapeHtml(recipe.title)}</b>
              <span>${escapeHtml(recipe.description)}</span>
            </li>`
            )
            .join('')}
        </ul>
      </section>
    </main>
  `;

  const ownerEl = document.getElementById('owner');
  const refreshEl = document.getElementById('refresh');
  const aiEl = document.getElementById('ai');

  ownerEl?.addEventListener('change', async (e) => {
    state.owner = e.target.value;
    await loadInventory();
  });
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
  } catch {
    state.ai = [];
  } finally {
    state.loading = false;
    render();
  }
}

render();
loadInventory();
