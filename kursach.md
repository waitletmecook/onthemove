# Полный разбор проекта (актуальное состояние)

## 1) Актуальная структура SQLite и точные `CREATE TABLE`

Наша база: `data/tourism.db`.

Ниже SQL в том виде, в каком таблицы создаются в `server.js`.

### Таблица `countries`

```sql
CREATE TABLE IF NOT EXISTS countries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  subtitle TEXT NOT NULL,
  description TEXT NOT NULL,
  card_gradient TEXT NOT NULL,
  hero_image TEXT,
  hero_title TEXT,
  what_to_see TEXT,
  tips TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

### Таблица `users`

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

### Таблица `favorites`

```sql
CREATE TABLE IF NOT EXISTS favorites (
  user_id INTEGER NOT NULL,
  country_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, country_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE
)
```

### Таблица `sessions` (тоже участвует в авторизации)

```sql
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)
```

---

## 2) Как таблицы связаны между собой (простым языком)

- `users` — это пользователи.
- `countries` — это страны.
- `favorites` — связующая таблица «какой пользователь добавил какую страну в избранное».
  - `favorites.user_id -> users.id`
  - `favorites.country_id -> countries.id`
- `sessions` — активные логин-сессии пользователя:
  - `sessions.user_id -> users.id`

`ON DELETE CASCADE` означает: если удалить пользователя или страну, связанные записи в `favorites`/`sessions` удалятся автоматически.

---

## 3) Авторизация — максимально подробно, но простым языком

## 3.1 Как работает регистрация

Маршрут: `POST /api/auth/register`

Поток:
1. Сервер читает `email`, `password`, `displayName` из JSON.
2. Проверяет обязательные поля и минимальную длину пароля (>= 6).
3. Нормализует email (`trim + toLowerCase`).
4. Проверяет, что такого email еще нет.
5. Записывает пользователя в таблицу `users`.

### Хэшируются ли пароли?

**Сейчас — нет.**  
В текущем коде пароли сохраняются в БД как обычный текст в `password_hash`.

То есть:
- `bcrypt` не используется;
- `scrypt`/другой алгоритм сейчас тоже не используется.

(Это упрощенный учебный режим, не production-практика.)

---

## 3.2 Что происходит при входе (логине)

Маршрут: `POST /api/auth/login`

Поток:
1. По email ищется пользователь в `users`.
2. Сервер сравнивает введенный пароль с тем, что в БД (прямое строковое сравнение).
3. Если пароль верный:
   - генерируется случайный токен (`crypto.randomBytes(32).toString("hex")`);
   - создается запись в `sessions` с `token`, `user_id`, `expires_at`.
4. Клиент получает JSON с `token` и данными пользователя.

Сервер понимает, что пароль верный, потому что сейчас делает:

```js
function verifyPassword(password, storedHash) {
  return String(password) === String(storedHash);
}
```

---

## 3.3 Как мы "запоминаем" пользователя после входа

Схема гибридная:

- **На сервере**: хранится сессия в таблице `sessions` (token + user_id + срок жизни).
- **На клиенте**: token хранится в `localStorage` (`tourism_auth_token`).
- В каждый защищенный запрос клиент отправляет:
  - `Authorization: Bearer <token>`

Это **не** `express-session` и **не** JWT.  
Это кастомный bearer-токен + сессия в БД.

---

## 3.4 Ключевые куски кода (backend + frontend)

### Backend: регистрация

```js
app.post("/api/auth/register", async (req, res) => {
  const { email, password, displayName } = req.body;
  // ...валидация...
  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = await get(db, "SELECT id FROM users WHERE email = ?", [normalizedEmail]);
  // ...если есть — 409...
  await run(
    db,
    "INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)",
    [normalizedEmail, String(password), String(displayName).trim()]
  );
});
```

### Backend: логин

```js
app.post("/api/auth/login", async (req, res) => {
  const user = await get(
    db,
    "SELECT id, email, password_hash AS passwordHash, display_name AS displayName FROM users WHERE email = ?",
    [String(email).trim().toLowerCase()]
  );
  if (!user || !verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ message: "Неверный email или пароль" });
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  await run(db, "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)", [token, user.id, expiresAt]);
  res.json({ token, user: { id: user.id, email: user.email, displayName: user.displayName } });
});
```

### Frontend: сохранение токена

```js
currentToken = loginData.token;
localStorage.setItem(AUTH_TOKEN_KEY, currentToken);
```

### Frontend: отправка токена в API

```js
function authHeaders() {
  return currentToken ? { Authorization: `Bearer ${currentToken}` } : {};
}
```

---

## 4) Как технически работает "Добавить в избранное"

Путь данных:

1. Пользователь нажимает кнопку `☆ В избранное` на карточке.
2. Фронтенд вызывает:
   - `fetch('/api/favorites/:countryId', { method: 'POST', headers: authHeaders() })`
3. Сервер:
   - проверяет токен (`getAuthUser(req)`),
   - проверяет, что страна существует,
   - если уже есть в `favorites` — удаляет (toggle off),
   - если нет — вставляет (toggle on).
4. В таблицу `favorites` пишется:
   - `user_id`
   - `country_id`
   - `created_at` автоматически.

### Ключевой backend-код toggle

```js
app.post("/api/favorites/:countryId", async (req, res) => {
  const user = await getAuthUser(req);
  const countryId = Number(req.params.countryId);
  const existing = await get(db, "SELECT 1 FROM favorites WHERE user_id = ? AND country_id = ?", [user.id, countryId]);
  if (existing) {
    await run(db, "DELETE FROM favorites WHERE user_id = ? AND country_id = ?", [user.id, countryId]);
    res.json({ isFavorite: false });
    return;
  }
  await run(db, "INSERT INTO favorites (user_id, country_id) VALUES (?, ?)", [user.id, countryId]);
  res.json({ isFavorite: true });
});
```

### Ключевой frontend-вызов

```js
const response = await fetch(`/api/favorites/${countryId}`, {
  method: "POST",
  headers: authHeaders()
});
```

---

## 5) Полная сводка маршрутов backend (`server.js`)

- `GET /api/countries` — возвращает список стран для главной.
- `GET /api/countries/:id` — возвращает детальную страну (описание, места, советы).
- `POST /api/countries` — добавляет новую страну.
- `POST /api/auth/register` — регистрирует нового пользователя.
- `POST /api/auth/login` — логинит пользователя и создает сессию с bearer-токеном.
- `GET /api/auth/me` — возвращает текущего пользователя по токену.
- `POST /api/auth/logout` — завершает текущую сессию (удаляет token из `sessions`).
- `GET /api/favorites` — возвращает список `countryId` избранных стран текущего пользователя.
- `POST /api/favorites/:countryId` — добавляет/удаляет страну в избранном (toggle).
- `GET /country/:id` — отдает HTML детальной страницы страны.

---

## 6) Самый важный кусок фронтенда: рендер карточек стран

Ключевая логика в `public/app.js`: `loadCountries()`.

### Как фронтенд получает данные

```js
const response = await fetch("/api/countries");
const countries = await response.json();
```

### Как превращает JSON в HTML-карточки

```js
countries.forEach((country) => {
  const card = document.createElement("article");
  card.className = "country-card";
  applyCountryCardBackground(card, country);
  card.innerHTML = buildCountryCardMarkup(country, Boolean(currentUser));
  grid.appendChild(card);
});
```

То есть фронтенд:
1. получает массив стран;
2. создает для каждой DOM-элемент;
3. подставляет фон, название, описание, ссылку и кнопку избранного;
4. добавляет карточки в контейнер.

---

## 7) Три сложных/интересных технических решения для защиты

### 1) Кастомная token-based сессия через SQLite

Почему интересно: это не готовый `express-session`, а свой легкий механизм:
- генерация токена;
- хранение в `sessions`;
- проверка `Authorization: Bearer ...`.

Что говорить на защите:
«Я реализовала минимальную, но полноценную авторизацию с хранением сессии на сервере и токена на клиенте».

### 2) Toggle-логика избранного в одном endpoint

Почему интересно:
- один маршрут и для добавления, и для удаления;
- сервер сам решает действие по наличию записи.

Что говорить:
«Это упростило API и фронтенд: одна кнопка и один endpoint для двух состояний».

### 3) Инициализация БД + легкая миграция при старте

Почему интересно:
- при запуске сервер сам создает таблицы;
- при необходимости добавляет колонки;
- проект запускается “из коробки”.

Что говорить:
«Я сделала самодостаточный старт приложения без ручной подготовки схемы БД».

---

## 8) Важное замечание для комиссии (честно и профессионально)

В текущей версии пароль хранится в базе в открытом виде (упрощение для учебного проекта по вашему ТЗ).  
Если на защите это спросят, корректный ответ:

«Да, это осознанное упрощение учебной версии. Для production нужно вернуть хэширование (например, `bcrypt`) и хранить только хэши».
