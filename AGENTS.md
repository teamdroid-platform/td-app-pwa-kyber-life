# AI Agents & Skills Configuration (AGENTS.md)

Este archivo actúa como un orquestador para el asistente de IA (Antigravity). Define qué **skills** deben cargarse y aplicarse obligatoriamente según el tipo de tarea que se esté realizando en este repositorio (`td-app-pwa-kyber-life`).

## 🧠 Instrucción Principal para la IA
**A LA IA:** Antes de comenzar a escribir código o planificar una solución, DEBES identificar la categoría de la tarea en la tabla inferior y **leer los archivos `SKILL.md` correspondientes** usando tus herramientas. En este repositorio, los skills se encuentran dentro de `.agent/skills/skills/<skill-name>/SKILL.md`. Aplica estrictamente las convenciones, patrones y restricciones definidas en esos skills. Si tienes dudas, pregunta antes de codificar.

**Orden de aplicación (obligatorio):** primero los **skills de proceso** de Superpowers (sección 9), que definen *cómo* se aborda la tarea (brainstorming, TDD, depuración sistemática, verificación); después los **skills de dominio** de este repositorio (secciones 0–8), que definen *con qué convenciones* se escribe el código. Ambos conjuntos son complementarios, no alternativos.

---

## 🛠️ Mapeo de Tareas a Skills

### 0. Regla Base de Calidad Absoluta
Para CUALQUIER cambio en este proyecto, incluso si parece pequeño, la IA debe leer primero estos skills base:
- **`clean-code`** → `.agent/skills/skills/clean-code/SKILL.md`: Para mantener codigo directo, claro y mantenible.
- **`coding-standards`** → `.agent/skills/skills/cc-skill-coding-standards/SKILL.md`: Para asegurar convenciones solidas de JS/TS.
- **`typescript-pro`** → `.agent/skills/skills/typescript-pro/SKILL.md`: Para reforzar tipado estricto, contratos y modelado seguro.
- **`production-code-audit`** → `.agent/skills/skills/production-code-audit/SKILL.md`: Para pensar cada cambio con criterio de produccion.

### 1. Desarrollo Frontend (React & Next.js)
Cuando la tarea involucre crear páginas, rutas, hooks, o lógica de UI en React/Next.js:
- **`nextjs-best-practices`** → `.agent/skills/skills/nextjs-best-practices/SKILL.md`: Para arquitectura de App Router, Server/Client components y data fetching.
- **`nextjs-app-router-patterns`** → `.agent/skills/skills/nextjs-app-router-patterns/SKILL.md`: Para reforzar patrones modernos de App Router, Server Actions, streaming y composición full-stack.
- **`react-patterns`** → `.agent/skills/skills/react-patterns/SKILL.md`: Para el uso correcto de hooks, composición y tipado fuerte.
- **`react-best-practices`** → `.agent/skills/skills/react-best-practices/SKILL.md`: Para rendimiento real en React/Next.js, evitar waterfalls, reducir bundle y optimizar re-renderizados.
- **`react-ui-patterns`** → `.agent/skills/skills/react-ui-patterns/SKILL.md`: Para manejar estados de carga (loading), manejo de errores y estados vacíos de forma elegante.
- **`react-state-management`** → `.agent/skills/skills/react-state-management/SKILL.md`: Para decisiones de estado local/global/server state y evitar sobrecargar componentes con lógica dispersa.
- **`accessibility-compliance-accessibility-audit`** → `.agent/skills/skills/accessibility-compliance-accessibility-audit/SKILL.md`: Para accesibilidad, semántica, foco, teclado y lectores de pantalla.

### 2. Diseño UX/UI (Estética y Estilos)
Cuando la tarea sea puramente visual, maquetación, o creación de componentes visuales de alto impacto:
- **`ui-skills`** → `.agent/skills/skills/ui-skills/SKILL.md`: (CRÍTICO) Aplica restricciones de diseño premium, micro-interacciones y acabados de alta fidelidad. No usar diseños genéricos o básicos.
- **`tailwind-patterns`** → `.agent/skills/skills/tailwind-patterns/SKILL.md`: Para utilizar clases utilitarias correctamente y mantener consistencia.
- **`radix-ui-design-system`** → `.agent/skills/skills/radix-ui-design-system/SKILL.md`: Si se necesita crear componentes base accesibles (botones, modales, menús accesibles).
- **`accessibility-compliance-accessibility-audit`** → `.agent/skills/skills/accessibility-compliance-accessibility-audit/SKILL.md`: Para validar experiencia accesible en formularios, dialogs y componentes interactivos.

### 3. Calidad, Arquitectura y Refactorización
Cuando se solicite limpiar código, mejorar rendimiento o definir arquitectura:
- **`clean-code`** → `.agent/skills/skills/clean-code/SKILL.md`: Para asegurar código directo, pragmático y fácil de mantener.
- **`coding-standards`** → `.agent/skills/skills/cc-skill-coding-standards/SKILL.md`: Para asegurar convenciones universales de la industria en JS/TS.
- **`web-performance-optimization`** → `.agent/skills/skills/web-performance-optimization/SKILL.md`: Si hay que revisar tiempos de carga, Core Web Vitals, o tamaño de bundles.
- **`typescript-pro`** → `.agent/skills/skills/typescript-pro/SKILL.md`: Para reducir `any`, mejorar inferencia y endurecer contratos.
- **`production-code-audit`** → `.agent/skills/skills/production-code-audit/SKILL.md`: Para revisar robustez real antes de cerrar cambios.

### 4. Seguridad y Autenticación
Si se toca el flujo de login, protección de rutas, validación de inputs o creación de APIs:
- **`security-review`** → `.agent/skills/skills/cc-skill-security-review/SKILL.md`: Checklists de seguridad obligatorios antes de escribir funciones expuestas.
- **`nextjs-supabase-auth`** → `.agent/skills/skills/nextjs-supabase-auth/SKILL.md`: Si se realizan integraciones o ajustes con Supabase Auth, seguir estas reglas específicas.
- **`api-security-best-practices`** → `.agent/skills/skills/api-security-best-practices/SKILL.md`: Para hardening de handlers, validación y exposición segura de datos.
- **`frontend-security-coder`** → `.agent/skills/skills/frontend-security-coder/SKILL.md`: Para XSS prevention, navegación segura, manejo correcto de contenido dinámico y protección del cliente.

### 5. Testing y Validación de Calidad
Cuando la tarea involucre tests, corrección de bugs, refactors o cambios con riesgo funcional:
- **`testing-patterns`** → `.agent/skills/skills/testing-patterns/SKILL.md`: Para diseñar cobertura util, mantenible y enfocada en comportamiento.
- **`javascript-testing-patterns`** → `.agent/skills/skills/javascript-testing-patterns/SKILL.md`: Para buenas prácticas de Jest, mocks, fixtures y tests de UI/lógica.
- **`production-code-audit`** → `.agent/skills/skills/production-code-audit/SKILL.md`: Para revisar riesgos antes de considerar un cambio como terminado.

### 6. Deploy, Build y Release Readiness
Cuando la tarea involucre build, Docker, variables de entorno, CI/CD o salida a producción:
- **`docker-expert`** → `.agent/skills/skills/docker-expert/SKILL.md`: Para construir imagenes correctas, seguras y eficientes.
- **`deployment-validation-config-validate`** → `.agent/skills/skills/deployment-validation-config-validate/SKILL.md`: Para validar configuracion, runtime y readiness de despliegue.
- **`vercel-deployment`** → `.agent/skills/skills/vercel-deployment/SKILL.md`: Si el despliegue o previews se gestionan en Vercel, para variables, runtimes y build output correctos.
- **`web-performance-optimization`** → `.agent/skills/skills/web-performance-optimization/SKILL.md`: Para evitar regresiones de peso, carga y experiencia real.
- **`production-code-audit`** → `.agent/skills/skills/production-code-audit/SKILL.md`: Para checklist final de robustez de release.

### 7. PWA, Offline y Experiencia Instalable
Cuando la tarea toque manifest, `next-pwa`, service workers, offline mode o comportamiento instalable:
- **`progressive-web-app`** → `.agent/skills/skills/progressive-web-app/SKILL.md`: Para manifiesto, offline fallback, estrategias de cache y requisitos reales de PWA.

### 8. Selección por Stack Real del Proyecto
Debido a que este repositorio usa **Next.js 16, React 19, TypeScript, Tailwind, Radix UI, Supabase, Jest, Docker y dependencias PWA (`@ducanh2912/next-pwa`)**, estos son los skills que deben considerarse parte del stack base habitual:
- `.agent/skills/skills/nextjs-best-practices/SKILL.md`
- `.agent/skills/skills/nextjs-app-router-patterns/SKILL.md`
- `.agent/skills/skills/react-patterns/SKILL.md`
- `.agent/skills/skills/react-best-practices/SKILL.md`
- `.agent/skills/skills/react-ui-patterns/SKILL.md`
- `.agent/skills/skills/react-state-management/SKILL.md`
- `.agent/skills/skills/ui-skills/SKILL.md`
- `.agent/skills/skills/tailwind-patterns/SKILL.md`
- `.agent/skills/skills/radix-ui-design-system/SKILL.md`
- `.agent/skills/skills/clean-code/SKILL.md`
- `.agent/skills/skills/cc-skill-coding-standards/SKILL.md`
- `.agent/skills/skills/typescript-pro/SKILL.md`
- `.agent/skills/skills/testing-patterns/SKILL.md`
- `.agent/skills/skills/javascript-testing-patterns/SKILL.md`
- `.agent/skills/skills/web-performance-optimization/SKILL.md`
- `.agent/skills/skills/accessibility-compliance-accessibility-audit/SKILL.md`
- `.agent/skills/skills/cc-skill-security-review/SKILL.md`
- `.agent/skills/skills/api-security-best-practices/SKILL.md`
- `.agent/skills/skills/frontend-security-coder/SKILL.md`
- `.agent/skills/skills/nextjs-supabase-auth/SKILL.md`
- `.agent/skills/skills/docker-expert/SKILL.md`
- `.agent/skills/skills/deployment-validation-config-validate/SKILL.md`
- `.agent/skills/skills/vercel-deployment/SKILL.md`
- `.agent/skills/skills/progressive-web-app/SKILL.md`
- `.agent/skills/skills/production-code-audit/SKILL.md`

### 9. Superpowers (metodología de trabajo)
Este repositorio usa el plugin **Superpowers** (`obra/superpowers`) como metodología de proceso. Sus skills **no** viven en `.agent/skills/`: los provee el plugin y se invocan por nombre con el prefijo `superpowers:` (por ejemplo `superpowers:brainstorming`).

#### Instalación por herramienta

Superpowers se instala por separado en **cada** harness que uses. Comandos verificados contra el README de la versión 6.3.0:

| Herramienta | Instalación |
|---|---|
| Claude Code | `/plugin install superpowers@claude-plugins-official` |
| Antigravity | `agy plugin install https://github.com/obra/superpowers` |
| Codex CLI | `/plugins` → buscar `superpowers` → `Install Plugin` |
| Codex App | barra lateral → *Plugins* → buscar Superpowers |
| Cursor | `/add-plugin superpowers` en el chat del agente |
| Gemini CLI | `gemini extensions install https://github.com/obra/superpowers` |
| Kimi Code | `/plugins install https://github.com/obra/superpowers` |
| OpenCode | seguir `.opencode/INSTALL.md` del repo de Superpowers |
| Devin CLI | `devin plugins install obra/superpowers` |
| Factory droid | `droid plugin marketplace add https://github.com/obra/superpowers` y luego `droid plugin install superpowers@superpowers` |

Una integración real carga el bootstrap `using-superpowers` **al arrancar la sesión** — eso es lo que hace que los skills se disparen solos en el momento correcto. Copiar los archivos de skills a `.agent/skills/`, o envolverlos con un shim en tiempo de ejecución, los deja presentes en disco pero muertos.

**Prueba de aceptación:** en una sesión limpia, el mensaje «Let's make a react todo list» debe disparar `superpowers:brainstorming` *antes* de que se escriba una línea de código. Si no ocurre, la instalación no está bien y hay que arreglarla antes de seguir.

Si la herramienta en uso no tiene Superpowers instalado, el agente debe **decirlo** en vez de improvisar el flujo, y continuar solo con los skills locales de `.agent/skills/skills/`.

#### Skills de proceso disponibles y cuándo se activan

| Situación | Skill de Superpowers |
|---|---|
| “Construyamos X”, feature nueva, cambio de alcance no trivial | `superpowers:brainstorming` (**antes** de escribir código o entrar en modo plan) |
| Diseño aprobado, hay que escribir el plan | `superpowers:writing-plans` |
| Ejecutar un plan ya escrito | `superpowers:executing-plans` / `superpowers:subagent-driven-development` |
| “Arregla este bug”, comportamiento inesperado | `superpowers:systematic-debugging` (**antes** de tocar código) |
| Escribir o modificar lógica con tests | `superpowers:test-driven-development` (rojo → verde → refactor, con Jest) |
| Trabajo paralelizable entre agentes | `superpowers:dispatching-parallel-agents` |
| Aislar trabajo en una rama | `superpowers:using-git-worktrees` |
| Pedir o recibir revisión de código | `superpowers:requesting-code-review` / `superpowers:receiving-code-review` |
| Antes de declarar una tarea terminada | `superpowers:verification-before-completion` |
| Cerrar una rama de desarrollo | `superpowers:finishing-a-development-branch` |
| Crear o editar skills | `superpowers:writing-skills` |

#### Reglas de este repositorio que se imponen sobre Superpowers
Superpowers declara explícitamente que las instrucciones del usuario y de `AGENTS.md` tienen precedencia sobre sus skills. En caso de conflicto, mandan estas reglas:

1. **Commits locales sí; push, PRs, merges y despliegues nunca automáticos.** `brainstorming` indica “write design doc and commit” —eso está permitido, y se queda ahí—, pero `finishing-a-development-branch` y `requesting-code-review` empujan además a pushear, abrir PR y mergear. En este repositorio esos pasos **se detienen y se piden al usuario**: el agente genera el archivo o el diff, lo muestra y espera permiso explícito (regla general 5). Los commits siguen Conventional Commits (regla general 10).
2. **Artefactos de Superpowers en el repositorio.** Los specs van a `docs/superpowers/specs/YYYY-MM-DD-<tema>-design.md` y los planes a `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`. Son documentación del proyecto y **no** van a `scratch/`; `scratch/` sigue reservado para archivos temporales de prueba y debugging (reglas generales 6 y 7).
3. **Worktrees.** `superpowers:using-git-worktrees` debe usar `.worktrees/` en la raíz de este repositorio (ya está en `.gitignore`). Nunca crear worktrees ni clones dentro de `teamdroid-platform/` fuera de este repo: el workspace contiene junctions y una segunda copia rompe las búsquedas y el grafo de graphify.
4. **TDD con el stack real.** `superpowers:test-driven-development` se ejecuta con Jest (`npm test`, `npx jest --config jest.unit.config.js` para servicios), no con otro runner, y respeta los patrones de `testing-patterns` y `javascript-testing-patterns` de la sección 5.
5. **Verificación sin auto-reparación.** `superpowers:verification-before-completion` se combina con la regla general 8: si la verificación detecta fallos de tests, build o variables de entorno, se reportan con contexto y propuesta de solución, **no** se corrigen por iniciativa propia cuando lo pedido fue verificar.
6. **Convivencia de skills.** Los skills de proceso de Superpowers definen el flujo; los skills de `.agent/skills/skills/` definen las convenciones de código. Ejecutar `superpowers:brainstorming` no exime de leer `clean-code`, `typescript-pro`, `ui-skills` ni los demás skills base de la sección 0.
7. **graphify antes de leer archivos.** Los skills que exploran código (`brainstorming`, `systematic-debugging`, `executing-plans`) consultan primero el grafo de este repo (`graphify query`, `graphify explain`, `graphify path`) y solo después abren archivos completos; hay un hook `PreToolUse` que lo exige. Es también lo que evita que una búsqueda desde la raíz del repo se cuelgue con `node_modules/`, `.next/` y `.agent/`.

## ✅ Regla de Compatibilidad
- Si una herramienta puede resolver skills por nombre, puede seguir usando el nombre corto del skill.
- Si una herramienta no puede resolver skills por nombre, debe leer directamente las rutas locales listadas arriba.
- En caso de discrepancia, la fuente de verdad para este repositorio es el contenido del archivo `SKILL.md` ubicado dentro de `.agent/skills/skills/`.
- Los skills de Superpowers **no** se copian a `.agent/skills/`: se resuelven siempre por nombre a través del plugin. Si la herramienta en uso no tiene Superpowers instalado, debe decirlo en vez de improvisar el flujo, y continuar solo con los skills locales.

---

## 📝 Reglas Generales y Filosofía del Proyecto
1. **Nunca sacrifiques la estética**: Si haces un cambio visual en la UI, asegúrate de que mantenga la identidad del proyecto y se vea profesional.
2. **TypeScript Estricto**: Todo código nuevo debe estar debidamente tipado. Prohibido usar `any` a menos que sea estrictamente necesario.
3. **Pragmatismo sin Sobre-Ingeniería**: Mantén el código lo más simple posible que resuelva de manera robusta el problema actual, siguiendo el espíritu de `clean-code`.
4. **Diseño Responsivo Obligatorio (Mobile-First)**: Todo componente o vista que se modifique o cree debe verse y funcionar perfectamente en todos los tamaños de pantalla (móviles, tablets y escritorio) garantizando una experiencia fluida.
5. **Commits locales sí; nada sale del disco sin permiso explícito**: La IA puede crear **commits locales** por su cuenta, siempre en Conventional Commits (regla 10). Lo que **no** debe hacer sin que el usuario lo pida de forma explícita e inequívoca es `git push`, abrir PRs, mergear, desplegar, publicar o subir nada a producción. Esta regla anula los pasos de push/PR/merge que traen los skills de Superpowers (`requesting-code-review`, `finishing-a-development-branch`): ahí el flujo se pausa y se pide permiso; el «write design doc and commit» de `brainstorming` se queda en el commit local.
6. **Archivos temporales de prueba en `scratch/`**: Siempre que la IA necesite crear archivos auxiliares para pruebas, debugging, scripts temporales o experimentos (por ejemplo `test_*.ts`, `run-test.ts`, `*.mjs` de validación manual, etc.), debe crearlos dentro de una carpeta raíz llamada `scratch/`. Esos archivos no forman parte del proyecto productivo y no deben dejarse dispersos por el repositorio.
7. **`scratch/` debe quedar fuera de Git**: La carpeta `scratch/` debe estar excluida de control de versiones en `.gitignore` para evitar subir archivos temporales o descartables que no son necesarios para el proyecto.
8. **Verificación de readiness para producción**: Cuando el usuario pida verificar que todo está listo para producción, la IA debe ejecutar una validación completa del estado actual del proyecto sin modificar código para “arreglar” problemas detectados. Debe, como mínimo: correr las pruebas unitarias e integración existentes; confirmar cuáles pasan y cuáles fallan; si alguna falla, NO intentar corregirla automáticamente y en su lugar generar un reporte con cada falla, su contexto y una posible solución; revisar que las variables de entorno necesarias estén definidas y documentadas tanto en `.env` como en `.env.example`; verificar que el build funcione correctamente; revisar la configuración y todo lo necesario para determinar si el proyecto, en su estado actual, puede desplegarse a producción de forma segura.
9. **Credenciales reales para validaciones en navegador**: Siempre que la IA necesite probar el sistema en el navegador y esa validación requiera autenticación o datos de acceso, NO debe adivinar, asumir ni inferir credenciales. Debe pedirle directamente al usuario las credenciales del usuario de prueba antes de ejecutar cualquier validación manual o automatizada en el navegador.
10. **Estándar de Commits (Semantic Commits)**: Todo commit —lo pida el usuario o lo cree la IA por su cuenta según la regla 5— debe seguir estrictamente el estándar de commits semánticos (por ejemplo: `feat: ...`, `fix: ...`, `docs: ...`, `chore: ...`, `refactor: ...`, `style: ...`, `test: ...`).
