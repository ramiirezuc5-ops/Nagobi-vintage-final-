import { conectarDB, Producto, idValido, ruta, ErrorHttp, MAX_FOTOS } from './_lib.js';

/* Sirve una foto de una prenda como imagen real (cacheable), para no mandar base64 en el listado */
export default ruta(async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    throw new ErrorHttp(405, 'Método no permitido');
  }
  const { id, n } = req.query;
  const i = Number(n);
  if (!idValido(id) || !Number.isInteger(i) || i < 0 || i >= MAX_FOTOS) throw new ErrorHttp(404, 'No encontrada');

  await conectarDB();
  const doc = await Producto.findById(id).select({ images: { $slice: [i, 1] } }).lean();
  const src = doc && doc.images && doc.images[0];
  const m = src && /^data:(image\/[a-z]+);base64,(.+)$/.exec(src);
  if (!m) throw new ErrorHttp(404, 'No encontrada');

  res.setHeader('Content-Type', m[1]);
  /* la URL cambia (?v=) cuando se edita la prenda, por eso se puede cachear "para siempre" */
  res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
  return res.status(200).send(Buffer.from(m[2], 'base64'));
});
