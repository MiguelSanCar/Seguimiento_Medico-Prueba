---
name: project-test-env
description: Trampas de entorno y helpers de tests en HealthTrack (Node 16, vitest, HTTP sin supertest, it.fails)
metadata:
  type: project
---

- Node 16.20.2 + vite 5 falla con "crypto$2.getRandomValues is not a function". Solucion sin tocar src ni config: `NODE_OPTIONS="--require ./tests/node16-crypto-shim.cjs"` antes de `npm test` (PowerShell: `$env:NODE_OPTIONS=...`). Propuesta de fondo: Node >=18 o ajustar el script npm test.
- src/index.ts hace listen() al importar: no importarlo. `tests/http-helper.ts` (`buildApp`, `request`, `tokenFor`) monta los routers reales sobre http (no hay supertest ni fetch en Node 16).
- Bash tool: heredocs largos con comillas fallan; usar Write para crear ficheros.
- Los bugs conocidos se dejan como `it.fails` (pasan mientras el bug exista; si se corrige el bug, el test fallara y hay que quitar `.fails`).
- audit-logger evalua req.path dentro del router (relativo) -> resource/resource_id incorrectos; los tests lo reflejan.
- http-helper `buildApp` monta tambien /api/alerts. Para probar atomicidad de transacciones: `CREATE TRIGGER ... BEFORE INSERT ON <tabla> BEGIN SELECT RAISE(ABORT,..)` y DROP en finally. Si un test llama a world() varias veces, usar emails unicos (contador).
- Bugs alertas (it.fails): admin recibe 200 en patientId inexistente (alerts.service.ts:17); SpO2>100 genera warning (metrics.service.ts:19-41).
- setup.ts limpia tablas en beforeEach; la DB es compartida (singleFork), cada test crea sus datos.
