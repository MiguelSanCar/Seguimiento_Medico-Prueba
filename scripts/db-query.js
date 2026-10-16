#!/usr/bin/env node
// Ejecuta UNA consulta de solo lectura sobre healthtrack.db (usado por el agente db-analyst).
// Uso: node scripts/db-query.js "SELECT ..."
const path = require('path');
const Database = require('better-sqlite3');

const sql = (process.argv[2] || '').trim().replace(/;+\s*$/, '');
const dbPath = path.resolve(process.env.DB_PATH || path.join(__dirname, '..', 'healthtrack.db'));

const fail = (msg) => {
  console.error(`db-query: ${msg}`);
  process.exit(1);
};

if (!sql) fail('falta la consulta SQL');

const allowed = /^(select|with|explain|pragma\s+(table_info|table_xinfo|index_list|index_info|foreign_key_list))\b/i;
if (!allowed.test(sql)) fail('solo se permiten SELECT, WITH, EXPLAIN y PRAGMA table_info/index_list/foreign_key_list');
if (/\bpassword_hash\b/i.test(sql) || /select\s+(\w+\.)?\*\s+from\s+users\b/i.test(sql)) {
  fail('no se permite leer password_hash (ni SELECT * sobre users)');
}

let db;
try {
  db = new Database(dbPath, { readonly: true, fileMustExist: true });
  db.pragma('query_only = ON');
  const stmt = db.prepare(sql); // lanza error si hay varios statements
  if (!stmt.reader) fail('la consulta no devuelve datos (posible escritura)');
  const rows = stmt.all();
  console.log(JSON.stringify(rows.slice(0, 500), null, 2));
  console.error(`(${rows.length} filas${rows.length > 500 ? ', mostradas 500' : ''})`);
} catch (err) {
  fail(err.message);
} finally {
  if (db) db.close();
}
