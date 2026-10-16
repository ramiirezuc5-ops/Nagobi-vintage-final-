import mongoose from "mongoose";
import crypto from "node:crypto";

/* ---------- Conexión a MongoDB (cacheada para Vercel serverless) ---------- */
let cached = globalThis._mongoose;
if (!cached) cached = globalThis._mongoose = { conn: null, promise: null };

export async function connectDB() {
  if (cached.conn) return cached.conn;
  if (!process.env.MONGODB_URI) throw new Error("Falta la variable MONGODB_URI");
  if (!cached.promise) {
    cached.promise = mongoose
      .connect(process.env.MONGODB_URI, { bufferCommands: false })
      .then((m) => m);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

/* ---------- Modelo ---------- */
const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    cat: { type: String, enum: ["remeras", "pantalones", "buzos", "camperas"], default: "camperas" },
    deca: { type: String, default: "" },
    cond: { type: String, default: "" },
    price: { type: Number, required: true, min: 0 },
    desc: { type: String, default: "" },
    images: { type: [String], default: [] },
  },
  { timestamps: true }
);

export const Product =
  mongoose.models.Product || mongoose.model("Product", productSchema);

/* El frontend usa p.id, así que se devuelve el _id como "id" */
export function toClient(doc) {
  const o = doc.toObject ? doc.toObject() : doc;
  const { _id, __v, createdAt, updatedAt, ...rest } = o;
  return { id: String(_id), ...rest, createdAt };
}

export function cleanBody(b = {}) {
  const cat = b.cat === "accesorios" ? "camperas" : b.cat;
  return {
    name: String(b.name || "").trim(),
    cat,
    deca: String(b.deca || ""),
    cond: String(b.cond || ""),
    price: Number(b.price),
    desc: String(b.desc || "").trim(),
    images: Array.isArray(b.images) ? b.images.filter((x) => typeof x === "string") : [],
  };
}

/* ---------- Sesión (token firmado con HMAC, sin librerías extra) ---------- */
const b64 = (s) => Buffer.from(s).toString("base64url");

export function signToken(user, hours = 12) {
  const payload = b64(JSON.stringify({ u: user, exp: Date.now() + hours * 3600 * 1000 }));
  const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyToken(req) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !process.env.SESSION_SECRET) return null;
  const expected = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

export function requireAuth(req, res) {
  const s = verifyToken(req);
  if (!s) res.status(401).json({ error: "No autorizado" });
  return s;
}
