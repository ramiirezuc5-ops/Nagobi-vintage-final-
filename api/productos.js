import { conectarDB, Producto, aPublico, limpiarProducto, exigirAdmin, ruta, ErrorHttp } from './_lib.js';

export default ruta(async (req, res) => {
  if (req.method === 'GET') {
    await conectarDB();
    /* Listado liviano: sin base64, solo la cantidad de fotos (las fotos se piden aparte) */
    const docs = await Producto.aggregate([
      { $sort: { createdAt: -1 } },
      {
        $project: {
          name: 1, cat: 1, deca: 1, cond: 1, price: 1, desc: 1, updatedAt: 1,
          n: { $size: { $ifNull: ['$images', []] } },
        },
      },
    ]);
    res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=30');
    return res.status(200).json(docs.map((d) => aPublico(d, d.n)));
  }

  if (req.method === 'POST') {
    exigirAdmin(req);
    const data = limpiarProducto(req.body);
    await conectarDB();
    const nuevo = await Producto.create(data);
    return res.status(201).json(aPublico(nuevo.toObject()));
  }

  res.setHeader('Allow', 'GET, POST');
  throw new ErrorHttp(405, 'Método no permitido');
});
