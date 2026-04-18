const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const path = require("path");

const dbPath = path.join(__dirname, "..", "data", "tourism.db");
const publicRoot = path.join(__dirname, "..", "public");

const bgBySlug = {
  egypt: "/images/countries/egypt/bg-1.jpg",
  thailand: "/images/countries/thailand/bg-3.jpg",
  china: "/images/countries/china/bg-4.jpg",
  france: "/images/countries/france/bg-5.jpg",
  japan: "/images/countries/japan/bg-6.jpg",
  italy: "/images/countries/italy/bg-7.jpg"
};

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this);
    });
  });
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

function heroToSlug(heroImage) {
  const s = String(heroImage || "");
  const needle = "/countries/";
  const i = s.indexOf(needle);
  if (i < 0) {
    return null;
  }
  return s.slice(i + needle.length).split("/")[0] || null;
}

async function main() {
  const db = new sqlite3.Database(dbPath);
  try {
    await new Promise((resolve, reject) => {
      db.run("ALTER TABLE countries ADD COLUMN page_bg_images TEXT", (err) => {
        if (err && !String(err.message).includes("duplicate column")) {
          reject(err);
          return;
        }
        resolve();
      });
    });

    const rows = await all(db, "SELECT id, name, hero_image FROM countries ORDER BY id");
    for (const row of rows) {
      const slug = heroToSlug(row.hero_image);
      const url = slug && bgBySlug[slug];
      if (!url) {
        console.log("skip (no map)", row.id, row.name, slug || "(no slug)");
        continue;
      }
      const rel = url.replace(/^\//, "");
      const disk = path.join(publicRoot, ...rel.split("/"));
      if (!fs.existsSync(disk)) {
        console.warn("MISSING file", row.name, disk);
        continue;
      }
      await run(db, "UPDATE countries SET page_bg_images = ? WHERE id = ?", [
        JSON.stringify([url]),
        row.id
      ]);
      console.log("OK", row.id, row.name, url);
    }
  } finally {
    db.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
