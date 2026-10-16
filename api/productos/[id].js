import mongoose from "mongoose";
import { connectDB, Product, toClient, cleanBody, requireAuth } from "../_lib/db.js";

export default async function handler(req, res) {
  try {
    await connectDB();
    const { id } = req.query;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "ID inválido" });

    if (req.method === "GET") {
      const p = await Product.findById(id);
      return p ? res.status(200).json(toClient(p)) : res.status(404).json({ error: "No encontrado" });
    }

    if (req.method === "PUT") {
      if (!requireAuth(req, res)) return;
      const data = cleanBody(req.body);
      if (!data.name || !data.price) return res.status(400).json({ error: "Completá nombre y precio" });
      const p = await Product.findByIdAndUpdate(id, data, { new: true, runValidators: true });
      return p ? res.status(200).json(toClient(p)) : res.status(404).json({ error: "No encontrado" });
    }

    if (req.method === "DELETE") {
      if (!requireAuth(req, res)) return;
      const p = await Product.findByIdAndDelete(id);
      return p ? res.status(200).json({ ok: true }) : res.status(404).json({ error: "No encontrado" });
    }

    res.setHeader("Allow", "GET, PUT, DELETE");
    return res.status(405).json({ error: "Método no permitido" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Error del servidor: " + e.message });
  }
}
