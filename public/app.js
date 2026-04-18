const AUTH_TOKEN_KEY = "tourism_auth_token";
let currentToken = localStorage.getItem(AUTH_TOKEN_KEY) || "";
let favoriteCountryIds = new Set();
let currentUser = null;
let authMode = "login";

function authHeaders() {
  return currentToken ? { Authorization: `Bearer ${currentToken}` } : {};
}

function updateAuthUi() {
  const authButton = document.getElementById("auth-btn");
  if (!authButton) {
    return;
  }
  if (currentUser) {
    authButton.setAttribute("aria-label", "Меню профиля");
    authButton.title = currentUser.displayName || "Профиль";
  } else {
    authButton.setAttribute("aria-label", "Войти");
    authButton.title = "Войти";
  }
}

function escapeAttr(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function buildCountryCardMarkup(country, showFavoriteButton = true) {
  const href = `/country.html?id=${country.id}`;
  const label = escapeAttr(`Открыть гид: ${country.name}`);
  return `
    <a class="card-hit-area" href="${href}" aria-label="${label}"></a>
    <div class="card-main">
      <h3>${country.name}</h3>
      <p>${country.subtitle}</p>
    </div>
    <div class="card-actions">
      <span class="card-link">Читать гид</span>
      ${
        showFavoriteButton
          ? `<button class="fav-btn" type="button" data-country-id="${country.id}">
        ${favoriteCountryIds.has(country.id) ? "★ Избранное" : "☆ В избранное"}
      </button>`
          : ""
      }
    </div>
  `;
}

function applyCountryCardBackground(card, country) {
  if (country.heroImage) {
    card.style.backgroundImage = `linear-gradient(180deg, rgba(15, 23, 42, 0.2), rgba(2, 6, 23, 0.82)), url("${country.heroImage}")`;
    card.style.backgroundSize = "cover";
    card.style.backgroundPosition = "center";
  } else {
    card.style.background = country.cardGradient;
  }
}

async function fetchCurrentUser() {
  if (!currentToken) {
    currentUser = null;
    favoriteCountryIds = new Set();
    updateAuthUi();
    return;
  }
  try {
    const meResponse = await fetch("/api/auth/me", { headers: authHeaders() });
    if (!meResponse.ok) {
      throw new Error("unauthorized");
    }
    const meData = await meResponse.json();
    currentUser = meData.user;

    const favoritesResponse = await fetch("/api/favorites", { headers: authHeaders() });
    if (favoritesResponse.ok) {
      const favoritesData = await favoritesResponse.json();
      favoriteCountryIds = new Set(favoritesData.favorites || []);
    }
  } catch (error) {
    currentToken = "";
    currentUser = null;
    favoriteCountryIds = new Set();
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
  updateAuthUi();
}

function setAuthMode(mode) {
  authMode = mode;
  const nameInput = document.getElementById("auth-name");
  const nameLabel = document.getElementById("name-label");
  const submitButton = document.getElementById("auth-submit");
  const switchModeButton = document.getElementById("auth-switch-mode");
  const title = document.getElementById("auth-title");
  if (!nameInput || !nameLabel || !submitButton || !switchModeButton || !title) {
    return;
  }

  const isRegister = mode === "register";
  nameInput.classList.toggle("hidden", !isRegister);
  nameLabel.classList.toggle("hidden", !isRegister);
  submitButton.textContent = isRegister ? "Зарегистрироваться" : "Войти";
  title.textContent = isRegister ? "Регистрация" : "Вход";
  switchModeButton.textContent = isRegister
    ? "Уже есть аккаунт? Войти"
    : "Нет аккаунта? Регистрация";
}

function toggleAuthModal(show) {
  const modal = document.getElementById("auth-modal");
  if (!modal) {
    return;
  }
  modal.classList.toggle("hidden", !show);
  if (show) {
    setAuthMode("login");
    showAuthError("");
    document.getElementById("auth-email")?.focus();
  }
}

function showAuthError(message) {
  const errorEl = document.getElementById("auth-error");
  if (!errorEl) {
    return;
  }
  if (!message) {
    errorEl.textContent = "";
    errorEl.classList.add("hidden");
    return;
  }
  errorEl.textContent = message;
  errorEl.classList.remove("hidden");
}

function showAuthSuccess(message) {
  const errorEl = document.getElementById("auth-error");
  if (!errorEl) {
    return;
  }
  errorEl.textContent = message;
  errorEl.style.color = "#bbf7d0";
  errorEl.classList.remove("hidden");
}

async function submitAuthForm(event) {
  event.preventDefault();
  showAuthError("");
  const errorEl = document.getElementById("auth-error");
  if (errorEl) {
    errorEl.style.color = "";
  }
  const email = document.getElementById("auth-email")?.value.trim();
  const password = document.getElementById("auth-password")?.value || "";
  const displayName = document.getElementById("auth-name")?.value.trim() || "";

  if (!email || !password) {
    showAuthError("Введите email и пароль");
    return;
  }

  if (authMode === "register") {
    if (!displayName) {
      showAuthError("Введите имя");
      return;
    }
    const registerResponse = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName })
    });
    const registerData = await registerResponse.json();
    if (!registerResponse.ok) {
      showAuthError(registerData.message || "Ошибка регистрации");
      return;
    }
    showAuthSuccess("Регистрация успешна. Теперь войдите в аккаунт.");
    setAuthMode("login");
    const passwordInput = document.getElementById("auth-password");
    if (passwordInput) {
      passwordInput.value = "";
      passwordInput.focus();
    }
    return;
  }

  const loginResponse = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const loginData = await loginResponse.json();
  if (!loginResponse.ok) {
    showAuthError(loginData.message || "Ошибка входа");
    return;
  }

  currentToken = loginData.token;
  localStorage.setItem(AUTH_TOKEN_KEY, currentToken);
  toggleAuthModal(false);
  await fetchCurrentUser();
  await loadCountries();
}

async function logout() {
  try {
    await fetch("/api/auth/logout", { method: "POST", headers: authHeaders() });
  } catch {}
  currentToken = "";
  currentUser = null;
  favoriteCountryIds = new Set();
  localStorage.removeItem(AUTH_TOKEN_KEY);
  updateAuthUi();
  await loadCountries();
}

async function toggleFavorite(countryId) {
  if (!currentUser) {
    alert("Сначала войдите в аккаунт");
    return;
  }
  const response = await fetch(`/api/favorites/${countryId}`, {
    method: "POST",
    headers: authHeaders()
  });
  const data = await response.json();
  if (!response.ok) {
    alert(data.message || "Не удалось обновить избранное");
    return;
  }
  if (data.isFavorite) {
    favoriteCountryIds.add(countryId);
  } else {
    favoriteCountryIds.delete(countryId);
  }
  await loadCountries();
}

async function loadCountries() {
  const grid = document.getElementById("countries-grid");

  try {
    const response = await fetch("/api/countries");
    if (!response.ok) {
      throw new Error("Fetch failed");
    }

    const countries = await response.json();
    grid.innerHTML = "";

    countries.forEach((country) => {
      const card = document.createElement("article");
      card.className = "country-card";
      applyCountryCardBackground(card, country);
      card.innerHTML = buildCountryCardMarkup(country, Boolean(currentUser));

      grid.appendChild(card);
    });

    grid.querySelectorAll(".fav-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const countryId = Number(button.dataset.countryId);
        toggleFavorite(countryId).catch(() => {
          alert("Ошибка обновления избранного");
        });
      });
    });

  } catch (error) {
    grid.innerHTML = "<p>Не удалось загрузить страны. Попробуйте позже.</p>";
  }
}

function initAboutTypewriter() {
  const el = document.getElementById("about-lead");
  const full = el?.dataset?.typewriterText?.trim();
  if (!el || !full) {
    return;
  }

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.textContent = full;
    return;
  }

  el.textContent = "";
  const typed = document.createElement("span");
  typed.className = "about-typed";
  const caret = document.createElement("span");
  caret.className = "about-caret";
  caret.setAttribute("aria-hidden", "true");
  caret.textContent = "|";
  el.appendChild(typed);
  el.appendChild(caret);

  const msPerChar = 11;
  let i = 0;

  function step() {
    if (i < full.length) {
      i += 1;
      typed.textContent = full.slice(0, i);
      window.setTimeout(step, msPerChar);
    } else {
      caret.remove();
    }
  }

  const section = document.getElementById("about");
  if (!section) {
    step();
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting) {
        observer.disconnect();
        step();
      }
    },
    { threshold: 0.22, rootMargin: "0px 0px -8% 0px" }
  );
  observer.observe(section);
}

function initPage() {
  initAboutTypewriter();

  setupNavUserMenu({
    getIsLoggedIn: () => Boolean(currentUser),
    onGuestClick: () => toggleAuthModal(true),
    onLogout: () => {
      logout().catch(() => {
        alert("Ошибка выхода");
      });
    }
  });

  document.querySelector('[data-close-auth="true"]')?.addEventListener("click", () => toggleAuthModal(false));
  document.getElementById("auth-switch-mode")?.addEventListener("click", () => {
    setAuthMode(authMode === "login" ? "register" : "login");
    showAuthError("");
  });
  document.getElementById("auth-form")?.addEventListener("submit", (event) => {
    submitAuthForm(event).catch(() => {
      showAuthError("Ошибка авторизации");
    });
  });

  setAuthMode("login");
  showAuthError("");

  fetchCurrentUser().then(() => loadCountries());
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPage);
} else {
  initPage();
}
