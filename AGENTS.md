# AI Agents & Skills Configuration (AGENTS.md)

Este archivo actúa como un orquestador para el asistente de IA (Antigravity). Define qué **skills** deben cargarse y aplicarse obligatoriamente según el tipo de tarea que se esté realizando en este repositorio (`td-app-pwa-kyber-life`).

## 🧠 Instrucción Principal para la IA
**A LA IA:** Antes de comenzar a escribir código o planificar una solución, DEBES identificar la categoría de la tarea en la tabla inferior y **leer los archivos `SKILL.md` correspondientes** usando tus herramientas. En este repositorio, los skills se encuentran dentro de `.agent/skills/skills/<skill-name>/SKILL.md`. Aplica estrictamente las convenciones, patrones y restricciones definidas en esos skills. Si tienes dudas, pregunta antes de codificar.

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

## ✅ Regla de Compatibilidad
- Si una herramienta puede resolver skills por nombre, puede seguir usando el nombre corto del skill.
- Si una herramienta no puede resolver skills por nombre, debe leer directamente las rutas locales listadas arriba.
- En caso de discrepancia, la fuente de verdad para este repositorio es el contenido del archivo `SKILL.md` ubicado dentro de `.agent/skills/skills/`.

---

## 📝 Reglas Generales y Filosofía del Proyecto
1. **Nunca sacrifiques la estética**: Si haces un cambio visual en la UI, asegúrate de que mantenga la identidad del proyecto y se vea profesional.
2. **TypeScript Estricto**: Todo código nuevo debe estar debidamente tipado. Prohibido usar `any` a menos que sea estrictamente necesario.
3. **Pragmatismo sin Sobre-Ingeniería**: Mantén el código lo más simple posible que resuelva de manera robusta el problema actual, siguiendo el espíritu de `clean-code`.
4. **Diseño Responsivo Obligatorio (Mobile-First)**: Todo componente o vista que se modifique o cree debe verse y funcionar perfectamente en todos los tamaños de pantalla (móviles, tablets y escritorio) garantizando una experiencia fluida.
5. **Nunca hacer commits ni despliegues sin permiso explícito**: La IA no debe crear commits, hacer push, abrir PRs, desplegar, publicar ni subir nada a producción a menos que el usuario lo pida de forma explícita e inequívoca.
6. **Archivos temporales de prueba en `scratch/`**: Siempre que la IA necesite crear archivos auxiliares para pruebas, debugging, scripts temporales o experimentos (por ejemplo `test_*.ts`, `run-test.ts`, `*.mjs` de validación manual, etc.), debe crearlos dentro de una carpeta raíz llamada `scratch/`. Esos archivos no forman parte del proyecto productivo y no deben dejarse dispersos por el repositorio.
7. **`scratch/` debe quedar fuera de Git**: La carpeta `scratch/` debe estar excluida de control de versiones en `.gitignore` para evitar subir archivos temporales o descartables que no son necesarios para el proyecto.
8. **Verificación de readiness para producción**: Cuando el usuario pida verificar que todo está listo para producción, la IA debe ejecutar una validación completa del estado actual del proyecto sin modificar código para “arreglar” problemas detectados. Debe, como mínimo: correr las pruebas unitarias e integración existentes; confirmar cuáles pasan y cuáles fallan; si alguna falla, NO intentar corregirla automáticamente y en su lugar generar un reporte con cada falla, su contexto y una posible solución; revisar que las variables de entorno necesarias estén definidas y documentadas tanto en `.env` como en `.env.example`; verificar que el build funcione correctamente; revisar la configuración y todo lo necesario para determinar si el proyecto, en su estado actual, puede desplegarse a producción de forma segura.
9. **Credenciales reales para validaciones en navegador**: Siempre que la IA necesite probar el sistema en el navegador y esa validación requiera autenticación o datos de acceso, NO debe adivinar, asumir ni inferir credenciales. Debe pedirle directamente al usuario las credenciales del usuario de prueba antes de ejecutar cualquier validación manual o automatizada en el navegador.
10. **Estándar de Commits (Semantic Commits)**: Cuando el usuario solicite explícitamente realizar un commit, este debe seguir estrictamente el estándar de commits semánticos (por ejemplo: `feat: ...`, `fix: ...`, `docs: ...`, `chore: ...`, `refactor: ...`, `style: ...`, `test: ...`).
