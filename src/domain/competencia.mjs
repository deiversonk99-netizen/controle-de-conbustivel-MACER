/** Recebe data civil ISO, sem conversão de fuso. Competência de 21 a 20. */
export function competencia(dataCivil) {
  if (typeof dataCivil !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dataCivil)) {
    throw new Error('Data deve estar no formato AAAA-MM-DD.');
  }
  const [ano, mes, dia] = dataCivil.split('-').map(Number);
  const data = new Date(`${dataCivil}T12:00:00Z`);
  if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== dataCivil) {
    throw new Error('Data inválida.');
  }
  const proximoMes = dia > 20 ? mes + 1 : mes;
  return `${ano + (proximoMes > 12 ? 1 : 0)}-${String(proximoMes > 12 ? 1 : proximoMes).padStart(2, '0')}`;
}
