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
- setup.ts limpia tablas en beforeEach; la DB es compartida (singleFork), cada test crea sus datos.
