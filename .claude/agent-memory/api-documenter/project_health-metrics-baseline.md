---
name: health-metrics-baseline
description: Existe docs/health-metrics-baseline.md, snapshot previo a cambios de health-metrics y notificaciones (2026-10-16)
metadata:
  type: project
---

`docs/health-metrics-baseline.md` es una línea base congelada (no se actualiza con el código): endpoints de health-metrics, umbrales de `checkMetricStatus`, generación de notificaciones y hallazgos (sin authorize, diastólica no evaluada, audit resource "api").

**Why:** el usuario quiere comparar antes/después de cambios en health-metrics.
**How to apply:** no editarlo tras los cambios; documentar el nuevo estado en docs/API.md y citar diferencias contra este archivo.
