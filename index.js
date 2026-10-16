import { connectDB, Product, toClient, cleanBody, requireAuth } from "../_lib/db.js";

export default async function handler(req, res) {
  try {
    await connectDB();

    if (req.method === "GET") {
      const list = await Product.find().sort({ createdAt: -1 });
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json(list.map(toClient));
    }

    if (req.method === "POST") {
      if (!requireAuth(req, res)) return;
      const data = cleanBody(req.body);
      if (!data.name || !data.price) return res.status(400).json({ error: "Completá nombre y precio" });
      const created = await Product.create(data);
      return res.status(201).json(toClient(created));
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Método no permitido" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Error del servidor: " + e.message });
  }
}
