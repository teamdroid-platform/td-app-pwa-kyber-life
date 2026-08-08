# Contexto del proyecto para IA - KyberLife

## 1. Que es este proyecto

KyberLife es una aplicacion web para gestionar compras del hogar, catalogo personal de productos, plantillas reutilizables, supermercados, precios historicos y analitica de gasto.

Su objetivo funcional es ayudar al usuario a:

- organizar compras recurrentes;
- registrar lo que compra y cuanto paga;
- comparar precios entre supermercados;
- mantener un catalogo propio de productos genericos y productos por marca/presentacion;
- analizar gasto mensual, categorias y productos frecuentes.

La aplicacion esta pensada como una experiencia privada por usuario: casi todo el dato relevante pertenece al usuario autenticado.

---

## 2. Resumen funcional actual

### Modulos principales

1. **Autenticacion**
   - login, registro, recuperacion y restauracion de contrasena;
   - soporta modo `SUPABASE` y modos locales `MEMORY` / `MOCK`.

2. **Dashboard**
   - vista ejecutiva con metricas, compras recientes, gasto mensual, categorias top y productos mas frecuentes.

3. **Compras**
   - crear compra nueva desde supermercado + fecha + plantillas;
   - generar lista consolidada de productos;
   - editar lineas, marcar comprados, registrar precio, cantidad, unidad y marca;
   - agregar productos no planificados;
   - finalizar compra y guardar historial de precios.

4. **Plantillas**
   - listas reutilizables de compra;
   - cada plantilla contiene items con cantidad y unidad por defecto.

5. **Productos**
   - catalogo de productos genericos del usuario;
   - alias/sinonimos para evitar duplicados;
   - opciones especificas por marca/presentacion;
   - precio global referencial y observaciones de precio por supermercado.

6. **Configuracion de market data**
   - supermercados;
   - categorias;
   - unidades.

7. **Analitica**
   - gasto mensual;
   - gasto por categoria;
   - productos mas frecuentes;
   - historial y ultimos precios por producto.

8. **Perfil**
   - datos personales, moneda por defecto y configuracion basica del usuario.

9. **Sesion y seguridad de UX**
   - guard de inactividad;
   - modal de expiracion;
   - sincronizacion de logout entre pestanas;
   - refresh proactivo de sesion en Supabase.

10. **PWA**
   - manifest, iconos, install prompt y pagina offline.
   - Nota: la capa completa de service worker esta desactivada actualmente en `next.config.ts`.

11. **Gestion Financiera**
   - dashboard financiero con graficos de dona y barras (responsive-first);
   - registro integral de transacciones: ingresos, gastos y transferencias;
   - busqueda de texto libre inteligente sobre descripcion, categoria e institucion;
   - sincronizacion en tiempo real via WebSockets de Supabase;
   - bandeja de entrada (AI Inbox) para procesar transacciones escaneadas desde notificaciones bancarias;
   - escaner financiero integrado con N8N via webhooks: ejecucion manual o automatica con historial detallado;
   - auditoria y trazabilidad del ciclo de vida de transacciones (Pendiente, Completado, Archivado) con soporte offline y hard-deletes.

---

## 3. Mapa funcional por rutas

### Rutas publicas

- `/auth/login` - inicio de sesion.
- `/auth/register` - registro.
- `/auth/recover` - solicitar recuperacion.
- `/auth/restore` - establecer nueva contrasena.

### Rutas privadas

- `/dashboard` - resumen general del usuario.
- `/market/purchases` - historial/listado de compras.
- `/market/purchases/new` - crear compra.
- `/market/purchases/[id]` - ejecutar o revisar una compra.
- `/market/templates` - listado de plantillas.
- `/market/templates/[id]` - detalle de plantilla.
- `/market/items` - catalogo de productos genericos.
- `/market/items/[id]` - detalle del producto generico y sus opciones.
- `/market/supermarkets` - CRUD de supermercados.
- `/market/categories` - CRUD de categorias.
- `/market/units` - CRUD de unidades.
- `/market/analytics` - analitica funcional.
- `/financial` - dashboard financiero con graficos y filtros.
- `/financial/transactions` - timeline de transacciones con filtros avanzados.
- `/financial/transactions/new` - formulario manual de siempre. Con `?mode=review` muestra el resumen de una captura por voz o texto, que el modal deja en `sessionStorage` antes de navegar.
- `/financial/transactions/[id]` - detalle/edicion de transaccion.
- `/financial/scanner` - escaner financiero: ejecucion, historial y monitoreo.
- `/financial/inbox` - bandeja de transacciones escaneadas para revision y aprobacion.
- `/profile` - perfil del usuario.
- `/~offline` - fallback visual offline.

### Comportamiento global

- `/` redirige a `/dashboard`.
- `src/proxy.ts` protege rutas privadas y redirige segun estado de sesion.

---

## 4. Arquitectura del proyecto

El proyecto sigue una variante pragmatica de **Clean Architecture**.

### `src/domain`

Contiene el nucleo del negocio, independiente de framework.

- `src/domain/core.ts` - tipos base como `UUID`, `CurrencyCode`, `BaseEntity`.
- `src/domain/entities/index.ts` - entidades del dominio.
- `src/domain/repositories/index.ts` - contratos de repositorio.

### `src/application`

Contiene la logica de negocio en servicios/casos de uso.

- `auth-service.ts` - registro, login, cambio y reset de contrasena.
- `master-data-service.ts` - supermercados, categorias y unidades.
- `product-service.ts` - productos genericos, alias, marcas y observaciones de precio.
- `template-service.ts` - plantillas y items de plantilla.
- `purchase-service.ts` - flujo principal de compra.
- `analytics-service.ts` - agregaciones y metricas.
- `user-service.ts` - perfil del usuario.

### `src/infrastructure`

Implementa persistencia, seeds y seleccion de adaptadores.

- `src/infrastructure/container.ts`
  - punto central de composicion;
  - decide si usar repositorios `SUPABASE` o `InMemory` segun `DATA_SOURCE`;
  - expone instancias singleton de repositorios y servicios;
  - inicializa seeds base y mock data.
- `src/infrastructure/repositories/implementations.ts`
  - repositorios en memoria.
- `src/infrastructure/repositories/supabase/*`
  - repositorios sobre Supabase.
- `src/infrastructure/seed/*`
  - datos base y mock.
- `src/infrastructure/supabase/*`
  - clientes y middleware de Supabase.

### `src/app`

Es la capa de entrada Next.js App Router.

- paginas (`page.tsx`);
- layouts (`layout.tsx`);
- server actions en `src/app/actions/*`;
- endpoints puntuales en `src/app/api/*`;
- manifest PWA.

### `src/presentation`

Componentes de interfaz por dominio funcional.

- `analytics/`
- `auth/`
- `dashboard/`
- `financial/` - dashboard, transacciones, inbox y escaner financiero
- `layout/`
- `products/`
- `purchase/`
- `pwa/`
- `session/`
- `supermarket/`
- `templates/`

### `src/lib`

Soporte transversal.

- `validators/*` - esquemas Zod para formularios y acciones.
- `session/*` - strategy pattern de sesion.
- `theme-provider.tsx` - provider UI.
- `utils.ts` - helpers generales.

### `src/components/ui`

Componentes UI base reutilizables, mayormente estilo shadcn/Radix.

---

## 5. Distribucion real de responsabilidades

### Donde vive la logica

- **Reglas de negocio:** `src/application/services/*`
- **Persistencia y cambio de datasource:** `src/infrastructure/*`
- **Validacion de entradas:** `src/lib/validators/*`
- **Mutaciones desde UI:** `src/app/actions/*`
- **Renderizado de pantallas:** `src/app/**/page.tsx`
- **Componentes visuales y UX:** `src/presentation/components/*`

### Patron de trabajo tipico

1. La pagina obtiene datos desde repositorios o servicios.
2. El usuario interactua con formularios/componentes.
3. La mutacion va a una **server action**.
4. La action valida con **Zod**.
5. La action llama a un servicio de `application`.
6. El servicio usa interfaces/repositorios del dominio.
7. La persistencia concreta depende de `DATA_SOURCE`.
8. La action revalida rutas con `revalidatePath` o redirige.

---

## 6. Entidades principales del dominio

Definidas en `src/domain/entities/index.ts`.

- `User` - perfil, moneda por defecto, datos personales y redes.
- `Supermarket` - supermercado del usuario.
- `Category` - categoria base o personalizada.
- `Unit` - unidad base o personalizada.
- `GenericItem` - producto generico canonico del usuario.
- `BrandProduct` - version especifica por marca/presentacion de un generico.
- `Template` - plantilla reutilizable.
- `TemplateItem` - item dentro de una plantilla.
- `Purchase` - compra en estado `draft` o `completed`.
- `PurchaseLine` - linea individual de compra.
- `PriceObservation` - observacion historica de precio por producto/marca/supermercado.
- `PasswordResetToken` - token para reset en modo no Supabase.
- `FinancialTransaction` - transaccion financiera (ingreso, gasto, transferencia).
- `FinancialScannerExecution` - registro de ejecucion del escaner financiero.
- `FinancialScannedRecord` - transaccion detectada por el escaner, pendiente de revision.

### Relaciones importantes

- Un `User` posee supermercados, productos, plantillas y compras.
- Un `GenericItem` puede tener varios `BrandProduct`.
- Una `Template` contiene varios `TemplateItem`.
- Una `Purchase` contiene varias `PurchaseLine`.
- Una `PriceObservation` se asocia a un `BrandProduct` y un `Supermarket`.

---

## 7. Flujos de negocio clave

### 7.1 Crear compra

Implementado principalmente en `src/application/services/purchase-service.ts`.

- crea una compra en estado `draft`;
- toma una o varias plantillas;
- consolida items repetidos por producto generico;
- intenta recomendar marca/precio segun historial y observaciones;
- genera lineas iniciales para ejecutar la compra.

### 7.2 Ejecutar compra

- el usuario actualiza lineas;
- puede cambiar marca, precio, cantidad, unidad y checked;
- puede anadir productos no planificados;
- si la compra ya esta completada, ciertos cambios sincronizan observaciones de precio.

### 7.3 Finalizar compra

- valida que una linea marcada como comprada tenga precio valido;
- cambia estado a `completed`;
- guarda subtotal, descuento, impuesto y total;
- crea `PriceObservation` para lineas compradas con marca y precio.

### 7.4 Catalogo y precios

- `GenericItem` puede tener `globalPrice` como referencia general;
- `BrandProduct` tambien puede tener precio global;
- `PriceObservation` almacena precio real observado por supermercado y fecha;
- la analitica combina historial de compras y observaciones.

### 7.5 Analitica

`src/application/services/analytics-service.ts` genera:

- gasto mensual;
- gasto por categoria;
- top productos por frecuencia;
- top productos por monto gastado;
- historial de precios por producto generico o especifico;
- ultimos precios por supermercado.

### 7.6 Captura de transaccion por voz o texto libre

Alternativa asistida al formulario manual, detras de `NEXT_PUBLIC_FF_FINANCIAL_AI_CAPTURE`.

1. Los botones de "nueva transaccion" (dashboard, resumen financiero y listado) abren `NewTransactionDialog` en lugar de navegar. El modal pregunta el metodo: dictar, escribir o formulario.
2. Dentro del modal, el usuario dicta con `MediaRecorder` (maximo 60 s, con escucha previa y repetir) o escribe una frase. Elegir "formulario" cierra el modal y navega a `/financial/transactions/new`.
3. Un Server Action de `src/app/actions/financial-ai-capture.ts` reenvia el contenido al webhook de n8n correspondiente. El `userId` lo resuelve el servidor desde la sesion de Supabase; el navegador nunca lo envia.
4. La respuesta se valida con `aiExtractionSchema` (todos los campos opcionales y anulables) y se traduce a valores del asistente en `src/presentation/financial/lib/ai-extraction.ts`.
5. El modal deja la extraccion en `sessionStorage` (`ai-capture-handoff.ts`, se consume al leerse y caduca a los 10 min), cierra, y navega a `/financial/transactions/new?mode=review`. Alli `TransactionAiWizard` abre el `TransactionWizard` en modo `confirm`, es decir directo en el resumen, que necesita la pantalla completa. Los campos obligatorios que no se pudieron inferir se marcan y bloquean el guardado; un `amount` igual a 0 se trata como ausente. Si no hay nada que leer (recarga, URL guardada, captura caducada) cae al formulario manual con un aviso.
6. Cada institucion, categoria o cuenta se marca como existente o nueva, y las nuevas se listan al pie antes de confirmar. Se crean recien al confirmar, con la misma logica de nombre que ya usa `FinancialTransactionService.createTransaction`.
7. Nada se escribe hasta que el usuario confirma. La transaccion se guarda con la accion de crear de siempre, con el origen y el texto original en `originStats`.

---

## 8. Persistencia y modos de ejecucion

La app soporta 3 modos principales:

### `SUPABASE`

- persistencia real en Postgres/Supabase;
- autenticacion con Supabase Auth;
- middleware para actualizar sesion;
- migraciones en `supabase/migrations/*`.

### `MEMORY`

- repositorios en memoria;
- util para desarrollo local rapido;
- crea usuario de prueba y seed de datos.

### `MOCK`

- carga datos mock/seed para navegar el producto sin backend real.

### Punto de seleccion

- `src/infrastructure/container.ts`

### Variables de entorno mas relevantes

- `DATA_SOURCE`
- `NEXT_PUBLIC_AUTH_STRATEGY`
- `NEXT_PUBLIC_SESSION_TIMEOUT_MS`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_BASE_URL`

**Regla importante:** `DATA_SOURCE` y `NEXT_PUBLIC_AUTH_STRATEGY` deben coincidir.

---

## 9. Autenticacion y sesion

### Autenticacion

- actions en `src/app/actions/auth.ts`;
- en `SUPABASE` usa `supabase.auth.*`;
- en `MEMORY/MOCK` usa `AuthService` + cookie `kyber_session`.

### Guard de sesion

Archivos clave:

- `src/hooks/use-session-guard.ts`
- `src/lib/session/*`
- `src/presentation/components/session/*`
- `src/proxy.ts`

Capacidades actuales:

- cierre por inactividad;
- modal de advertencia;
- sincronizacion de logout entre pestanas;
- refresh proactivo de sesion en Supabase.

---

## 10. Tecnologias del proyecto

### Core

- Next.js 16 (`App Router`)
- React 19
- TypeScript 5

### UI

- Tailwind CSS 4
- Radix UI
- shadcn-style components en `src/components/ui`
- Lucide React
- Sonner
- Recharts
- Vaul

### Backend / datos

- Supabase (`@supabase/ssr`, `@supabase/supabase-js`)
- Zod para validacion
- UUID

### Testing

- Jest
- React Testing Library

### Deploy / build

- Docker
- salida `standalone` de Next.js

### PWA

- `@ducanh2912/next-pwa` como dependencia
- manifest en `src/app/manifest.ts`
- soporte de instalacion parcial activo

---

## 11. Estructura del proyecto

```text
.
|- docs/                       # Documentacion funcional y tecnica
|- definitions/                # PRD, flujos y definiciones de negocio
|- public/                     # Assets publicos e iconos PWA
|- src/
|  |- app/                     # Rutas, layouts, actions, api, manifest
|  |- application/             # Servicios/casos de uso
|  |- components/ui/           # UI base reutilizable
|  |- config/                  # Configuracion del menu y similares
|  |- domain/                  # Entidades y contratos
|  |- hooks/                   # Hooks compartidos
|  |- infrastructure/          # Repositorios, seeds, contenedor, supabase
|  |- lib/                     # Validators, session, utils, providers
|  |- presentation/components/ # Componentes de interfaz por modulo
|  |- __tests__/               # Tests generales y de UI
|- supabase/
|  |- migrations/              # Esquema y cambios de base de datos
|- next.config.ts              # Config de Next
|- Dockerfile                  # Imagen de produccion
|- package.json                # Scripts y dependencias
```

---

## 12. Documentos existentes que ya explican el producto

Si una IA necesita mas contexto antes de implementar algo, estos archivos son especialmente utiles:

- `README.md` - resumen general del proyecto.
- `definitions/prd-funcional.md` - flujos funcionales muy detallados.
- `definitions/session-management.md` - diseno del guard de sesion.
- `docs/supabase.md` - integracion con Supabase.
- `docs/pwa.md` - estado y consideraciones de PWA.
- `AGENTS.md` - reglas del repositorio y skills obligatorios.

---

## 13. Convenciones practicas para agregar funcionalidades

### Si se agrega una nueva regla de negocio

- crear o extender un servicio en `src/application/services/*`;
- no meter la logica importante solo en la pagina o solo en el componente.

### Si se agrega una nueva mutacion desde UI

- crear o extender una server action en `src/app/actions/*`;
- validar input con Zod en `src/lib/validators/*`;
- revalidar rutas afectadas.

### Si se agrega una nueva fuente de datos o cambia persistencia

- tocar interfaces en `src/domain/repositories` solo si cambia contrato;
- implementar repositorio concreto en `src/infrastructure/repositories/*`;
- registrar en `src/infrastructure/container.ts`.

### Si se agrega una nueva pantalla

- crear ruta en `src/app/...`;
- renderizar con componentes en `src/presentation/components/...`;
- reutilizar `AppLayout` en rutas privadas si aplica.

### Si se agrega una nueva entidad funcional

- definir entidad en `src/domain/entities/index.ts`;
- definir contrato de repositorio si hace falta;
- crear servicio o ampliar uno existente;
- conectar actions, paginas y componentes.

### Si se toca autenticacion o sesion

- revisar ambos modos: `SUPABASE` y `MEMORY/MOCK`;
- revisar `src/proxy.ts`, `src/app/actions/auth.ts` y `src/lib/session/*`.

### Si se toca compra o precios

- revisar especialmente `src/application/services/purchase-service.ts`, `src/application/services/product-service.ts` y `src/application/services/analytics-service.ts` porque estan altamente conectados.

---

## 14. Testing actual

Hay cobertura funcional y de servicios en:

- `src/__tests__/*`
- `src/application/services/__tests__/*`

Se prueban areas como:

- auth;
- compras;
- checklist de compra;
- productos;
- plantillas;
- precios globales;
- recomendacion de productos;
- analitica;
- eliminacion e historial de compras.

Script principal:

```bash
npm test
```

---

## 15. Estado actual y limites importantes

- la app esta funcionalmente centrada en gestion de compras personales;
- la arquitectura ya esta preparada para cambiar entre persistencia local y Supabase;
- el PWA esta parcialmente habilitado, pero el service worker completo no esta activo;
- el flujo de sesion es una pieza importante y ya tiene un diseno propio;
- muchas mutaciones usan server actions y dependen de `revalidatePath`;
- el modo `MEMORY/MOCK` existe para acelerar desarrollo y pruebas funcionales.

---

## 16. Resumen corto para una IA que vaya a extender el proyecto

Si vas a agregar algo a KyberLife, piensa asi:

- es una app Next.js 16 con App Router y TypeScript;
- el dominio principal es **compras + productos + precios + analitica**;
- la logica importante vive en `src/application/services/*`;
- las mutaciones entran por `src/app/actions/*` y validan con Zod;
- la persistencia cambia por `DATA_SOURCE` y se resuelve en `src/infrastructure/container.ts`;
- las rutas privadas ya usan layout, proteccion de sesion y componentes modulares;
- si una funcionalidad toca compras, casi seguro afecta compras, productos, observaciones de precio y analitica.

Con este mapa, una IA puede decidir con bastante precision **donde leer, donde implementar y que piezas revisar** antes de modificar el sistema.

---

## 17. Modulo Financiero - Arquitectura y flujo del escaner

El modulo financiero es la funcionalidad principal activa del proyecto. Su arquitectura involucra tres capas que se comunican de la siguiente manera:

### Flujo del escaner

1. El usuario selecciona un rango de fechas en `ScannerManager.tsx` y lanza un escaneo.
2. La server action `triggerFinancialScanAction` en `src/app/actions/financial-scanner.ts` convierte las fechas del calendario a instantes precisos en hora Ecuador (UTC-5): `startDay T00:00:00.000-05:00` y `endDay T23:59:59.999-05:00`.
3. La action hace POST al webhook de N8N (`N8N_SCANNER_WEBHOOK_URL`).
4. N8N ejecuta el workflow `financial-scanner`: construye un query de Gmail con epochs, busca correos, los parsea con IA y los inserta en `financial_scanner_transactions` de Supabase.
5. El front-end monitorea el progreso de la ejecucion via polling y/o suscripciones realtime de Supabase.

### Archivos clave del modulo financiero

- `src/app/actions/financial-scanner.ts` - server action que dispara el escaneo.
- `src/presentation/financial/components/ScannerManager.tsx` - UI completa del escaner: formulario, historial, monitoreo.
- `src/domain/entities/financial.ts` - entidades del dominio financiero.
- `src/infrastructure/repositories/supabase/financial-*` - repositorios Supabase.

### Gotchas conocidos

- **Formateo de horas en Ecuador**: Todas las fechas del escaner se muestran en zona `America/Guayaquil` usando `Intl.DateTimeFormat`. Al formatear sin segundos, Chrome redondea `.999` milisegundos al minuto siguiente. La funcion `formatEcuadorTime` trunca segundos/milisegundos antes de formatear para evitar este bug.
- **Fechas del payload a N8N**: Siempre se envian con offset explicito `-05:00`, no en UTC. Esto evita que el literal de fecha cambie de dia al cruzar la medianoche UTC.
- **Trigger source**: Las ejecuciones pueden ser `MANUAL` (usuario desde la UI) o `REALTIME_GMAIL` (disparadas automaticamente). La UI muestra ambas en el historial.
