# ЛР №7. Блог-система на MongoDB (рівні 1–3)

Виконав: Кондратюк Дмитро Михайлович, група ІПЗ-33.

## Запуск
Потрібно: `mongod` 7+/8.x, `mongosh`, Node.js ≥ 18 (для порівняння — PostgreSQL 14+ з `pgbench`).

```bash
# 1. Дані та скрипти (з кореня проєкту); результати — у output/
./run_all.sh                       # BENCH_N=10000 ./run_all.sh — менший бенчмарк
# 2. Вебзастосунок + REST API
cd app && npm install && npm start # http://localhost:3000  (аналітика: /dashboard.html)
# 3. Порівняння з PostgreSQL
relational/run_pg.sh && node relational/merge_bench.js   # → output/10_comparison.md
```
Змінні: `MONGO_URL` (за замовчуванням `mongodb://localhost:27017`), `DB_NAME`, `PORT`.

## Структура
| Шлях | Зміст |
|---|---|
| `scripts/lib/schemas.js` | `$jsonSchema`-валідатори та індекси (єдине джерело) |
| `scripts/lib/generator.js`, `ukstem.js` | детермінований генератор даних (seed 7), стемер української |
| `scripts/01_setup … 03_seed` | рівень 1: колекції з валідацією, індекси, дані (20 користувачів, 10 категорій, 60 постів, 335 коментарів) |
| `scripts/04_aggregations`, `05_explain` | рівень 1: агрегації; ефект індексів |
| `scripts/06_level2.js` | теги, `$text`, лайки, пагінація `$facet`, перегляди, модерація |
| `scripts/07_level3.js` | версії, вкладені коментарі, сповіщення, геопошук, запити для аналітики |
| `scripts/08_consistency.js` | перевірка узгодженості денормалізованих лічильників |
| `scripts/09_benchmark.js` | вимірювання на 50 000 постів |
| `app/` | Express REST API (`src/`), кеш (`src/cache.js`), вебінтерфейс і дашборд (`public/`) |
| `relational/` | схема PostgreSQL, завантаження тих самих даних, запити, `pgbench` |
| `tests/` | перевірка даних проти валідаторів без БД, модульні тести |
| `report.md` | звіт |

## REST API
`GET /api/posts?q=&tags=a,b&tag_mode=all|any&category=&author=&from=&to=&sort=new|popular|rated|comments|old&page=&per_page=&lon=&lat=&radius_km=` ·
`GET|PUT|DELETE /api/posts/:id` · `POST /api/posts` · `GET /api/posts/:id/versions[/:n]` · `POST /api/posts/:id/versions/:n/restore` ·
`POST /api/posts/:id/reaction` · `POST /api/posts/:id/comments` · `PATCH /api/posts/:id/comments/:cid` · `GET /api/moderation/queue` ·
`GET /api/notifications`, `POST /api/notifications/read` · `GET /api/analytics/:name` · `GET /api/cache/stats`, `POST /api/cache/clear`.
Автентифікації немає: поточного користувача обирають у інтерфейсі, а його id передається в запитах (навчальне спрощення).

## Перевірка без MongoDB
`node tests/check_dataset.js` — усі документи проходять валідатори, вимоги до обсягу виконано; `node --test tests/unit.js`.
