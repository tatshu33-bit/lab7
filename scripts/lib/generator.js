// Детермінований генератор реалістичних даних для блог-системи (ТехноБлог).
// Працює і в mongosh (load), і в Node (require): однакові seed → однакові дані в MongoDB та PostgreSQL.
//   const ds = generateDataset(newId, { seed: 7, postCount: 60 });
// newId — функція, що повертає новий ObjectId (у Node-тестах — штучний).
var _uk = (typeof ukStemText === "function") ? { ukStemText: ukStemText } : require("./ukstem.js");

var GEN = (function () {
  var DAY = 24 * 3600 * 1000;
  var NOW = Date.UTC(2026, 10, 18, 12, 0, 0); // «поточний момент» набору даних (фіксований для відтворюваності)

  // mulberry32 — маленький детермінований ГПВЧ
  function makeRng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var TRANSLIT = { а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie", ж: "zh", з: "z", и: "y", і: "i", ї: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ю: "iu", я: "ia", ь: "" };
  function slugify(text, maxLen) {
    var s = String(text).toLowerCase().replace(/['’ʼ]/g, "").split("").map(function (ch) { return TRANSLIT[ch] !== undefined ? TRANSLIT[ch] : ch; }).join("");
    s = s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (s.length > maxLen) s = s.slice(0, maxLen).replace(/-[^-]*$/, "");
    return s;
  }

  var USERS = [
    ["oleksandr_kovalenko", "Олександр Коваленко", "admin"], ["iryna_shevchenko", "Ірина Шевченко", "admin"],
    ["andrii_melnyk", "Андрій Мельник", "author"], ["olena_bondarenko", "Олена Бондаренко", "author"],
    ["dmytro_tkachenko", "Дмитро Ткаченко", "author"], ["natalia_kravchenko", "Наталія Кравченко", "author"],
    ["serhii_oliynyk", "Сергій Олійник", "author"], ["kateryna_shevchuk", "Катерина Шевчук", "author"],
    ["volodymyr_polishchuk", "Володимир Поліщук", "author"], ["yulia_lysenko", "Юлія Лисенко", "author"],
    ["maksym_bondar", "Максим Бондар", "author"], ["anna_moroz", "Анна Мороз", "author"],
    ["taras_savchenko", "Тарас Савченко", "reader"], ["oksana_rudenko", "Оксана Руденко", "reader"],
    ["bohdan_marchenko", "Богдан Марченко", "reader"], ["viktoriia_petrenko", "Вікторія Петренко", "reader"],
    ["ihor_hnatiuk", "Ігор Гнатюк", "reader"], ["svitlana_yakovenko", "Світлана Яковенко", "reader"],
    ["roman_kuzmenko", "Роман Кузьменко", "reader"], ["mariia_pavlenko", "Марія Павленко", "reader"]
  ];
  var SUSPENDED = "roman_kuzmenko"; // один користувач призупинений — не коментує
  var BIOS = {
    admin: "Адміністратор платформи, відповідаю за модерацію та якість матеріалів.",
    author: "Пишу про розробку програмного забезпечення та ділюся практичним досвідом.",
    reader: "Читаю технічні блоги, іноді залишаю коментарі."
  };

  // [назва, slug, опис, батьківська slug, терміни]
  var CATEGORIES = [
    ["Веброзробка", "web-development", "Статті про веброзробку", null, ["React", "Vue", "Node.js", "TypeScript", "Next.js", "Webpack", "CSS Grid", "GraphQL"]],
    ["Мобільні додатки", "mobile-apps", "Розробка мобільних додатків", null, ["Flutter", "Kotlin", "SwiftUI", "React Native", "Jetpack Compose", "Firebase"]],
    ["Бази даних", "databases", "NoSQL та SQL бази даних", null, ["MongoDB", "PostgreSQL", "Redis", "Elasticsearch", "Cassandra", "SQLite"]],
    ["DevOps", "devops", "Автоматизація та CI/CD", null, ["Docker", "Kubernetes", "GitHub Actions", "Terraform", "Ansible", "Prometheus"]],
    ["Штучний інтелект", "ai", "ML та AI технології", null, ["PyTorch", "TensorFlow", "scikit-learn", "LangChain", "Hugging Face", "Pandas"]],
    ["Хмарні технології", "cloud", "AWS, Azure, Google Cloud", null, ["AWS Lambda", "Azure Functions", "Google Cloud Run", "Amazon S3", "CloudFront", "Serverless"]],
    ["Безпека", "security", "Кібербезпека та захист даних", null, ["OAuth 2.0", "JWT", "OWASP Top 10", "TLS", "Keycloak", "HashiCorp Vault"]],
    ["UX/UI", "ux-ui", "Дизайн інтерфейсів", null, ["Figma", "Design Systems", "Accessibility", "Tailwind CSS", "Material Design", "Прототипування"]],
    ["Архітектура ПЗ", "architecture", "Patterns та Best Practices", null, ["Microservices", "CQRS", "Event Sourcing", "Clean Architecture", "Apache Kafka", "DDD"]],
    ["Тестування", "testing", "Методології тестування", "architecture", ["Jest", "Cypress", "Playwright", "JUnit", "Pytest", "Selenium"]]
  ];
  var GENERIC_TAGS = ["новачкам", "практика", "продуктивність", "best-practices", "огляд", "досвід", "безпека", "оптимізація"];

  var CITIES = [
    ["Київ", 30.5234, 50.4501], ["Львів", 24.0316, 49.8397], ["Харків", 36.2304, 49.9935], ["Одеса", 30.7233, 46.4825],
    ["Дніпро", 35.0462, 48.4647], ["Луцьк", 25.3254, 50.7472], ["Івано-Франківськ", 24.7097, 48.9226], ["Вінниця", 28.4682, 49.2328],
    ["Полтава", 34.5514, 49.5883], ["Чернівці", 25.9358, 48.2921], ["Запоріжжя", 35.139, 47.8388], ["Ужгород", 22.2945, 48.6208],
    ["Рівне", 26.2516, 50.6199], ["Тернопіль", 25.5948, 49.5535], ["Житомир", 28.6587, 50.2547]
  ];

  var TITLES = [
    function (T) { return T + ": практичний посібник для початківців"; },
    function (T) { return "Типові помилки при роботі з " + T; },
    function (T) { return T + " у продакшені: досвід команди"; },
    function (T) { return "Як ми прискорили проєкт за допомогою " + T; },
    function (T, U) { return T + " чи " + U + ": що обрати для нового проєкту"; },
    function (T) { return "Чому варто звернути увагу на " + T; },
    function (T) { return T + ": п'ять порад, які заощадять вам час"; },
    function (T) { return "Огляд можливостей " + T + ": що нового"; }
  ];
  var INTRO = [
    "Останнім часом {T} все частіше з'являється в проєктах українських команд, і це не випадково.",
    "Якщо ви тільки починаєте знайомство з {T}, ця стаття допоможе швидко зорієнтуватися.",
    "Ми працюємо з {T} понад два роки та зібрали набір практичних спостережень.",
    "Про {T} багато говорять, але реальний досвід застосування помітно відрізняється від рекламних обіцянок.",
    "У цій статті розглянемо, як {T} працює на практиці та де його варто застосовувати.",
    "Розробники часто питають, з чого почати роботу з {T}, тож зберемо основне в одному місці."
  ];
  var BODY = [
    "Перше, на що варто звернути увагу, — це налаштування середовища: чітка конфігурація економить години під час командної роботи.",
    "У нашому проєкті впровадження {T} скоротило час виконання типових завдань приблизно на {P}%.",
    "Не варто одразу переносити весь код: почніть з одного невеликого модуля й оцініть результат.",
    "Документація {T} докладна, проте приклади з реальних проєктів допомагають краще зрозуміти нюанси.",
    "Типова помилка — ігнорувати моніторинг: без метрик неможливо зрозуміти, чи справді {T} покращив систему.",
    "Для командної роботи корисно домовитися про єдині правила використання {T} та описати їх у репозиторії.",
    "Автоматичні тести значно знижують ризик регресій під час оновлення {T} до нових версій.",
    "Окремо зазначимо вплив на продуктивність: після оптимізації навантаження зменшилося на {P}%, а відгук системи став стабільнішим.",
    "Спільнота навколо {T} активна, тому відповіді на складні запитання зазвичай можна знайти за кілька хвилин.",
    "Перед вибором інструмента порівняйте вартість підтримки, а не лише швидкість першого запуску.",
    "Ми також порахували витрати: перехід на {T} окупився приблизно за {M} міс.",
    "Корисно вести внутрішній журнал рішень: через пів року він допомагає зрозуміти, чому було обрано саме {T}.",
    "Для безпеки не забувайте оновлювати залежності та перевіряти їх на відомі вразливості.",
    "Читабельність конфігурації не менш важлива, ніж швидкодія, тому дотримуйтеся єдиного стилю.",
    "Практика показує: найкращі результати дають короткі ітерації та регулярний зворотний зв'язок від колег.",
    "Окремий розділ внутрішнього гайдлайну присвячено типовим пасткам {T}, і ним користуються всі нові учасники команди."
  ];
  var VS = "Порівняно з {U}, {T} має інший баланс між простотою та гнучкістю, і це впливає на вибір під конкретну задачу.";
  var OUTRO = [
    "Підсумовуючи, {T} вартий уваги, якщо ви готові інвестувати час у налаштування й навчання команди.",
    "Загалом {T} — зручний інструмент, але не панацея: оцінюйте його під власні задачі.",
    "Сподіваємося, ці спостереження допоможуть вам ухвалити зважене рішення щодо {T}.",
    "Діліться власним досвідом у коментарях — нам цікаво, як {T} працює у ваших проєктах."
  ];
  var COMMENTS_TOP = [
    "Дякую за статтю, дуже вчасно для нашого проєкту.",
    "Цікавий погляд на {T}. Чи пробували ви його в поєднанні з іншими інструментами?",
    "Погоджуюся з автором: без моніторингу всі ці оптимізації мало що дають.",
    "Було б чудово побачити окрему статтю з прикладами коду.",
    "У нас схожий досвід із {T}, лише терміни окупності були довшими.",
    "Корисні поради, збережу до закладок.",
    "Не зовсім згоден із частиною про тестування, але загалом матеріал сильний.",
    "Дуже доступно пояснено, особливо для початківців.",
    "А як щодо вартості підтримки у великих командах?",
    "Чекаю продовження серії про {T}.",
    "Дякую, що поділилися цифрами — рідко хто наводить реальні вимірювання.",
    "Хотілося б більше деталей про налаштування середовища.",
    "Підкажіть, будь ласка, які версії {T} ви використовували?",
    "Класна стаття, поділився з колегами в нашому чаті.",
    "Тут варто було б згадати і про безпеку, але в цілому чудово."
  ];
  var COMMENTS_REPLY = [
    "Дякую за відгук! Так, ми пробували — результати описано в наступній статті.",
    "Згоден, моніторинг справді критичний.",
    "Це гарна ідея, візьму до уваги для наступного матеріалу.",
    "Версії вказано в розділі про налаштування, але уточню в тексті.",
    "Дякую, що стаття стала вам у пригоді.",
    "Цікаве зауваження, у нас було інакше, але це залежить від навантаження.",
    "Підтримую, у нашій команді було те саме.",
    "Так, вартість підтримки — ключовий фактор, тому ми й рахували її окремо."
  ];
  var COMMENTS_SPAM = [
    "Заробіток в інтернеті без вкладень, пишіть у месенджер!",
    "Купуйте дешеві підписки за посиланням у моєму профілі!",
    "Автор нічого не розуміє в темі, читати це марно."
  ];
  var CHANGE_NOTES = ["Виправлено друкарські помилки", "Додано приклади та уточнено терміни", "Оновлено висновки", "Доповнено розділ про продуктивність", "Змінено заголовок"];

  function fill(tpl, vars) {
    return tpl.replace(/\{(\w)\}/g, function (_, k) {
      if (k === "P") return String(15 + Math.floor(vars.r() * 50));
      if (k === "M") return String(2 + Math.floor(vars.r() * 6));
      return vars[k];
    });
  }
  // вибірка без повторів (часткове перемішування Фішера–Йетса)
  function sample(r, arr, n) {
    var a = arr.slice();
    for (var i = 0; i < n; i++) { var j = i + Math.floor(r() * (a.length - i)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a.slice(0, n);
  }

  // ---------- контекст: користувачі, категорії ----------
  function createContext(newId, seed) {
    var r = makeRng(seed * 7919 + 1);
    var CH = "./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    var users = USERS.map(function (u, i) {
      var hash = "$2b$10$";
      for (var k = 0; k < 53; k++) hash += CH[Math.floor(r() * CH.length)]; // імітація 60-символьного bcrypt-хешу (демо-дані)
      var created = NOW - (60 + r() * 300) * DAY;
      return {
        _id: newId(), username: u[0], email: u[0] + "@blog.ua", password_hash: hash, role: u[2],
        profile: {
          full_name: u[1], bio: BIOS[u[2]],
          avatar_url: "https://api.dicebear.com/9.x/avataaars/svg?seed=" + u[0],
          website: i % 3 === 0 ? "https://" + u[0].replace(/_/g, "-") + ".dev.ua" : null
        },
        statistics: { posts_count: 0, comments_count: 0 },
        created_at: new Date(created), last_login: new Date(NOW - r() * 25 * DAY),
        status: u[0] === SUSPENDED ? "suspended" : "active"
      };
    });
    var catIdBySlug = {};
    var categories = CATEGORIES.map(function (c) {
      var id = newId(); catIdBySlug[c[1]] = id;
      return { _id: id, name: c[0], slug: c[1], description: c[2], parent_id: null, statistics: { posts_count: 0 }, created_at: new Date(NOW - 400 * DAY) };
    });
    CATEGORIES.forEach(function (c, i) { if (c[3]) categories[i].parent_id = catIdBySlug[c[3]]; });
    return {
      newId: newId, seed: seed, users: users, categories: categories,
      admins: users.filter(function (u) { return u.role === "admin"; }),
      authors: users.filter(function (u) { return u.role === "author"; }),
      commenters: users.filter(function (u) { return u.status === "active"; })
    };
  }

  function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }
  function userRef(u) { return { user_id: u._id, username: u.username }; }
  function tagSlug(term) { return term.toLowerCase().replace(/[^a-z0-9а-яіїєґ]+/g, "-").replace(/^-+|-+$/g, ""); }

  // ---------- один пост з усім пов'язаним (кожен пост має власний ГПВЧ → можна генерувати порціями) ----------
  function makePost(ctx, i, opts) {
    opts = opts || {};
    var lite = !!opts.lite;
    var r = makeRng(ctx.seed * 1000003 + i * 7919 + 13);
    var newId = ctx.newId;
    var catIdx = i % 10, cat = ctx.categories[catIdx], terms = CATEGORIES[catIdx][4];
    var ti = Math.floor(i / 10) % terms.length;
    var T = terms[ti], U = terms[(ti + 1) % terms.length];
    var tplIdx = (i * 3 + Math.floor(i / 10)) % TITLES.length;
    var title = TITLES[tplIdx](T, U);
    var vars = { T: T, U: U, r: r };

    // автор: перші 10 постів — по одному кожному автору, далі — зважений вибір (нерівномірний розподіл)
    var W = [9, 8, 7, 6, 5, 5, 4, 3, 2, 1], author;
    if (i < ctx.authors.length) author = ctx.authors[i];
    else { var x = r() * 50, acc = 0; for (var a = 0; a < W.length; a++) { acc += W[a]; if (x < acc) break; } author = ctx.authors[Math.min(a, W.length - 1)]; }

    // статус
    var status = (i % 15 === 7) ? "draft" : (i % 15 === 12) ? "archived" : "published";

    // текст
    var nBody = 2 + Math.floor(r() * 2), bodyPool = sample(r, BODY, 1 + nBody * 3), bi = 0;
    var paras = [];
    paras.push(fill(pick(r, INTRO), vars) + " " + fill(bodyPool[bi++], vars) + (tplIdx === 4 ? " " + fill(VS, vars) : ""));
    for (var b = 0; b < nBody; b++) paras.push(fill(bodyPool[bi++], vars) + " " + fill(bodyPool[bi++], vars) + " " + fill(bodyPool[bi++], vars));
    paras.push(fill(pick(r, OUTRO), vars));
    var content = paras.join("\n\n");
    var excerpt = fill(INTRO[Math.floor(r() * INTRO.length)], vars);

    // теги: головний термін, (другий — якщо порівняння) + 1–2 загальних
    var tags = [tagSlug(T)];
    if (tplIdx === 4) tags.push(tagSlug(U));
    var gn = 1 + Math.floor(r() * 2);
    for (var g = 0; g < gn; g++) { var gt = pick(r, GENERIC_TAGS); if (tags.indexOf(gt) < 0) tags.push(gt); }

    // дати
    var publishedAt = null, createdAt, updatedAt;
    if (status === "draft") { createdAt = NOW - (1 + r() * 20) * DAY; updatedAt = createdAt; }
    else {
      var age = status === "archived" ? 120 + r() * 60 : 3 + r() * 177;
      publishedAt = NOW - age * DAY; createdAt = publishedAt - (0.2 + r() * 3) * DAY; updatedAt = publishedAt;
    }

    var post = {
      _id: newId(), title: title, slug: slugify(title, 70) + "-" + (i + 1), content: content, excerpt: excerpt,
      search_stems: _uk.ukStemText(title + " " + content + " " + tags.join(" ")),
      author: { user_id: author._id, username: author.username, avatar_url: author.profile.avatar_url },
      category: { category_id: cat._id, name: cat.name },
      tags: tags, featured_image: "https://picsum.photos/seed/lab7-" + (i + 1) + "/800/400",
      status: status, version: 1, comments: [],
      statistics: { views: 0, likes: 0, dislikes: 0, comments_count: 0 },
      created_at: new Date(createdAt), updated_at: new Date(updatedAt)
    };
    if (publishedAt !== null) post.published_at = new Date(publishedAt);
    if (r() < 0.8) {
      var city = pick(r, CITIES);
      post.location = { type: "Point", coordinates: [Math.round((city[1] + (r() - 0.5) * 0.1) * 10000) / 10000, Math.round((city[2] + (r() - 0.5) * 0.06) * 10000) / 10000] };
      post.location_name = city[0];
    }

    var out = { post: post, reactions: [], versions: [], notifications: [], views: [] };
    if (status === "draft") return out;

    // ---------- коментарі (плоский масив із parent_id/depth) ----------
    var nCom = 3 + Math.floor(r() * 7), approved = [];
    for (var c = 0; c < nCom; c++) {
      var parent = null;
      if (approved.length && r() < 0.42) {
        var cand = approved.filter(function (x) { return x.depth < 3; });
        if (cand.length) parent = pick(r, cand);
      }
      var cu;
      if (parent) cu = (parent.author.user_id !== author._id && r() < 0.35) ? author : pick(r, ctx.commenters);
      else cu = pick(r, ctx.commenters);
      var ct = parent ? Math.min(NOW - 60000, parent.created_at.getTime() + (0.02 + r() * 3) * DAY)
                      : Math.min(NOW - 60000, publishedAt + (0.1 + r() * 25) * DAY);
      var roll = r(), st = roll < 0.86 ? "approved" : roll < 0.95 ? "pending" : "rejected";
      var text = st === "rejected" ? pick(r, COMMENTS_SPAM) : parent ? pick(r, COMMENTS_REPLY) : fill(pick(r, COMMENTS_TOP), vars);
      var com = {
        comment_id: newId(), parent_id: parent ? parent.comment_id : null, depth: parent ? parent.depth + 1 : 0,
        author: userRef(cu), text: text, created_at: new Date(ct), status: st,
        likes: st === "approved" ? Math.floor(r() * r() * 15) : 0, moderated_by: null, moderated_at: null
      };
      if (st !== "pending") { com.moderated_by = pick(r, ctx.admins)._id; com.moderated_at = new Date(Math.min(NOW, ct + (0.01 + r() * 0.5) * DAY)); }
      post.comments.push(com);
      if (st === "approved") approved.push(com);
    }
    post.comments.sort(function (x, y) { return x.created_at - y.created_at; });
    post.statistics.comments_count = approved.length;

    // ---------- сповіщення (створюються при СХВАЛЕННІ коментаря) ----------
    if (!lite) {
      var byId = {}; post.comments.forEach(function (x) { byId[String(x.comment_id)] = x; });
      approved.forEach(function (cm) {
        var when = cm.moderated_at, mk = function (userId, type) {
          return { user_id: userId, type: type, post_id: post._id, post_title: title, comment_id: cm.comment_id, from_user: cm.author, text_preview: cm.text.slice(0, 120), is_read: when.getTime() < NOW - 14 * DAY ? true : r() < 0.5, created_at: when };
        };
        if (cm.author.user_id !== author._id) out.notifications.push(mk(author._id, "new_comment"));
        if (cm.parent_id) {
          var pa = byId[String(cm.parent_id)].author.user_id;
          if (pa !== cm.author.user_id && pa !== author._id) out.notifications.push(mk(pa, "reply"));
        }
      });
    }

    // ---------- реакції ----------
    if (lite) { post.statistics.likes = Math.floor(r() * 12); post.statistics.dislikes = Math.floor(r() * 3); }
    else {
      var nR = Math.floor(r() * 15), pool = ctx.commenters.filter(function (u) { return u._id !== author._id; }), used = {};
      for (var k = 0; k < nR; k++) {
        var ru = pick(r, pool); if (used[String(ru._id)]) continue; used[String(ru._id)] = 1;
        var val = r() < 0.85 ? 1 : -1;
        out.reactions.push({ post_id: post._id, user_id: ru._id, value: val, created_at: new Date(publishedAt + r() * (NOW - publishedAt)) });
        if (val === 1) post.statistics.likes++; else post.statistics.dislikes++;
      }
    }

    // ---------- перегляди ----------
    var views = Math.floor(30 + r() * r() * 3500);
    post.statistics.views = views;
    if (!lite) {
      var firstDay = Math.floor(publishedAt / DAY), lastDay = Math.floor(NOW / DAY), w = [], sum = 0;
      for (var d = firstDay; d <= lastDay; d++) { var wt = Math.exp(-(d - firstDay) / 40) * (0.4 + r()); w.push(wt); sum += wt; }
      var counts = w.map(function (x) { return Math.floor(views * x / sum); });
      var rest = views - counts.reduce(function (s, x) { return s + x; }, 0);
      for (var q = 0; rest > 0; q = (q + 1) % counts.length) { counts[q]++; rest--; }
      var buckets = {};
      counts.forEach(function (cnt, idx) {
        if (!cnt) return;
        var dt = new Date((firstDay + idx) * DAY), mon = dt.toISOString().slice(0, 7), dd = dt.toISOString().slice(8, 10);
        var bk = buckets[mon] || (buckets[mon] = { post_id: post._id, month: mon, total: 0, days: {} });
        bk.days[dd] = cnt; bk.total += cnt;
      });
      Object.keys(buckets).sort().forEach(function (m) { out.views.push(buckets[m]); });
    }

    // ---------- версії (історія редагувань) ----------
    if (!lite && status === "published" && r() < 0.3) {
      var nEdits = 1 + Math.floor(r() * 3), t0 = publishedAt;
      post.version = nEdits + 1;
      for (var v = 1; v <= nEdits; v++) {
        var editAt = t0 + (0.3 + r() * Math.max(0.5, (NOW - publishedAt) / DAY / (nEdits + 1))) * DAY; t0 = editAt;
        var keep = Math.max(2, paras.length - (nEdits - v + 1));
        var oldTitle = (v === 1 && title.indexOf(":") > 0) ? title.slice(0, title.indexOf(":")) : title;
        var note = pick(r, CHANGE_NOTES);
        out.versions.push({
          post_id: post._id, version: v, title: oldTitle, content: paras.slice(0, keep).join("\n\n"), excerpt: excerpt, tags: tags.slice(0, Math.max(1, tags.length - (v === 1 ? 1 : 0))),
          category: { category_id: cat._id, name: cat.name },
          saved_by: (r() < 0.8 ? author : pick(r, ctx.admins))._id, saved_at: new Date(Math.min(editAt, NOW - 3600000)), change_note: note
        });
      }
      post.updated_at = out.versions[out.versions.length - 1].saved_at;
    }
    return out;
  }

  // ---------- збирання повного набору ----------
  function generateDataset(newId, opts) {
    opts = opts || {};
    var seed = opts.seed === undefined ? 7 : opts.seed, n = opts.postCount === undefined ? 60 : opts.postCount;
    var ctx = createContext(newId, seed);
    var ds = { users: ctx.users, categories: ctx.categories, tags: [], posts: [], reactions: [], versions: [], notifications: [], views: [], ctx: ctx };
    for (var i = 0; i < n; i++) {
      var o = makePost(ctx, i, opts);
      ds.posts.push(o.post);
      [].push.apply(ds.reactions, o.reactions); [].push.apply(ds.versions, o.versions);
      [].push.apply(ds.notifications, o.notifications); [].push.apply(ds.views, o.views);
    }
    finalize(ds);
    return ds;
  }

  // Обчислювані (денормалізовані) лічильники: users/categories/tags
  function finalize(ds) {
    var u = {}, c = {}, t = {};
    ds.users.forEach(function (x) { u[String(x._id)] = x; });
    ds.categories.forEach(function (x) { c[String(x._id)] = x; });
    ds.posts.forEach(function (p) {
      if (p.status === "published") {
        u[String(p.author.user_id)].statistics.posts_count++;
        c[String(p.category.category_id)].statistics.posts_count++;
        p.tags.forEach(function (tg) {
          var e = t[tg] || (t[tg] = { name: tg, posts_count: 0, created_at: p.created_at });
          e.posts_count++; if (p.created_at < e.created_at) e.created_at = p.created_at;
        });
      }
      p.comments.forEach(function (cm) { if (cm.status === "approved") u[String(cm.author.user_id)].statistics.comments_count++; });
    });
    ds.tags = Object.keys(t).sort().map(function (k) { return Object.assign({ _id: ds.ctx.newId() }, t[k]); });
  }

  return { generateDataset: generateDataset, createContext: createContext, makePost: makePost, finalize: finalize, makeRng: makeRng, slugify: slugify, NOW: NOW, DAY: DAY, CATEGORIES: CATEGORIES };
})();
var generateDataset = GEN.generateDataset;
if (typeof module !== "undefined" && module.exports) module.exports = GEN;
