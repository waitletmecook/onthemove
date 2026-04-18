const path = require("path");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, "data", "tourism.db");
require("fs").mkdirSync(path.join(__dirname, "data"), { recursive: true });

app.use(express.json());
app.use((req, res, next) => {
  if (String(req.originalUrl || "").startsWith("/api")) {
    res.set("Cache-Control", "no-store");
  }
  next();
});
app.use(express.static(path.join(__dirname, "public")));

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 14;

function createDb() {
  return new sqlite3.Database(DB_PATH);
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }
      resolve(this);
    });
  });
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(rows);
    });
  });
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(row);
    });
  });
}

function passwordMatchesStored(plain, stored) {
  return String(plain) === String(stored);
}

function parseStringArrayJson(value) {
  if (!value || typeof value !== "string") {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string" && item.trim()) : [];
  } catch {
    return [];
  }
}

function parseBearerToken(headerValue) {
  if (!headerValue || !headerValue.startsWith("Bearer ")) {
    return null;
  }
  return headerValue.slice("Bearer ".length).trim();
}

async function getAuthUser(req) {
  const token = parseBearerToken(req.headers.authorization);
  if (!token) {
    return null;
  }

  const db = createDb();
  try {
    const session = await get(
      db,
      `SELECT s.user_id AS userId, s.expires_at AS expiresAt, u.id, u.email, u.display_name AS displayName
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`,
      [token]
    );
    if (!session) {
      return null;
    }
    if (Date.now() > Number(session.expiresAt)) {
      await run(db, "DELETE FROM sessions WHERE token = ?", [token]);
      return null;
    }
    return { id: session.id, email: session.email, displayName: session.displayName, token };
  } finally {
    db.close();
  }
}

async function initializeDatabase() {
  const db = createDb();
  await run(db, "PRAGMA foreign_keys = ON");

  await run(
    db,
    `CREATE TABLE IF NOT EXISTS countries (
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
    )`
  );

  await run(
    db,
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      display_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  );

  await run(
    db,
    `CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  );

  await run(
    db,
    `CREATE TABLE IF NOT EXISTS favorites (
      user_id INTEGER NOT NULL,
      country_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, country_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE
    )`
  );

  const columns = await all(db, "PRAGMA table_info(countries)");
  const columnNames = new Set(columns.map((column) => column.name));
  if (!columnNames.has("hero_title")) {
    await run(db, "ALTER TABLE countries ADD COLUMN hero_title TEXT");
  }
  if (!columnNames.has("what_to_see")) {
    await run(db, "ALTER TABLE countries ADD COLUMN what_to_see TEXT");
  }
  if (!columnNames.has("tips")) {
    await run(db, "ALTER TABLE countries ADD COLUMN tips TEXT");
  }
  if (!columnNames.has("page_bg_images")) {
    await run(db, "ALTER TABLE countries ADD COLUMN page_bg_images TEXT");
  }

  const userColumns = await all(db, "PRAGMA table_info(users)");
  const userColumnNames = new Set(userColumns.map((column) => column.name));
  if (userColumnNames.has("password_hash") && !userColumnNames.has("password")) {
    await run(db, "ALTER TABLE users RENAME COLUMN password_hash TO password");
  }

  const existing = await all(db, "SELECT id FROM countries LIMIT 1");

  if (existing.length === 0) {
    const seedData = [
      ["Египет", "Пирамиды, Красное море", "Открой древнюю историю и теплый отдых у моря.", "linear-gradient(135deg, #7a4b2d, #c07a3f)", "/images/countries/egypt/hero.jpg", "Египет: земля фараонов", "[{\"title\":\"Пирамиды Гизы\",\"text\":\"Единственное из Семи чудес света, сохранившееся до наших дней.\",\"image\":\"/images/countries/egypt/giza.jpg\"},{\"title\":\"Луксорский храм\",\"text\":\"Грандиозный храмовый комплекс на берегу Нила.\",\"image\":\"/images/countries/egypt/luxor.jpg\"},{\"title\":\"Шарм-эль-Шейх\",\"text\":\"Курорт с лучшими местами для дайвинга и снорклинга.\",\"image\":\"/images/countries/egypt/sharm.jpg\"}]", "[\"Лучшее время для поездки - с октября по апрель.\",\"Торгуйтесь на рынках, цены для туристов часто завышены.\",\"Уважайте местные традиции и дресс-код у святынь.\"]"],
      ["Таиланд", "Пляжи, храмы, острова", "Экзотика, бирюзовая вода и насыщенная уличная кухня.", "linear-gradient(135deg, #007f8a, #3eb7b8)", "", "Таиланд: страна улыбок", "[]", "[]"],
      ["Китай", "Великая стена, мегаполисы", "Китай сочетает тысячелетнюю историю и ультрасовременные мегаполисы: от Великой стены и Запретного города до небоскрёбов Шанхая. Здесь можно прогуляться по древним улочкам, увидеть терракотовую армию и ощутить контраст между традиционными деревнями и ритмом больших городов.", "linear-gradient(135deg, #334f38, #5f7f52)", "/images/countries/china/hero.jpg", "Китай: великая стена и древние тайны", "[{\"title\":\"Великая Китайская стена\",\"text\":\"Одно из самых грандиозных сооружений в истории человечества.\",\"image\":\"/images/countries/china/great-wall.jpg\"},{\"title\":\"Запретный город, Пекин\",\"text\":\"Императорский дворец — сердце китайской культуры.\",\"image\":\"/images/countries/china/forbidden-city.jpg\"},{\"title\":\"Гуйлинь и карстовые горы\",\"text\":\"Живописные ландшафты, вдохновлявшие поэтов на протяжении веков.\",\"image\":\"/images/countries/china/guilin.jpg\"}]", "[\"Установите VPN до поездки: многие привычные сервисы в Китае недоступны.\",\"Выучите несколько фраз на китайском: вне туристических зон с английским бывает сложно.\",\"Пробуйте уличную еду на ночных рынках — выбирайте оживлённые лотки.\"]"],
      ["Франция", "Париж, Лазурный берег", "Франция сочетает искусство, моду и гастрономию: от парижских бульваров и музеев до лавандовых полей Прованса и виноградников. Каждый регион открывается по-своему — романтично, изысканно и по-настоящему неповторимо.", "linear-gradient(135deg, #18374f, #2f6d8f)", "/images/countries/france/hero.jpg", "Франция: искусство, мода, гастрономия", "[{\"title\":\"Эйфелева башня\",\"text\":\"Главный символ Франции и must-see для первого визита в Париж.\",\"image\":\"/images/countries/france/eiffel.jpg\"},{\"title\":\"Лазурный берег и Ницца\",\"text\":\"Роскошные пляжи, променады и средиземноморский шарм.\",\"image\":\"/images/countries/france/riviera.jpg\"},{\"title\":\"Замки Луары\",\"text\":\"Шедевры ренессансной архитектуры среди парков и реки.\",\"image\":\"/images/countries/france/loire.jpg\"}]", "[\"Бронируйте столики в ресторанах заранее — особенно вечером и в выходные.\",\"В Париже удобно пользоваться метро: купите пакет билетов или проездной на несколько дней.\",\"Многие музеи в первое воскресенье месяца входят бесплатно — уточняйте расписание.\"]"],
      ["Япония", "Токио, сакура, традиции", "Япония — это контраст футуристического Токио и древнего Киото: неоновые кварталы и тихие храмы, сакура у Фудзи и чайные церемонии. Здесь современность и традиции соседствуют так близко, что каждый день похож на путешествие во времени.", "linear-gradient(135deg, #3f3f57, #7b6a83)", "/images/countries/japan/hero.jpg", "Япония: традиции и футуризм", "[{\"title\":\"Токио: Сибуя и Асакуса\",\"text\":\"Самый оживлённый перекрёсток мира и древний храм Сэнсо-дзи.\",\"image\":\"/images/countries/japan/tokyo.jpg\"},{\"title\":\"Киото\",\"text\":\"Тысячи красных тории, уходящих в гору.\",\"image\":\"/images/countries/japan/kyoto.jpg\"},{\"title\":\"Гора Фудзи\",\"text\":\"Классический вид, особенно красив весной в сезон сакуры.\",\"image\":\"/images/countries/japan/fuji.jpg\"}]", "[\"Оформите JR Pass заранее, если планируете поезда по стране — так обычно выгоднее.\",\"В храмах и святилищах ведите себя тише, не трогайте святыни и следуйте указателям.\",\"Выучите несколько фраз по-японски — даже «спасибо» и «здравствуйте» помогают в общении.\"]"],
      ["Италия", "Рим, Флоренция, Венеция", "Италия — страна, где античность встречается с современностью. От руин Рима до каналов Венеции, от холмов Тосканы до побережья Амальфи. Это родина пиццы, пасты и лучшего кофе.", "linear-gradient(135deg, #8d5a48, #b98764)", "/images/countries/italy/hero.jpg", "Италия: солнце, искусство и вкус жизни", "[{\"title\":\"Колизей, Рим\",\"text\":\"Символ Вечного города, древний амфитеатр.\",\"image\":\"/images/countries/italy/colosseum.jpg\"},{\"title\":\"Галерея Уффици, Флоренция\",\"text\":\"Шедевры Боттичелли, Леонардо и Рафаэля.\",\"image\":\"/images/countries/italy/uffizi.jpg\"},{\"title\":\"Каналы Венеции\",\"text\":\"Гондолы, мост Риальто и романтика.\",\"image\":\"/images/countries/italy/venice.jpg\"}]", "[\"Бронируйте билеты в музеи онлайн заранее — очереди огромные.\",\"В ресторанах избегайте туристических мест: ищите, где обедают местные.\",\"Капучино пьют только до обеда, эспрессо — в любое время.\"]"]
    ];

    for (const country of seedData) {
      await run(
        db,
        "INSERT INTO countries (name, subtitle, description, card_gradient, hero_image, hero_title, what_to_see, tips) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        country
      );
    }
  }

  db.close();
}

app.get("/api/countries", async (req, res) => {
  const db = createDb();
  try {
    const rows = await all(
      db,
      `SELECT id, name, subtitle, description, card_gradient AS cardGradient, hero_image AS heroImage
       FROM countries
       ORDER BY id`
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: "Ошибка получения стран" });
  } finally {
    db.close();
  }
});

app.get("/api/countries/:id", async (req, res) => {
  const { id } = req.params;
  const db = createDb();
  try {
    const row = await get(
      db,
      `SELECT id, name, subtitle, description, card_gradient AS cardGradient, hero_image AS heroImage,
              COALESCE(hero_title, name) AS heroTitle, COALESCE(what_to_see, '[]') AS whatToSee,
              COALESCE(tips, '[]') AS tips, page_bg_images AS pageBgImagesJson
       FROM countries
       WHERE id = ?`,
      [id]
    );
    if (!row) {
      res.status(404).json({ message: "Страна не найдена" });
      return;
    }

    const { pageBgImagesJson, ...rest } = row;
    res.json({
      ...rest,
      pageBgImages: parseStringArrayJson(pageBgImagesJson),
      whatToSee: JSON.parse(row.whatToSee || "[]"),
      tips: JSON.parse(row.tips || "[]")
    });
  } catch (error) {
    res.status(500).json({ message: "Ошибка получения страны" });
  } finally {
    db.close();
  }
});

function authSqliteMessage(error, actionLabel) {
  const label = actionLabel || "регистрации";
  if (!error || !error.message) {
    return `Ошибка ${label}`;
  }
  if (error.message.includes("no column named")) {
    return `Ошибка ${label}. Перезапустите сервер (остановите и снова запустите npm run dev или node server.js), затем попробуйте ещё раз.`;
  }
  return `Ошибка ${label}`;
}

app.post("/api/auth/register", async (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const { email, password, displayName } = body;
  if (!email || !password || !displayName) {
    res.status(400).json({ message: "Заполните email, пароль и имя" });
    return;
  }
  if (String(password).length < 6) {
    res.status(400).json({ message: "Пароль должен быть минимум 6 символов" });
    return;
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const db = createDb();
  try {
    const existing = await get(db, "SELECT id FROM users WHERE email = ?", [normalizedEmail]);
    if (existing) {
      res.status(409).json({ message: "Пользователь с таким email уже существует" });
      return;
    }
    const result = await run(
      db,
      "INSERT INTO users (email, password, display_name) VALUES (?, ?, ?)",
      [normalizedEmail, String(password), String(displayName).trim()]
    );
    res.status(201).json({ id: result.lastID, email: normalizedEmail, displayName: String(displayName).trim() });
  } catch (error) {
    console.error("register error:", error);
    res.status(500).json({ message: authSqliteMessage(error, "регистрации") });
  } finally {
    db.close();
  }
});

app.post("/api/auth/login", async (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const { email, password } = body;
  if (!email || !password) {
    res.status(400).json({ message: "Введите email и пароль" });
    return;
  }

  const db = createDb();
  try {
    const user = await get(
      db,
      "SELECT id, email, password, display_name AS displayName FROM users WHERE email = ?",
      [String(email).trim().toLowerCase()]
    );
    if (!user || !passwordMatchesStored(password, user.password)) {
      res.status(401).json({ message: "Неверный email или пароль" });
      return;
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = Date.now() + TOKEN_TTL_MS;
    await run(db, "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)", [token, user.id, expiresAt]);

    res.json({
      token,
      user: { id: user.id, email: user.email, displayName: user.displayName }
    });
  } catch (error) {
    console.error("login error:", error);
    res.status(500).json({ message: authSqliteMessage(error, "входа") });
  } finally {
    db.close();
  }
});

app.get("/api/auth/me", async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) {
    res.status(401).json({ message: "Требуется вход" });
    return;
  }
  res.json({ user: { id: user.id, email: user.email, displayName: user.displayName } });
});

app.post("/api/auth/logout", async (req, res) => {
  const token = parseBearerToken(req.headers.authorization);
  if (!token) {
    res.status(200).json({ ok: true });
    return;
  }
  const db = createDb();
  try {
    await run(db, "DELETE FROM sessions WHERE token = ?", [token]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: "Ошибка выхода" });
  } finally {
    db.close();
  }
});

app.get("/api/favorites", async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) {
    res.status(401).json({ message: "Требуется вход" });
    return;
  }
  const db = createDb();
  try {
    const rows = await all(db, "SELECT country_id AS countryId FROM favorites WHERE user_id = ?", [user.id]);
    res.json({ favorites: rows.map((row) => row.countryId) });
  } catch (error) {
    res.status(500).json({ message: "Ошибка получения избранного" });
  } finally {
    db.close();
  }
});

app.post("/api/favorites/:countryId", async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) {
    res.status(401).json({ message: "Требуется вход" });
    return;
  }
  const countryId = Number(req.params.countryId);
  if (!Number.isInteger(countryId) || countryId <= 0) {
    res.status(400).json({ message: "Некорректная страна" });
    return;
  }

  const db = createDb();
  try {
    const country = await get(db, "SELECT id FROM countries WHERE id = ?", [countryId]);
    if (!country) {
      res.status(404).json({ message: "Страна не найдена" });
      return;
    }
    const existing = await get(db, "SELECT 1 FROM favorites WHERE user_id = ? AND country_id = ?", [user.id, countryId]);
    if (existing) {
      await run(db, "DELETE FROM favorites WHERE user_id = ? AND country_id = ?", [user.id, countryId]);
      res.json({ isFavorite: false });
      return;
    }
    await run(db, "INSERT INTO favorites (user_id, country_id) VALUES (?, ?)", [user.id, countryId]);
    res.json({ isFavorite: true });
  } catch (error) {
    res.status(500).json({ message: "Ошибка обновления избранного" });
  } finally {
    db.close();
  }
});

app.post("/api/countries", async (req, res) => {
  const { name, subtitle, description, cardGradient, heroImage, heroTitle, whatToSee, tips, pageBgImages } =
    req.body;
  if (!name || !subtitle || !description || !cardGradient) {
    res.status(400).json({ message: "Заполните все поля" });
    return;
  }

  const pageBgList = Array.isArray(pageBgImages) ? pageBgImages.filter((u) => typeof u === "string" && u.trim()) : [];

  const db = createDb();
  try {
    const result = await run(
      db,
      "INSERT INTO countries (name, subtitle, description, card_gradient, hero_image, hero_title, what_to_see, tips, page_bg_images) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        name,
        subtitle,
        description,
        cardGradient,
        heroImage || "",
        heroTitle || name,
        JSON.stringify(Array.isArray(whatToSee) ? whatToSee : []),
        JSON.stringify(Array.isArray(tips) ? tips : []),
        pageBgList.length ? JSON.stringify(pageBgList) : null
      ]
    );

    res.status(201).json({
      id: result.lastID,
      name,
      subtitle,
      description,
      cardGradient,
      heroImage: heroImage || "",
      heroTitle: heroTitle || name,
      whatToSee: Array.isArray(whatToSee) ? whatToSee : [],
      tips: Array.isArray(tips) ? tips : [],
      pageBgImages: pageBgList
    });
  } catch (error) {
    res.status(500).json({ message: "Не удалось добавить страну" });
  } finally {
    db.close();
  }
});

app.get("/country/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "country.html"));
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Tourism app started: http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Database initialization error:", error);
    process.exit(1);
  });
