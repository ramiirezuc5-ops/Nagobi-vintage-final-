import crypto from "node:crypto";
import { firmarToken } from "./_lib.js";

const same = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  const { user, pass } = req.body || {};
  if (!process.env.ADMIN_USER || !process.env.ADMIN_PASS || !process.env.SESSION_SECRET)
    return res.status(500).json({ error: "Faltan variables de entorno en el servidor" });

  if (same(user ?? "", process.env.ADMIN_USER) && same(pass ?? "", process.env.ADMIN_PASS)) {
    return res.status(200).json({ token: firmarToken() });
  }
  return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
}