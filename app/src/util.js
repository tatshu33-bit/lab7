const { ObjectId } = require("mongodb");
const { slugify } = require("../../scripts/lib/generator.js");
const { ukStemText } = require("../../scripts/lib/ukstem.js");

class ApiError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}
function oid(v, name) {
  if (typeof v !== "string" || !/^[0-9a-fA-F]{24}$/.test(v)) throw new ApiError(400, "Некоректний " + (name || "id"));
  return new ObjectId(v);
}
const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); // обгортка для async-обробників
const str = v => (typeof v === "string" ? v.trim() : "");

// "mongodb, Практика ,mongodb" -> ["mongodb","практика"]
function parseTags(v) {
  const arr = Array.isArray(v) ? v : String(v || "").split(",");
  return Array.from(new Set(arr.map(t => String(t).trim().toLowerCase()).filter(Boolean)));
}
// Помилки MongoDB -> зрозумілі помилки API
function mapMongoError(e) {
  if (e instanceof ApiError) return e;
  if (e && e.code === 121) return new ApiError(400, "Документ не пройшов валідацію схеми MongoDB", e.errInfo && e.errInfo.details);
  if (e && e.code === 11000) return new ApiError(409, "Дублікат унікального значення", e.keyValue);
  return e;
}
module.exports = { ApiError, oid, ah, str, parseTags, mapMongoError, slugify, ukStemText, ObjectId };
