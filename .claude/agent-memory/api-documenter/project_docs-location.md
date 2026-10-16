---
name: docs-location
description: Dónde está la documentación de la API de HealthTrack y convenciones de formato elegidas
metadata:
  type: project
---

Referencia única de endpoints: `docs/API.md` (índice por módulo, tabla de campos, ejemplos JSON/curl, sección final "Comportamientos a vigilar" con archivo:línea). `README.md` lista endpoints y enlaza a docs/API.md. No existía docs/ antes (2026-10-16).

**Why:** el agente debe mantener un único punto de documentación.
**How to apply:** actualizar docs/API.md en sitio; verificar números de línea de la sección de bugs contra src/ antes de reutilizarlos.
