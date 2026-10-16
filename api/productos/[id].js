import {
  conectarDB, Producto, aPublico, limpiarProducto, exigirAdmin, idValido, ruta, ErrorHttp,
} from '../_lib.js';

export default ruta(async (req, res) => {
  const id = String(req.query.id || '');
  if (!idValido(id)) throw new ErrorHttp(400, 'ID inválido');

  if (req.method === 'GET') {
    await conectarDB();
    const doc = await Producto.findById(id).lean();
    if (!doc) throw new ErrorHttp(404, 'No encontrado');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(aPublico(doc));
  }

  if (req.method === 'PUT') {
    exigirAdmin(req);
    await conectarDB();
    const actual = await Producto.findById(id).select('images').lean();
    if (!actual) throw new ErrorHttp(404, 'No encontrado');
    const data = limpiarProducto(req.body, actual.images || [], id);
    const actualizado = await Producto.findByIdAndUpdate(id, data, { new: true, runValidators: true });
    return res.status(200).json(aPublico(actualizado.toObject()));
  }

  if (req.method === 'DELETE') {
    exigirAdmin(req);
    await conectarDB();
    const borrado = await Producto.findByIdAndDelete(id);
    if (!borrado) throw new ErrorHttp(404, 'No encontrado');
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', 'GET, PUT, DELETE');
  throw new ErrorHttp(405, 'Método no permitido');
});