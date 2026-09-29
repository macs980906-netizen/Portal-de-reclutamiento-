/**
 * RiderMex · Reclutamiento de asesores — Apps Script del Google Sheet.
 *
 * Qué hace:
 *  - Recibe cada postulación desde la landing (Vercel) y la guarda como fila en "Postulaciones".
 *  - Guarda el CV (si lo adjuntan) en una carpeta PRIVADA de tu Google Drive.
 *  - Recibe el resultado de la evaluación (puntaje, desglose y evidencia) y lo escribe en la fila.
 *  - Mantiene la pestaña "Top 5": ranking en vivo con umbral, tamaño configurable y empates.
 *  - Menú "RiderMex": configurar, reintentar evaluaciones pendientes y enviar el Top por correo.
 *
 * Instalación: ver docs/google-sheets.md. No pegues aquí claves ni teléfonos: el secreto se guarda
 * en las Propiedades del script con el menú RiderMex → Configurar.
 */

var MAIN = 'Postulaciones';
var TOP = 'Top 5';
var CONFIG = 'Config';
var KEY_COL = '_clave';
var TOP_COLUMNS = [
  'Código', 'Nombre', 'Apellido', 'WhatsApp', 'Abrir WhatsApp', 'Correo', 'Agencia 1', 'Agencia 2', 'Puntaje',
  'Descubrimiento de necesidades (20)', 'Manejo de objeciones y resolución (20)', 'Comunicación y orientación al cliente (15)',
  'Honestidad, criterio y aprendizaje del producto (15)', 'Seguimiento e iniciativa comercial (15)',
  'Calidad de la evidencia conductual aportada (15)', 'Evidencia y justificación', 'CV', 'Estado del proceso',
];
var NUMERIC = /^(Puntaje|.*\(\d+\))$/;

// ---------------------------------------------------------------- Webhook

function doPost(e) {
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'JSON inválido' });
  }
  var secret = PropertiesService.getScriptProperties().getProperty('SECRET');
  if (!secret || req.secret !== secret) return json_({ ok: false, error: 'No autorizado' });

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (req.action === 'ping') return json_({ ok: true });
    if (req.action === 'append') return json_(appendApplication_(req));
    if (req.action === 'evaluation') return json_(writeEvaluation_(req.code, req.fields || {}));
    return json_({ ok: false, error: 'Acción desconocida' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err).slice(0, 300) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return json_({ ok: true, service: 'RiderMex reclutamiento' });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------- Hoja principal

function mainSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(MAIN);
  if (!sh) {
    sh = ss.insertSheet(MAIN, 0);
    sh.getRange(1, 1).setValue('Código');
    sh.setFrozenRows(1);
    sh.setFrozenColumns(3);
  }
  return sh;
}

/** Devuelve { nombre: númeroDeColumna } y crea las columnas que falten. */
function ensureHeaders_(sh, names) {
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var idx = {};
  headers.forEach(function (h, i) { if (h !== '') idx[h] = i + 1; });
  var next = headers.filter(function (h) { return h !== ''; }).length + 1;
  names.forEach(function (n) {
    if (!idx[n]) {
      sh.getRange(1, next).setValue(n).setFontWeight('bold');
      idx[n] = next;
      next++;
    }
  });
  if (idx[KEY_COL]) sh.hideColumns(idx[KEY_COL]);
  return idx;
}

/** Texto del candidato nunca se interpreta como fórmula. */
function safe_(v) {
  if (v === null || v === undefined) return '';
  var s = String(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function cell_(name, v) {
  var s = String(v === null || v === undefined ? '' : v);
  if (NUMERIC.test(name) && s !== '' && !isNaN(Number(s))) return Number(s);
  return safe_(s);
}

function columnValues_(sh, col) {
  var n = sh.getLastRow() - 1;
  if (n <= 0) return [];
  return sh.getRange(2, col, n, 1).getValues().map(function (r) { return r[0]; });
}

function appendApplication_(req) {
  var sh = mainSheet_();
  var row = req.row || {};
  var names = Object.keys(row).concat(['Posible duplicado', KEY_COL]);
  var idx = ensureHeaders_(sh, names);

  // Reintento del mismo envío: devolver el código existente sin duplicar la fila.
  var keys = columnValues_(sh, idx[KEY_COL]);
  var at = keys.indexOf(req.submissionKey);
  if (req.submissionKey && at >= 0) {
    return { ok: true, code: String(sh.getRange(at + 2, idx['Código']).getValue()), duplicateSubmission: true };
  }

  // Mismo teléfono ya registrado: se guarda igual, marcada como posible duplicado.
  var phones = columnValues_(sh, idx['WhatsApp']).map(String);
  row['Posible duplicado'] = phones.indexOf(String(row['WhatsApp']).replace(/^'/, '')) >= 0 ? 'Sí' : '';
  row[KEY_COL] = req.submissionKey || '';

  if (req.cv && req.cv.base64) {
    var blob = Utilities.newBlob(Utilities.base64Decode(req.cv.base64), req.cv.mimeType, req.cv.name);
    row['CV'] = cvFolder_().createFile(blob).getUrl();
  }

  var width = sh.getLastColumn();
  var values = [];
  for (var c = 0; c < width; c++) values.push('');
  Object.keys(row).forEach(function (k) { values[idx[k] - 1] = cell_(k, row[k]); });
  sh.appendRow(values);
  return { ok: true, code: String(row['Código']) };
}

function writeEvaluation_(code, fields) {
  var sh = mainSheet_();
  var idx = ensureHeaders_(sh, Object.keys(fields));
  var codes = columnValues_(sh, idx['Código']).map(String);
  var at = codes.indexOf(String(code));
  if (at < 0) return { ok: false, error: 'Código no encontrado' };
  Object.keys(fields).forEach(function (k) {
    sh.getRange(at + 2, idx[k]).setValue(cell_(k, fields[k]));
  });
  refreshTop_();
  return { ok: true };
}

function cvFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('CV_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* carpeta borrada: se crea otra */ }
  }
  var folder = DriveApp.createFolder('RiderMex · CVs de postulaciones (privado)');
  props.setProperty('CV_FOLDER_ID', folder.getId());
  return folder;
}

// ---------------------------------------------------------------- Config y Top 5

function configSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CONFIG);
  if (!sh) {
    sh = ss.insertSheet(CONFIG);
    sh.getRange('A1:B3').setValues([
      ['Umbral mínimo (0–100)', 70],
      ['Tamaño del Top', 5],
      ['Correos para enviar el Top (separados por coma)', ''],
    ]);
    sh.getRange('A5').setValue(
      'El umbral de 70 es un valor inicial por validar con el equipo, no un estándar científico. ' +
      'El puntaje orienta la revisión; la decisión de entrevistar o contratar es del equipo.'
    );
    sh.getRange('A1:A3').setFontWeight('bold');
    sh.setColumnWidth(1, 380);
  }
  return sh;
}

function colLetter_(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** Fórmula del Top: sólo "Evaluada" y ≥ umbral; incluye a todas las empatadas en el último lugar. */
function topFormulas_(idx) {
  var est = "'" + MAIN + "'!" + colLetter_(idx['Estado evaluación']) + '2:' + colLetter_(idx['Estado evaluación']);
  var pts = "'" + MAIN + "'!" + colLetter_(idx['Puntaje']) + '2:' + colLetter_(idx['Puntaje']);
  var lastCol = colLetter_(Object.keys(idx).reduce(function (m, k) { return Math.max(m, idx[k]); }, 1));
  var all = "'" + MAIN + "'!A2:" + lastCol;
  var cols = TOP_COLUMNS.filter(function (c) { return idx[c]; });
  var scorePos = cols.indexOf('Puntaje') + 1;
  var choose = cols.map(function (c) { return idx[c]; }).join(',');
  var core =
    'est,' + est + ',pts,' + pts + ',umbral,' + CONFIG + '!B1,n,' + CONFIG + '!B2,' +
    'ok,(est="Evaluada")*ISNUMBER(pts)*(pts>=umbral)>0,' +
    'corte,IFERROR(LARGE(FILTER(pts,ok),n),umbral),' +
    'datos,FILTER(CHOOSECOLS(' + all + ',' + choose + '),ok,pts>=corte)';
  return {
    headers: cols,
    table: '=LET(' + core + ',IFERROR(SORT(datos,' + scorePos + ',FALSE),"Todavía no hay perfiles evaluados que alcancen el umbral."))',
    tie: '=LET(' + core + ',IFERROR(IF(ROWS(datos)>n,"⚠ Empate en el último lugar: se muestran todas las personas empatadas. El equipo decide; no se desempata por orden de llegada ni datos personales.",""),""))',
    pending:
      '="Fuera del ranking — Revisión manual: "&COUNTIF(' + est + ',"Revisión manual")&" · Pendientes: "&COUNTIF(' + est +
      ',"Pendiente")&" · Fallidas: "&COUNTIF(' + est + ',"Falló")&" · En proceso: "&COUNTIF(' + est + ',"En proceso")',
  };
}

function refreshTop_() {
  var main = mainSheet_();
  var idx = ensureHeaders_(main, ['Estado evaluación', 'Puntaje']);
  configSheet_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var top = ss.getSheetByName(TOP) || ss.insertSheet(TOP, 1);
  var f = topFormulas_(idx);
  top.getRange('A1').setValue(
    'Ranking en vivo (provisional mientras sigan llegando postulaciones). Umbral y tamaño en la pestaña Config. ' +
    'El puntaje orienta la revisión; la decisión final es del equipo.'
  ).setFontWeight('bold');
  top.getRange('A2').setFormula(f.tie);
  top.getRange('A3').setFormula(f.pending);
  top.getRange(5, 1, 1, 40).clearContent();
  top.getRange(5, 1, 1, f.headers.length).setValues([f.headers]).setFontWeight('bold');
  top.getRange('A6').setFormula(f.table);
  top.setFrozenRows(5);
}

// ---------------------------------------------------------------- Menú

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('RiderMex')
    .addItem('1. Configurar (secreto y URL de la landing)', 'configurar')
    .addItem('Actualizar pestaña Top 5', 'refreshTop_')
    .addItem('Reintentar evaluaciones pendientes', 'reintentarEvaluaciones')
    .addItem('Enviar Top por correo al equipo', 'enviarTopPorCorreo')
    .addToUi();
}

function configurar() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  var s = ui.prompt('Secreto compartido', 'Pega el mismo valor que SHEETS_WEBHOOK_SECRET en Vercel (mínimo 24 caracteres).', ui.ButtonSet.OK_CANCEL);
  if (s.getSelectedButton() !== ui.Button.OK) return;
  var secret = s.getResponseText().trim();
  if (secret.length < 24) { ui.alert('El secreto debe tener al menos 24 caracteres.'); return; }
  var u = ui.prompt('URL de la landing', 'Ejemplo: https://ridermex-reclutamiento.vercel.app', ui.ButtonSet.OK_CANCEL);
  if (u.getSelectedButton() !== ui.Button.OK) return;
  props.setProperty('SECRET', secret);
  props.setProperty('LANDING_URL', u.getResponseText().trim().replace(/\/$/, ''));
  mainSheet_();
  configSheet_();
  ui.alert('Listo. Ahora publica el script: Implementar → Nueva implementación → Aplicación web (ejecutar como: yo; acceso: cualquier persona) y copia la URL en SHEETS_WEBHOOK_URL de Vercel.');
}

function reintentarEvaluaciones() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('LANDING_URL');
  var secret = props.getProperty('SECRET');
  if (!url || !secret) { toast_('Primero usa RiderMex → Configurar.'); return; }
  var sh = mainSheet_();
  var idx = ensureHeaders_(sh, ['Estado evaluación']);
  var n = sh.getLastRow() - 1;
  if (n <= 0) { toast_('No hay postulaciones.'); return; }
  var data = sh.getRange(2, 1, n, sh.getLastColumn()).getValues();
  var qCols = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map(function (p) {
    var name = Object.keys(idx).filter(function (k) { return k.indexOf(p + ' ') === 0; })[0];
    return idx[name];
  });
  var items = [];
  var rows = [];
  data.forEach(function (r, i) {
    var st = r[idx['Estado evaluación'] - 1];
    if (items.length < 10 && (st === 'Pendiente' || st === 'Falló' || st === 'En proceso')) {
      var answers = {};
      qCols.forEach(function (c, j) { answers['q' + (j + 1)] = String(r[c - 1] || ''); });
      items.push({ code: String(r[idx['Código'] - 1]), firstName: String(r[idx['Nombre'] - 1]), lastName: String(r[idx['Apellido'] - 1]), answers: answers });
      rows.push(i + 2);
    }
  });
  if (!items.length) { toast_('No hay evaluaciones pendientes.'); return; }
  var res = UrlFetchApp.fetch(url + '/api/sheets/evaluate', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ secret: secret, items: items }),
  });
  if (res.getResponseCode() === 202) {
    rows.forEach(function (r) { sh.getRange(r, idx['Estado evaluación']).setValue('En proceso'); });
    toast_(items.length + ' evaluación(es) en proceso. Los resultados aparecerán en 1–3 minutos.');
  } else {
    toast_('No se pudo reintentar (HTTP ' + res.getResponseCode() + '). Revisa la URL y el secreto.');
  }
}

function enviarTopPorCorreo() {
  var ui = SpreadsheetApp.getUi();
  var to = String(configSheet_().getRange('B3').getValue()).trim();
  if (!to) { ui.alert('Agrega los correos en la pestaña Config (celda B3).'); return; }
  refreshTop_();
  SpreadsheetApp.flush();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var top = ss.getSheetByName(TOP);
  var headers = top.getRange(5, 1, 1, top.getLastColumn()).getValues()[0];
  var rows = top.getLastRow() >= 6 ? top.getRange(6, 1, top.getLastRow() - 5, headers.length).getValues() : [];
  var col = function (name) { return headers.indexOf(name); };
  var list = rows
    .filter(function (r) { return r[col('Código')] && String(r[0]).indexOf('Todavía') !== 0; })
    .map(function (r, i) {
      return (i + 1) + '. ' + r[col('Nombre')] + ' ' + r[col('Apellido')] + ' — ' + r[col('Puntaje')] + '/100 — Agencia: ' + (r[col('Agencia 1')] || '—');
    });
  var tie = String(top.getRange('A2').getDisplayValue());
  var body =
    (list.length
      ? 'Shortlist RiderMex lista: ' + list.length + ' perfil(es) recomendados para entrevista.\n\n' + list.join('\n')
      : 'Todavía no hay perfiles evaluados que alcancen el umbral.') +
    (tie ? '\n\n' + tie : '') +
    '\n\n' + top.getRange('A3').getDisplayValue() +
    '\n\nRevisa puntajes, evidencia y datos de contacto en la hoja: ' + ss.getUrl() +
    '\n\nEl puntaje orienta la revisión; la decisión final es del equipo.';
  MailApp.sendEmail(to, 'RiderMex · Shortlist de asesores (' + list.length + ')', body);
  ui.alert('Enviado a: ' + to);
}

function toast_(msg) {
  SpreadsheetApp.getActiveSpreadsheet().toast(msg, 'RiderMex', 8);
}
