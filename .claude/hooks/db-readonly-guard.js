// Hook PreToolUse (Bash) del agente db-analyst: solo permite `node scripts/db-query.js "<consulta>"`.
// Exit 2 = bloquear la llamada y devolver stderr al agente.
let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let command = '';
  try {
    command = String(JSON.parse(raw).tool_input.command || '').trim();
  } catch {
    block('no se pudo interpretar la llamada');
  }

  const m = command.match(/^node\s+(?:\.\/)?scripts\/db-query\.js\s+("([^"`$\\]*)"|'([^']*)')$/);
  if (!m) block('solo se permite: node scripts/db-query.js "<consulta SELECT>"');

  const sql = m[2] !== undefined ? m[2] : m[3];
  if (/[\r\n]/.test(command) || /;\s*\S/.test(sql)) block('una sola sentencia por llamada');
  process.exit(0);
});

function block(reason) {
  console.error(`db-analyst es de solo lectura. Bloqueado: ${reason}`);
  process.exit(2);
}
