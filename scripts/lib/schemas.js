// Схеми валідації ($jsonSchema) та індекси бази blog_system.
// Один файл — одне джерело істини: його використовують 01_setup.js, 02_indexes.js, Node-тест (tests/check_dataset.js) і застосунок.
var LAB7_SCHEMAS = (function () {
  var oid = { bsonType: "objectId" };
  var oidOrNull = { bsonType: ["objectId", "null"] };
  var nn = function (extra) { return Object.assign({ bsonType: "int", minimum: 0 }, extra || {}); };
  var STATUS_POST = ["draft", "published", "archived"];
  var STATUS_COMMENT = ["pending", "approved", "rejected"];

  var userRef = {
    bsonType: "object",
    required: ["user_id", "username"],
    properties: { user_id: oid, username: { bsonType: "string", minLength: 3, maxLength: 30 }, avatar_url: { bsonType: ["string", "null"] } }
  };

  var validators = {
    users: {
      bsonType: "object",
      required: ["username", "email", "password_hash", "role", "created_at", "status"],
      properties: {
        username: { bsonType: "string", minLength: 3, maxLength: 30, pattern: "^[a-zA-Z0-9_]+$", description: "3–30 символів: літери, цифри, _" },
        email: { bsonType: "string", pattern: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$", description: "Email у стандартному форматі" },
        password_hash: { bsonType: "string", minLength: 60, description: "Хеш пароля (не відкритий пароль)" },
        role: { enum: ["admin", "author", "reader"], description: "admin | author | reader" },
        status: { enum: ["active", "suspended", "deleted"] },
        profile: {
          bsonType: "object",
          properties: {
            full_name: { bsonType: "string", maxLength: 100 },
            bio: { bsonType: "string", maxLength: 500 },
            avatar_url: { bsonType: ["string", "null"] },
            website: { bsonType: ["string", "null"] }
          }
        },
        statistics: { bsonType: "object", properties: { posts_count: nn(), comments_count: nn() } },
        created_at: { bsonType: "date" },
        last_login: { bsonType: ["date", "null"] }
      }
    },

    categories: {
      bsonType: "object",
      required: ["name", "slug", "created_at"],
      properties: {
        name: { bsonType: "string", minLength: 2, maxLength: 50 },
        slug: { bsonType: "string", pattern: "^[a-z0-9-]+$" },
        description: { bsonType: "string", maxLength: 300 },
        parent_id: oidOrNull,
        statistics: { bsonType: "object", properties: { posts_count: nn() } },
        created_at: { bsonType: "date" }
      }
    },

    tags: {
      bsonType: "object",
      required: ["name", "posts_count", "created_at"],
      properties: {
        name: { bsonType: "string", minLength: 2, maxLength: 40 },
        posts_count: nn(),
        created_at: { bsonType: "date" }
      }
    },

    posts: {
      bsonType: "object",
      required: ["title", "slug", "content", "author", "category", "tags", "status", "version", "comments", "statistics", "created_at", "updated_at"],
      properties: {
        title: { bsonType: "string", minLength: 3, maxLength: 200, description: "3–200 символів" },
        slug: { bsonType: "string", pattern: "^[a-z0-9-]+$", maxLength: 120 },
        content: { bsonType: "string", minLength: 100, description: "мінімум 100 символів" },
        excerpt: { bsonType: "string", maxLength: 300 },
        search_stems: { bsonType: "string" },
        author: userRef,
        category: {
          bsonType: "object",
          required: ["category_id", "name"],
          properties: { category_id: oid, name: { bsonType: "string" } }
        },
        tags: { bsonType: "array", maxItems: 10, uniqueItems: true, items: { bsonType: "string", minLength: 2, maxLength: 40 } },
        featured_image: { bsonType: ["string", "null"] },
        status: { enum: STATUS_POST },
        version: { bsonType: "int", minimum: 1, description: "номер поточної версії (історія — у post_versions)" },
        comments: {
          bsonType: "array",
          items: {
            bsonType: "object",
            required: ["comment_id", "author", "text", "created_at", "status", "depth"],
            properties: {
              comment_id: oid,
              parent_id: Object.assign({}, oidOrNull, { description: "null — коментар верхнього рівня" }),
              depth: { bsonType: "int", minimum: 0, maximum: 4 },
              author: userRef,
              text: { bsonType: "string", minLength: 1, maxLength: 2000 },
              created_at: { bsonType: "date" },
              status: { enum: STATUS_COMMENT },
              likes: nn(),
              moderated_by: oidOrNull,
              moderated_at: { bsonType: ["date", "null"] }
            }
          }
        },
        statistics: {
          bsonType: "object",
          required: ["views", "likes", "dislikes", "comments_count"],
          properties: { views: nn(), likes: nn(), dislikes: nn(), comments_count: nn() }
        },
        location: {
          bsonType: "object",
          required: ["type", "coordinates"],
          properties: {
            type: { enum: ["Point"] },
            coordinates: { bsonType: "array", minItems: 2, maxItems: 2, items: { bsonType: "number" } }
          }
        },
        location_name: { bsonType: "string" },
        created_at: { bsonType: "date" },
        updated_at: { bsonType: "date" },
        published_at: { bsonType: ["date", "null"] }
      }
    },

    reactions: {
      bsonType: "object",
      required: ["post_id", "user_id", "value", "created_at"],
      properties: { post_id: oid, user_id: oid, value: { enum: [1, -1], description: "1 — лайк, -1 — дизлайк" }, created_at: { bsonType: "date" }, updated_at: { bsonType: "date" } }
    },

    post_versions: {
      bsonType: "object",
      required: ["post_id", "version", "title", "content", "saved_at"],
      properties: {
        post_id: oid,
        version: { bsonType: "int", minimum: 1 },
        title: { bsonType: "string" },
        content: { bsonType: "string" },
        excerpt: { bsonType: "string" },
        tags: { bsonType: "array", items: { bsonType: "string" } },
        category: { bsonType: "object" },
        saved_by: oidOrNull,
        saved_at: { bsonType: "date" },
        change_note: { bsonType: "string", maxLength: 200 }
      }
    },

    notifications: {
      bsonType: "object",
      required: ["user_id", "type", "post_id", "is_read", "created_at"],
      properties: {
        user_id: Object.assign({}, oid, { description: "одержувач (автор поста / автор коментаря, на який відповіли)" }),
        type: { enum: ["new_comment", "reply"] },
        post_id: oid,
        post_title: { bsonType: "string" },
        comment_id: oid,
        from_user: userRef,
        text_preview: { bsonType: "string", maxLength: 120 },
        is_read: { bsonType: "bool" },
        created_at: { bsonType: "date" }
      }
    },

    // Патерн «Bucket»: один документ = один пост за один місяць; days — лічильники по днях
    post_views: {
      bsonType: "object",
      required: ["post_id", "month", "total", "days"],
      properties: {
        post_id: oid,
        month: { bsonType: "string", pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$" },
        total: nn(),
        days: { bsonType: "object" }
      }
    }
  };

  // [колекція, ключі, опції]
  var indexes = [
    ["users", { username: 1 }, { unique: true, name: "uq_username" }],
    ["users", { email: 1 }, { unique: true, name: "uq_email" }],
    ["users", { role: 1, status: 1 }, { name: "role_status" }],

    ["categories", { slug: 1 }, { unique: true, name: "uq_cat_slug" }],
    ["categories", { name: 1 }, { unique: true, name: "uq_cat_name" }],
    ["categories", { parent_id: 1 }, { name: "cat_parent" }],

    ["tags", { name: 1 }, { unique: true, name: "uq_tag_name" }],
    ["tags", { posts_count: -1 }, { name: "tag_popularity" }],

    ["posts", { slug: 1 }, { unique: true, name: "uq_post_slug" }],
    // пошук за автором + сортування за датою
    ["posts", { "author.user_id": 1, created_at: -1 }, { name: "by_author_date" }],
    // пошук за категорією (рівність) + статус (рівність) + дата (сортування) — правило ESR
    ["posts", { "category.category_id": 1, status: 1, published_at: -1 }, { name: "by_category_date" }],
    // стрічка: фільтр за статусом, сортування за датою, _id — стабільний порядок для пагінації
    ["posts", { status: 1, published_at: -1, _id: -1 }, { name: "feed_pagination" }],
    // multikey по тегах (пошук за кількома тегами)
    ["posts", { tags: 1, published_at: -1 }, { name: "by_tags_date" }],
    // частковий індекс: «популярні» тільки серед опублікованих
    ["posts", { "statistics.views": -1 }, { name: "popular_published", partialFilterExpression: { status: "published" } }],
    // для черги модерації
    ["posts", { "comments.status": 1 }, { name: "comments_status" }],
    // повнотекстовий: назва важливіша за зміст; search_stems — стеми української (див. ukstem.js)
    ["posts", { title: "text", content: "text", search_stems: "text" },
      { name: "text_posts", default_language: "none", weights: { title: 10, search_stems: 3, content: 1 } }],
    // геопошук
    ["posts", { location: "2dsphere" }, { name: "geo_location" }],

    ["reactions", { post_id: 1, user_id: 1 }, { unique: true, name: "uq_reaction" }],
    ["reactions", { user_id: 1 }, { name: "reaction_user" }],

    ["post_versions", { post_id: 1, version: -1 }, { unique: true, name: "uq_post_version" }],

    ["notifications", { user_id: 1, is_read: 1, created_at: -1 }, { name: "inbox" }],

    ["post_views", { post_id: 1, month: 1 }, { unique: true, name: "uq_views_bucket" }]
  ];

  return { validators: validators, indexes: indexes };
})();
if (typeof module !== "undefined" && module.exports) module.exports = LAB7_SCHEMAS;
