# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Fixed
- **Financial Scanner (UI)**: Corregido bug de redondeo en la hora de fin del rango de escaneo. `Intl.DateTimeFormat` en Chrome redondeaba `23:59:59.999` a `00:00` al formatear sin segundos, causando que el historial mostrara rangos `00:00 - 00:00`. Se truncan segundos y milisegundos antes de formatear (`formatEcuadorTime` en `ScannerManager.tsx`).

### Changed
- **Financial Module (Dashboard & Charts)**:
  - Se optimizó el gráfico del resumen financiero (`TransactionSummary`) para usar datos globales basados en los filtros, independientemente del paginado o scroll de la línea de tiempo.
  - Se incorporó un toggle visual para cambiar entre gráfico de Barras (BarChart) y Dona (Donut). Por defecto en dispositivos móviles se muestra el gráfico de barras, mientras que en pantallas grandes el de dona.
  - Se incrementó el grosor de las barras (`maxBarSize`) para mayor legibilidad y aprovechamiento del espacio horizontal.
  - El toggle fue alineado a la derecha, sincronizándolo estéticamente con otros selectores de fecha del dashboard.
  - Se reestructuró la lógica de filtros personalizados de fechas: Al seleccionar "Personalizado", el rango por defecto se autocompleta desde el día 22 del mes anterior a las 00:00, hasta el día 21 del mes actual a las 23:59 (útil para cortes contables de tarjeta de crédito).
- **Financial Module (UI/UX)**:
  - Restructured `ScannerManager` UI for mobile responsiveness, changing execution history cards to a compact, collapsible accordion layout.
  - Replaced `Tooltip` with `Popover` for failed execution details to guarantee touch compatibility on mobile devices.
  - Limited recommended scan ranges to two items on mobile views for cleaner layout.
  - Refined `TransactionSummary` and `TransactionFilters` colors to support both light and dark mode securely using theme tokens.
  - Improved `TransactionCard` layout by positioning action buttons side-by-side horizontally and updating context button texts.
  - Added "Balance" label next to the balance amount in transaction cards.

### Added
- **Financial Module**:
  - Added full transaction management module including income, expense, and transfer tracking.
  - Introduced `FinancialInbox` for processing scanned transactions automatically from bank notifications.
  - Added `TransactionTimeline` with advanced filtering and real-time Supabase subscriptions.
  - Comprehensive auditing and logging of transaction lifecycle.
  - Updated `README.md` to reflect the new financial management features.

### Fixed
- **Financial Module**:
  - Corregida la búsqueda de texto libre (`search query`) en transacciones: Ahora soporta múltiples palabras inconexas filtrando concurrentemente sobre campos de Descripción, Categoría e Institución.
  - Corregido el cálculo de porcentajes del gráfico de dona renombrando la variable interna de mapeo (evitando la colisión con la variable `percent` calculada por Recharts).
  - Corregido el renderizado de los íconos de las transacciones en los gráficos, asegurando que se pinten respetando el color de su respectiva categoría.
  - Corregida prueba de integración `__tests__/integration/financial-supabase.test.ts` añadiendo el método `.or()` al mock del cliente para validar la nueva búsqueda compleja.
  - Fixed a state transition bug when deleting transactions by using hard deletes instead of updating to a `DELETED` state.
  - Resolved erroneous "offline cache" warnings in `TransactionTimeline` by accurately checking `navigator.onLine` instead of assuming filtered queries were cached.
  - Fixed an import collision causing a ReferenceError (`Link is not defined`) in `TransactionCard`'s DropdownMenu by renaming the import to `NextLink`.
- **Database**:
  - Purged existing soft-deleted transactions (`status = 'DELETED'`) via direct hard deletion query to maintain consistency with the new logic.

### Added
- **Environment Configuration**:
  - Documented all environment variables in `.env.example`: feature flags (`NEXT_PUBLIC_FF_FINANCIAL_*`), `NEXT_PUBLIC_BASE_URL`, `N8N_SCANNER_WEBHOOK_URL`, polling interval.
  - Added `N8N_SCANNER_WEBHOOK_URL` support for automated financial scanning via N8N webhook.
  - Added UUID validation for scanner `executionId` in `FinancialInboxService` to prevent broken foreign key references.
- **Scans Inbox UI**:
  - Redesigned `FinancialInbox` with compact card layout, inline type/merchant editing, and subtle polling status indicator.
  - Replaced full-screen reload with silent background merge of new records.
  - Added warning popover for `relatedTransactionHint` to save space.

### Fixed
- **Scans Inbox**: Type select not loading the suggested value on first render — added `normalizeTransactionType` helper.
- **Financial Module**: Fixed `realtimeStatus` unused variable lint warnings in `FinancialDashboard` and `TransactionTimeline`.
- **Session handling**: Added `useEffect` mount guard to `Sidebar` to prevent hydration mismatch with Radix UI components.
