import mongoose from 'mongoose';
import crypto from 'node:crypto';

/* ---------- Errores y wrapper de rutas ---------- */
export class ErrorHttp extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

export function ruta(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (e) {
      if (e instanceof ErrorHttp) return res.status(e.status).json({ error: e.message });
      console.error(e);
      return res.status(500).json({ error: 'Error del servidor' });
    }
  };
}

/* ---------- Conexión a MongoDB Atlas (reutilizada entre invocaciones) ---------- */
const cache = globalThis._nagobiMongo || (globalThis._nagobiMongo = { conn: null, promise: null });

export async function conectarDB() {
  if (!process.env.MONGODB_URI) throw new ErrorHttp(500, 'Falta la variable MONGODB_URI en Vercel');
  if (cache.conn) return cache.conn;
  if (!cache.promise) {
    cache.promise = mongoose
      .connect(process.env.MONGODB_URI, { bufferCommands: false, serverSelectionTimeoutMS: 8000 })
      .catch((e) => {
        cache.promise = null;
        throw e;
      });
  }
  cache.conn = await cache.promise;
  return cache.conn;
}

/* ---------- Modelo ---------- */
export const CATEGORIAS = ['remeras', 'pantalones', 'buzos', 'camperas'];
export const MAX_FOTOS = 8;
const MAX_CHARS_FOTO = 2_500_000; /* 2,5 MB aprox. (base64) */

const productoSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    cat: { type: String, required: true, enum: CATEGORIAS },
    deca: { type: String, default: '', maxlength: 40 },
    cond: { type: String, default: '', maxlength: 40 },
    price: { type: Number, required: true, min: 1 },
    desc: { type: String, default: '', maxlength: 2000 },
    images: { type: [String], default: [] },
    mine: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Producto = mongoose.models.Producto || mongoose.model('Producto', productoSchema);

export const idValido = (id) => typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id);

/* Lo que ve el navegador: las fotos se sirven como URLs (/api/imagen), no como base64 */
export function aPublico(d, cantidadFotos) {
  const id = String(d._id);
  const v = new Date(d.updatedAt || Date.now()).getTime();
  const n = cantidadFotos ?? (d.images ? d.images.length : 0);
  return {
    id,
    name: d.name,
    cat: d.cat,
    deca: d.deca || '',
    cond: d.cond || '',
    price: d.price,
    desc: d.desc || '',
    mine: true,
    images: Array.from({ length: n }, (_, i) => `/api/imagen?id=${id}&n=${i}&v=${v}`),
  };
}

/* Valida y limpia lo que manda el panel. imagenesPrevias = fotos ya guardadas del producto (al editar) */
export function limpiarProducto(body, imagenesPrevias = [], id = null) {
  const b = body && typeof body === 'object' ? body : {};
  const name = String(b.name ?? '').trim().slice(0, 120);
  const price = Number(b.price);
  if (!name || !(price > 0)) throw new ErrorHttp(400, 'Completá nombre y precio');
  if (!CATEGORIAS.includes(b.cat)) throw new ErrorHttp(400, 'Categoría inválida');

  const entrada = Array.isArray(b.images) ? b.images : [];
  if (entrada.length > MAX_FOTOS) throw new ErrorHttp(400, `Máximo ${MAX_FOTOS} fotos por prenda`);

  const images = entrada.map((src) => {
    if (typeof src !== 'string') throw new ErrorHttp(400, 'Foto no válida');
    if (src.startsWith('data:')) {
      if (!/^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(src)) {
        throw new ErrorHttp(400, 'Formato de foto no válido');
      }
      if (src.length > MAX_CHARS_FOTO) throw new ErrorHttp(400, 'Una de las fotos pesa demasiado');
      return src;
    }
    /* Foto que ya estaba guardada: viene como /api/imagen?id=..&n=..; la recuperamos de la base */
    const m = /[?&]id=([a-f0-9]{24})&n=(\d+)/i.exec(src);
    if (m && id && m[1] === id && imagenesPrevias[Number(m[2])]) return imagenesPrevias[Number(m[2])];
    throw new ErrorHttp(400, 'Foto no reconocida');
  });

  return {
    name,
    cat: b.cat,
    deca: String(b.deca ?? '').slice(0, 40),
    cond: String(b.cond ?? '').slice(0, 40),
    price,
    desc: String(b.desc ?? '').trim().slice(0, 2000),
    images,
  };
}

/* ---------- Sesión del vendedor (token firmado, sin librerías extra) ---------- */
function secreto() {
  if (!process.env.SESSION_SECRET) throw new ErrorHttp(500, 'Falta la variable SESSION_SECRET en Vercel');
  return process.env.SESSION_SECRET;
}
const firmar = (payload) => crypto.createHmac('sha256', secreto()).update(payload).digest('base64url');

export function firmarToken(horas = 12) {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + horas * 3600_000 })).toString('base64url');
  return `${payload}.${firmar(payload)}`;
}

export function exigirAdmin(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const [payload, sig] = token.split('.');
  if (payload && sig) {
    const a = Buffer.from(sig);
    const b = Buffer.from(firmar(payload));
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      try {
        const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
        if (exp > Date.now()) return;
      } catch {
        /* cae al 401 */
      }
    }
  }
  throw new ErrorHttp(401, 'No autorizado');
}

export function compararSeguro(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
