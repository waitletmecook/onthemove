const AUTH_TOKEN_KEY = "tourism_auth_token";
const token = localStorage.getItem(AUTH_TOKEN_KEY) || "";

function authHeaders() {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function setCardBackground(card, country) {
  if (country.heroImage) {
    card.style.backgroundImage = `linear-gradient(180deg, rgba(15, 23, 42, 0.2), rgba(2, 6, 23, 0.82)), url("${country.heroImage}")`;
    card.style.backgroundSize = "cover";
    card.style.backgroundPosition = "center";
  } else {
    card.style.background = country.cardGradient;
  }
}

function setupProfileNavMenu() {
  setupNavUserMenu({
    getIsLoggedIn: () => Boolean(localStorage.getItem(AUTH_TOKEN_KEY)),
    onGuestClick: () => {
      window.location.href = "/";
    },
    onLogout: async () => {
      try {
        await fetch("/api/auth/logout", { method: "POST", headers: authHeaders() });
      } catch {}
      localStorage.removeItem(AUTH_TOKEN_KEY);
      window.location.href = "/";
    }
  });
}

async function loadProfile() {
  const container = document.getElementById("favorites-content");

  if (!container) {
    return;
  }

  if (!token) {
    container.innerHTML =
      '<p class="profile-message">Откройте <a href="/">главную страницу</a> и войдите в аккаунт.</p>';
    return;
  }

  const meResponse = await fetch("/api/auth/me", { headers: authHeaders() });
  if (!meResponse.ok) {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    container.innerHTML =
      '<p class="profile-message profile-message--warn">Войдите снова на <a href="/">главной странице</a>.</p>';
    return;
  }

  await meResponse.json();

  const [favoritesResponse, countriesResponse] = await Promise.all([
    fetch("/api/favorites", { headers: authHeaders() }),
    fetch("/api/countries")
  ]);

  if (!favoritesResponse.ok || !countriesResponse.ok) {
    container.innerHTML = '<p class="profile-message profile-message--error">Не удалось загрузить избранное. Попробуйте позже.</p>';
    return;
  }

  const favoritesData = await favoritesResponse.json();
  const countries = await countriesResponse.json();
  const favoriteIds = new Set(favoritesData.favorites || []);
  const favorites = countries.filter((country) => favoriteIds.has(country.id));

  if (favorites.length === 0) {
    container.innerHTML =
      '<p class="profile-message">Пока пусто. Добавьте страны в избранное в разделе <a href="/#countries">Топ стран</a>.</p>';
    return;
  }

  container.innerHTML = "";
  favorites.forEach((country) => {
    const card = document.createElement("article");
    card.className = "country-card";
    setCardBackground(card, country);
    const safeName = String(country.name).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    card.innerHTML = `
      <a class="card-hit-area" href="/country.html?id=${country.id}" aria-label="Открыть гид: ${safeName}"></a>
      <div class="card-main">
        <h3>${country.name}</h3>
        <p>${country.subtitle}</p>
      </div>
      <div class="card-actions">
        <span class="card-link">Читать гид</span>
      </div>
    `;
    container.appendChild(card);
  });
}

setupProfileNavMenu();

loadProfile().catch(() => {
  const container = document.getElementById("favorites-content");
  if (container) {
    container.innerHTML = '<p class="profile-message profile-message--error">Не удалось загрузить избранное.</p>';
  }
});
