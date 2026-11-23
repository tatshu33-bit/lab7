// Коментарі: додавання (вкладені відповіді), модерація, сповіщення авторам.
const { col } = require("./db");
const { ApiError, oid, str } = require("./util");
const { MAX_DEPTH } = require("./posts");
const { ObjectId } = require("mongodb");

async function addComment(postId, b) {
  const _id = oid(postId, "id поста"), user = await col("users").findOne({ _id: oid(b.user_id, "user_id"), status: "active" });
  if (!user) throw new ApiError(403, "Користувач не знайдений або заблокований");
  const text = str(b.text);
  if (!text || text.length > 2000) throw new ApiError(400, "Коментар має містити від 1 до 2000 символів");

  const filter = { _id, status: "published" };
  let depth = 0, parentId = null;
  if (b.parent_id) {
    parentId = oid(b.parent_id, "parent_id");
    const p = await col("posts").findOne({ _id }, { projection: { comments: { $elemMatch: { comment_id: parentId } } } });
    if (!p || !p.comments || !p.comments.length) throw new ApiError(404, "Батьківський коментар не знайдено");
    depth = p.comments[0].depth + 1;
    // атомарна перевірка в самому фільтрі: батько схвалений і глибина не перевищена
    filter.comments = { $elemMatch: { comment_id: parentId, status: "approved", depth: { $lt: MAX_DEPTH } } };
  }
  // адміністратор публікується одразу, решта — «pending» (очікує перевірки)
  const status = user.role === "admin" ? "approved" : "pending";
  const comment = { comment_id: new ObjectId(), parent_id: parentId, depth, author: { user_id: user._id, username: user.username }, text, created_at: new Date(),
    status, likes: 0, moderated_by: status === "approved" ? user._id : null, moderated_at: status === "approved" ? new Date() : null };
  const r = await col("posts").updateOne(filter, { $push: { comments: comment } });
  if (!r.matchedCount) throw new ApiError(409, `Відповідь неможлива: пост недоступний, батьківський коментар не схвалений або перевищено глибину ${MAX_DEPTH}`);
  if (status === "approved") await afterApproval(_id, comment);
  return comment;
}

// Побічні ефекти схвалення: лічильники + сповіщення
async function afterApproval(postId, comment) {
  await col("posts").updateOne({ _id: postId }, { $inc: { "statistics.comments_count": 1 } });
  await col("users").updateOne({ _id: comment.author.user_id }, { $inc: { "statistics.comments_count": 1 } });
  const post = await col("posts").findOne({ _id: postId }, { projection: { title: 1, author: 1 } });
  const mk = (uid, type) => ({ user_id: uid, type, post_id: postId, post_title: post.title, comment_id: comment.comment_id, from_user: comment.author,
    text_preview: comment.text.slice(0, 120), is_read: false, created_at: new Date() });
  const docs = [];
  if (!comment.author.user_id.equals(post.author.user_id)) docs.push(mk(post.author.user_id, "new_comment")); // автору поста
  if (comment.parent_id) {                                                                                      // автору коментаря, на який відповіли
    const pp = (await col("posts").findOne({ _id: postId }, { projection: { comments: { $elemMatch: { comment_id: comment.parent_id } } } })).comments[0];
    const pa = pp.author.user_id;
    if (!pa.equals(comment.author.user_id) && !pa.equals(post.author.user_id)) docs.push(mk(pa, "reply"));
  }
  if (docs.length) await col("notifications").insertMany(docs);
}

async function moderate(postId, commentId, b) {
  const _id = oid(postId, "id поста"), cid = oid(commentId, "id коментаря");
  const status = b.status;
  if (!["pending", "approved", "rejected"].includes(status)) throw new ApiError(400, "Некоректний статус");
  const mod = await col("users").findOne({ _id: oid(b.moderator_id, "moderator_id"), role: "admin", status: "active" });
  if (!mod) throw new ApiError(403, "Модерувати може лише адміністратор");
  const post = await col("posts").findOne({ _id, "comments.comment_id": cid }, { projection: { title: 1, author: 1, comments: { $elemMatch: { comment_id: cid } } } });
  if (!post) throw new ApiError(404, "Коментар не знайдено");
  const old = post.comments[0];
  if (old.status === status) return { changed: false, status };
  await col("posts").updateOne({ _id }, { $set: { "comments.$[c].status": status, "comments.$[c].moderated_by": mod._id, "comments.$[c].moderated_at": new Date() } },
    { arrayFilters: [{ "c.comment_id": cid }] });
  const delta = (status === "approved" ? 1 : 0) - (old.status === "approved" ? 1 : 0); // лічильники рахують лише схвалені
  if (delta) {
    await col("posts").updateOne({ _id }, { $inc: { "statistics.comments_count": delta } });
    await col("users").updateOne({ _id: old.author.user_id }, { $inc: { "statistics.comments_count": delta } });
  }
  if (status === "approved") {
    // сповіщення створюються при схваленні (щоб автор не бачив спам)
    const comment = old, mk = (uid, type) => ({ user_id: uid, type, post_id: _id, post_title: post.title, comment_id: cid, from_user: comment.author, text_preview: comment.text.slice(0, 120), is_read: false, created_at: new Date() });
    const docs = [];
    if (!comment.author.user_id.equals(post.author.user_id)) docs.push(mk(post.author.user_id, "new_comment"));
    if (comment.parent_id) {
      const pp = (await col("posts").findOne({ _id }, { projection: { comments: { $elemMatch: { comment_id: comment.parent_id } } } })).comments[0];
      if (!pp.author.user_id.equals(comment.author.user_id) && !pp.author.user_id.equals(post.author.user_id)) docs.push(mk(pp.author.user_id, "reply"));
    }
    if (docs.length) await col("notifications").insertMany(docs);
  }
  return { changed: true, from: old.status, status };
}

// Черга модерації: усі коментарі зі статусом (за замовчуванням pending), найстаріші першими
async function queue(userId, status) {
  const admin = await col("users").findOne({ _id: oid(userId, "user_id"), role: "admin", status: "active" });
  if (!admin) throw new ApiError(403, "Лише для адміністратора");
  status = ["pending", "approved", "rejected"].includes(status) ? status : "pending";
  return col("posts").aggregate([
    { $match: { "comments.status": status } },       // використовує індекс comments_status
    { $unwind: "$comments" },
    { $match: { "comments.status": status } },
    { $sort: { "comments.created_at": status === "pending" ? 1 : -1 } },
    { $limit: 100 },
    { $project: { _id: 0, post_id: "$_id", post_title: "$title", comment: "$comments" } }
  ]).toArray();
}

// ---------------------------------------------------------------- сповіщення
async function inbox(userId, unreadOnly) {
  const uid = oid(userId, "user_id"), n = col("notifications");
  const filter = { user_id: uid }; if (unreadOnly) filter.is_read = false;
  const [items, unread] = await Promise.all([
    n.find(filter).sort({ created_at: -1 }).limit(30).toArray(),
    n.countDocuments({ user_id: uid, is_read: false })
  ]);
  return { unread, items };
}
async function markRead(userId, ids) {
  const filter = { user_id: oid(userId, "user_id"), is_read: false };
  if (Array.isArray(ids) && ids.length) filter._id = { $in: ids.map(i => oid(i, "id сповіщення")) };
  const r = await col("notifications").updateMany(filter, { $set: { is_read: true } });
  return { modified: r.modifiedCount };
}

module.exports = { addComment, moderate, queue, inbox, markRead };
