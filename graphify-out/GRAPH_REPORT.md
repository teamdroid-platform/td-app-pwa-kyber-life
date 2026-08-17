# Graph Report - td-app-pwa-kyber-life  (2026-08-12)

## Corpus Check
- 492 files · ~320,150 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2743 nodes · 8354 edges · 164 communities (125 shown, 39 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 141 edges (avg confidence: 0.78)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5ea26761`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- card.tsx
- cn
- button.tsx
- ScannerManager.tsx
- UUID
- ScanDetailsForm.tsx
- date-range.ts
- entities/index.ts
- implementations.ts
- BrandProduct
- financial-settings.ts
- dropdown-menu.tsx
- TransactionDetailClient.tsx
- devDependencies
- getAuthUserId
- product.ts
- IRepository
- User
- financial-balance.ts
- Notification
- analytics/page.tsx
- FinancialCategory
- ai-capture-schemas.ts
- dependencies
- responsive-dialog.tsx
- TransactionTimeline.tsx
- FinancialScanExecution
- NotificationBell.tsx
- container.ts
- repositories/financial.ts
- compilerOptions
- session-strategy-factory.ts
- utils.ts
- FinancialTransaction
- TemplateItem
- MarketOverview.tsx
- server.ts
- PurchaseLine
- InMemoryFinancialTransactionRepository
- financial-transactions.ts
- core.ts
- useTransactionWizard.ts
- DateRangeFilter.tsx
- CaptureMethodChooser.tsx
- InstitutionManager.tsx
- FinancialInbox.tsx
- a
- TransactionAiWizard.tsx
- entities/financial.ts
- TransactionCard.tsx
- components.json
- transaction-wizard.test.tsx
- auth-user.ts
- GenericItem
- FinancialAccount
- analytics.ts
- financial-offline-store.ts
- v
- auth.ts
- CLAUDE.md
- autocomplete-input.tsx
- financial-dashboard-service.ts
- dashboard-range-filter.test.ts
- FinancialInstitution
- templates/[id]/page.tsx
- FinancialDashboard.tsx
- VoiceCaptureScreen.tsx
- z
- 20260201000000_initial_schema.sql
- workbox-f1770938.js
- Template
- use-toast.ts
- financial_transactions
- AuditTrail.tsx
- createClient
- Purchase
- constructor
- financial-dashboard.ts
- user.ts
- PurchaseCompletedView.tsx
- RouteLoading.tsx
- Supermarket
- manifest.json
- app/layout.tsx
- package.json
- master-data-schemas.ts
- r
- RouteError.tsx
- FinancialTransactionAuditLog
- 20260718120000_notifications.sql
- fallback-ce627215c0e4a9af.js
- financial-ai-capture.ts
- CategoryPieChart.tsx
- create-purchase-mock.test.ts
- recommendation-logic.test.ts
- NewTransactionDialog.tsx
- Sentry
- InstitutionBarChart.tsx
- HomeDashboard.tsx
- useFinancialRealtime.ts
- useTransactionsOffline.ts
- instrumentation.ts
- supermarket.ts
- sentry-example-api/route.ts
- proxy.ts
- BalanceHeroCard.tsx
- jest.config.js
- notifications/route.ts
- sentry-example-page/page.tsx
- 20260719000000_notifications_scanner_transactions_backup.sql
- next.config.ts
- 20260718130000_notifications_webhook.sql
- class-variance-authority
- cmdk
- date-fns
- @ducanh2912/next-pwa
- eslint.config.mjs
- jest-environment-jsdom
- lucide-react
- .mcp.json
- radix-ui
- @radix-ui/react-alert-dialog
- @radix-ui/react-dialog
- @radix-ui/react-select
- @radix-ui/react-slot
- @radix-ui/react-tabs
- recharts
- sonner
- @supabase/supabase-js
- tailwind-merge
- @types/bcryptjs
- web-push
- zod
- postcss.config.mjs
- instrumentation-client.ts
- uuid.js
- public.profiles
- next-themes

## God Nodes (most connected - your core abstractions)
1. `cn()` - 229 edges
2. `createClient()` - 162 edges
3. `Button()` - 95 edges
4. `FinancialTransaction` - 90 edges
5. `GenericItem` - 66 edges
6. `Category` - 54 edges
7. `PurchaseLine` - 53 edges
8. `Unit` - 51 edges
9. `BrandProduct` - 48 edges
10. `initializeContainer()` - 46 edges

## Surprising Connections (you probably didn't know these)
- `renderForm()` --indirect_call--> `getTransactionFormOptionsAction()`  [INFERRED]
  __tests__/components/scan-details-form.test.tsx → src/app/actions/financial-settings.ts
- `renderForm()` --indirect_call--> `getTransactionFormOptionsAction()`  [INFERRED]
  __tests__/components/transaction-form.test.tsx → src/app/actions/financial-settings.ts
- `renderDetail()` --indirect_call--> `getTransactionFormOptionsAction()`  [INFERRED]
  __tests__/components/transaction-detail-client.test.tsx → src/app/actions/financial-settings.ts
- `renderDetail()` --indirect_call--> `getTransactionFormOptionsAction()`  [INFERRED]
  __tests__/components/transaction-detail-wizard.test.tsx → src/app/actions/financial-settings.ts
- `MockLineRepo` --inherits--> `InMemoryRepository`  [EXTRACTED]
  __tests__/services/analytics-service.test.ts → src/infrastructure/repositories/in-memory-repository.ts

## Import Cycles
- None detected.

## Communities (164 total, 39 thin omitted)

### Community 0 - "card.tsx"
Cohesion: 0.05
Nodes (67): initialState, Card(), CardContent(), CardDescription(), CardHeader(), CardTitle(), RobotLoader(), RobotLoaderProps (+59 more)

### Community 1 - "cn"
Cohesion: 0.05
Nodes (60): logoutAction(), Supermarket, Template, Home(), Avatar(), AvatarBadge(), AvatarFallback(), AvatarGroup() (+52 more)

### Community 2 - "button.tsx"
Cohesion: 0.13
Nodes (29): createTemplateAction(), updateTemplateItemAction(), initialState, SupermarketDialogProps, CreateTemplateDialog(), CreateTemplateForm(), EditTemplateDialogProps, Button() (+21 more)

### Community 3 - "ScannerManager.tsx"
Cohesion: 0.10
Nodes (27): getScanExecutionsAction(), getScannerDayCountsAction(), triggerFinancialScanAction(), metadata, TestPage(), StatCard(), StatCardProps, Tooltip() (+19 more)

### Community 4 - "UUID"
Cohesion: 0.08
Nodes (4): emptyCounts(), FinancialSettingsService, SubscribeToPushDTO, UUID

### Community 5 - "ScanDetailsForm.tsx"
Cohesion: 0.07
Nodes (41): dismissInboxTransactionAction(), formatZodError(), getAuthUserId(), mapInboxTransactionAction(), stripNulls(), getTransactionSuggestionsAction(), getUniqueTagsAction(), FieldCard() (+33 more)

### Community 6 - "date-range.ts"
Cohesion: 0.17
Nodes (20): createTransactionAction(), DateTimeStepInput(), DateTimeStepInputProps, splitValue(), APP_TIMEZONE, computeDateRange(), ResolvedRange, roundToNearestFiveMinutes() (+12 more)

### Community 7 - "entities/index.ts"
Cohesion: 0.10
Nodes (27): CurrencyCode, PurchaseStatus, IBrandProductRepository, ICategoryRepository, IGenericItemRepository, IPriceObservationRepository, IPurchaseRepository, ISupermarketRepository (+19 more)

### Community 8 - "implementations.ts"
Cohesion: 0.08
Nodes (25): PurchaseService, PriceObservation, ITemplateRepository, InMemoryBrandProductRepository, InMemoryCategoryRepository, InMemoryFinancialInstitutionRepository, InMemoryFinancialInstitutionTypeRepository, InMemoryFinancialScannerTransactionRepository (+17 more)

### Community 9 - "BrandProduct"
Cohesion: 0.07
Nodes (8): BrandProductDialogProps, AnalyticsService, ProductService, BrandProduct, SupabaseBrandProductRepository, PriceAnalyticsProps, PurchaseItemCardProps, PurchaseItemRowProps

### Community 10 - "financial-settings.ts"
Cohesion: 0.08
Nodes (49): getScannerTransactionByIdAction(), createAccountAction(), createCategoryAction(), createInstitutionAction(), createInstitutionTypeAction(), deleteAccountAction(), deleteCategoryAction(), deleteInstitutionAction() (+41 more)

### Community 11 - "dropdown-menu.tsx"
Cohesion: 0.07
Nodes (39): createCategoryAction(), createSupermarketAction(), createTemplateAction(), createUnitAction(), deleteCategoryAction(), deleteSupermarketAction(), deleteUnitAction(), getUserId() (+31 more)

### Community 12 - "TransactionDetailClient.tsx"
Cohesion: 0.09
Nodes (37): updateInstitutionAction(), updateTransactionAction(), AccordionField(), AccordionFieldProps, StickyActionBar(), StickyActionBarProps, Switch(), SwitchProps (+29 more)

### Community 13 - "devDependencies"
Cohesion: 0.05
Nodes (42): @babel/core, babel-jest, @babel/preset-env, @babel/preset-react, @babel/preset-typescript, eslint, eslint-config-next, jest (+34 more)

### Community 14 - "getAuthUserId"
Cohesion: 0.23
Nodes (14): bulkArchiveTransactionsAction(), bulkCategorizeTransactionsAction(), bulkConfirmTransactionsAction(), bulkDeleteTransactionsAction(), bulkRejectTransactionsAction(), formatZodError(), getAuthUserId(), getTransactionByIdAction() (+6 more)

### Community 15 - "product.ts"
Cohesion: 0.07
Nodes (49): addAliasAction(), addPriceObservationAction(), createBrandProductAction(), createGenericItemAction(), deleteBrandProductAction(), getBrandProductsAction(), getGenericItemsAction(), getUserId() (+41 more)

### Community 16 - "IRepository"
Cohesion: 0.17
Nodes (8): FinancialInboxService, MapScannerTransactionDTO, normalizeForMatch(), IFinancialInstitutionRepository, IFinancialScannerTransactionRepository, IFinancialTransactionAuditLogRepository, IFinancialTransactionRepository, IRepository

### Community 17 - "User"
Cohesion: 0.09
Nodes (13): AuthService, ChangePasswordDTO, LoginDTO, RegisterDTO, UpdateProfileDTO, UserService, PasswordResetToken, User (+5 more)

### Community 18 - "financial-balance.ts"
Cohesion: 0.12
Nodes (17): FinancialDashboardService, BalanceTransaction, computeNetBalance(), DASHBOARD_ACTIVE_STATUSES, FUNDING_CATEGORY_NAME, isFundingTransfer(), isIncomeType(), isOtherType() (+9 more)

### Community 19 - "Notification"
Cohesion: 0.10
Nodes (7): NotificationService, Notification, INotificationRepository, InMemoryNotificationRepository, SupabaseNotificationRepository, build(), setup()

### Community 20 - "analytics/page.tsx"
Cohesion: 0.22
Nodes (6): AnalyticsPage(), Props, purchaseRepository, CategoryAnalytics(), ExpenseAnalytics(), ProductAnalytics()

### Community 21 - "FinancialCategory"
Cohesion: 0.09
Nodes (17): DashboardContext, FinancialCategory, IFinancialCategoryRepository, IFinancialInstitutionTypeRepository, InMemoryFinancialCategoryRepository, SupabaseFinancialCategoryRepository, CategoryPickerProps, CategoryManagerProps (+9 more)

### Community 22 - "ai-capture-schemas.ts"
Cohesion: 0.14
Nodes (16): ACCEPTED_AUDIO_TYPES, aiExtractionSchema, ExtractFromTextInput, extractFromTextSchema, EXTRACTION_KEYS, extractionFieldsSchema, looksLikeExtraction(), looseBoolean (+8 more)

### Community 23 - "dependencies"
Cohesion: 0.06
Nodes (33): bcryptjs, clsx, next, dependencies, bcryptjs, clsx, next, @radix-ui/react-avatar (+25 more)

### Community 24 - "responsive-dialog.tsx"
Cohesion: 0.13
Nodes (24): updateGenericItemAction(), EditProfileDialog(), EditProfileDialogProps, Dialog(), DialogClose(), DialogContent(), DialogDescription(), DialogFooter() (+16 more)

### Community 25 - "TransactionTimeline.tsx"
Cohesion: 0.23
Nodes (13): searchAllFilteredTransactionsAction(), searchPaginatedTransactionsAction(), dynamic, revalidate, TransactionsPage(), buildFallbackTitle(), formatDateLabel(), groupTransactionsByDate() (+5 more)

### Community 26 - "FinancialScanExecution"
Cohesion: 0.17
Nodes (5): FinancialScanService, StartScanDTO, FinancialScanExecution, FinancialScanStatus, SupabaseFinancialScanExecutionRepository

### Community 27 - "NotificationBell.tsx"
Cohesion: 0.15
Nodes (24): formatZodError(), getUnreadNotificationCountAction(), listNotificationsAction(), markAllNotificationsReadAction(), markNotificationReadAction(), formatZodError(), subscribeToPushAction(), unsubscribeFromPushAction() (+16 more)

### Community 28 - "container.ts"
Cohesion: 0.09
Nodes (21): brandProductRepository, categoryRepository, financialAccountRepository, financialCategoryRepository, financialInboxService, financialInstitutionRepository, financialInstitutionTypeRepository, financialScannerTransactionRepository (+13 more)

### Community 29 - "repositories/financial.ts"
Cohesion: 0.20
Nodes (10): CreateFinancialTransactionDTO, VALID_TRANSITIONS, FinancialTransactionStatus, PaginatedResult, PaginationParams, TransactionSearchFilters, DashboardRangeFilter, IFinancialScanExecutionRepository (+2 more)

### Community 30 - "compilerOptions"
Cohesion: 0.06
Nodes (30): debug.ts, dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts (+22 more)

### Community 31 - "session-strategy-factory.ts"
Cohesion: 0.12
Nodes (15): ACTIVITY_EVENTS, DEFAULT_CONFIG, useSessionGuard(), MockSessionStrategy, createSessionStrategy(), SupabaseSessionStrategy, ISessionStrategy, LOGOUT_BROADCAST_KEY (+7 more)

### Community 32 - "utils.ts"
Cohesion: 0.11
Nodes (30): withSelectedFirst(), CategoryPicker(), InstitutionEditDialog(), PendingInstitutionEdit, InstitutionPicker(), PickerCreateButton(), PickerCreateButtonProps, PickerEmptyHint() (+22 more)

### Community 33 - "FinancialTransaction"
Cohesion: 0.10
Nodes (8): assertValidTransition(), FinancialTransactionService, FinancialTransaction, findDuplicates(), generateTransactionFingerprint(), SupabaseFinancialTransactionRepository, TransactionDetailClientProps, TransactionSummaryProps

### Community 34 - "TemplateItem"
Cohesion: 0.12
Nodes (5): TemplateService, TemplateItem, ITemplateItemRepository, SupabaseTemplateItemRepository, loadMockData()

### Community 35 - "MarketOverview.tsx"
Cohesion: 0.10
Nodes (18): MarketOverview(), MarketOverviewProps, DashboardEmptyState(), DashboardEmptyStateProps, MetricCard(), MetricCardProps, MetricsCarousel(), MetricsCarouselProps (+10 more)

### Community 36 - "server.ts"
Cohesion: 0.10
Nodes (28): loginAction(), registerAction(), LoginPage(), RegisterPage(), getAllProductsPriceHistories(), getProductPriceHistory(), MarketLayout(), PurchaseDetailPage() (+20 more)

### Community 37 - "PurchaseLine"
Cohesion: 0.10
Nodes (5): PurchaseLine, IPurchaseLineRepository, InMemoryPurchaseLineRepository, SupabasePurchaseLineRepository, MockLineRepo

### Community 39 - "financial-transactions.ts"
Cohesion: 0.13
Nodes (21): financialTransactionService, bulkActionSchema, bulkCategorizeSchema, CreateTransactionInput, createTransactionSchema, dismissInboxSchema, MapInboxTransactionInput, mapInboxTransactionSchema (+13 more)

### Community 40 - "core.ts"
Cohesion: 0.16
Nodes (9): PushSubscriptionService, BaseEntity, ISODate, NotificationType, PushSubscription, PushSubscriptionKeys, IPushSubscriptionRepository, NotificationQueryOptions (+1 more)

### Community 41 - "useTransactionWizard.ts"
Cohesion: 0.07
Nodes (36): TagInput(), TagInputProps, formatAmount(), formatDate(), formatShortDate(), MarkableField, NOTES_ORIGIN_LABEL, RowProps (+28 more)

### Community 42 - "DateRangeFilter.tsx"
Cohesion: 0.11
Nodes (25): DateRangePicker(), DateRangePickerProps, PeriodFilter(), PeriodFilterProps, PeriodOption, PopoverContent, formatDayLabel(), formatRangeLabel() (+17 more)

### Community 43 - "CaptureMethodChooser.tsx"
Cohesion: 0.21
Nodes (11): CaptureMethod, CaptureMethodChooser(), CaptureMethodChooserProps, MethodOption, METHODS, CaptureShell(), CaptureSourceNoteProps, ExtractingScreen() (+3 more)

### Community 44 - "InstitutionManager.tsx"
Cohesion: 0.21
Nodes (15): TransactionTypeCounts, SettingsListControls(), SettingsListControlsProps, TransactionCountSummary(), TransactionCountSummaryProps, dominantRank(), SETTINGS_SORT_OPTIONS, SettingsSortMode (+7 more)

### Community 45 - "FinancialInbox.tsx"
Cohesion: 0.19
Nodes (11): getUnprocessedInboxTransactionsAction(), metadata, EditState, extractSummary(), FinancialInbox(), formatAmount(), formatDateLabel(), formatTime() (+3 more)

### Community 47 - "TransactionAiWizard.tsx"
Cohesion: 0.12
Nodes (26): AiExtraction, AiCaptureReview(), ReviewState, CaptureSourceNote(), EntityStatusBadge(), PendingCreationsNotice(), TransactionAiWizard(), TransactionAiWizardProps (+18 more)

### Community 48 - "entities/financial.ts"
Cohesion: 0.19
Nodes (12): FinancialTransactionType, AmountStep(), AmountStepProps, SKELETON_WIDTHS, SUGGESTION_SCOPE, DEFAULT_TRANSACTION_TYPE_OPTIONS, FALLBACK_TYPE_LABELS, TransactionTypeChips() (+4 more)

### Community 49 - "TransactionCard.tsx"
Cohesion: 0.22
Nodes (12): archiveTransactionAction(), reviewTransactionAction(), softDeleteTransactionAction(), formatAmount(), formatTime(), getFallbackDescription(), TransactionCard(), TransactionCardProps (+4 more)

### Community 50 - "components.json"
Cohesion: 0.11
Nodes (18): aliases, components, hooks, lib, ui, utils, iconLibrary, registries (+10 more)

### Community 51 - "transaction-wizard.test.tsx"
Cohesion: 0.07
Nodes (22): getTransactionFormOptionsAction(), delay(), EMPTY, useTransactionFormOptions(), now, renderDetail(), TRANSACTION, renderDetail() (+14 more)

### Community 52 - "auth-user.ts"
Cohesion: 0.25
Nodes (8): DashboardLayout(), DashboardPage(), FinancialLayout(), metadata, ProfileLayout(), userRepository, getAuthUser, AppLayout()

### Community 53 - "GenericItem"
Cohesion: 0.07
Nodes (22): CreateProductButtonProps, EditProductButtonProps, GenericItemCardProps, GenericItemDialogProps, NewPurchaseFormProps, CategoryDialogProps, UnitDialogProps, AddItemDialogProps (+14 more)

### Community 54 - "FinancialAccount"
Cohesion: 0.23
Nodes (4): FinancialAccount, IFinancialAccountRepository, InMemoryFinancialAccountRepository, SupabaseFinancialAccountRepository

### Community 55 - "analytics.ts"
Cohesion: 0.36
Nodes (8): getCategorySpendingAction(), getFrequentProductsAction(), getGenericPriceAnalyticsAction(), getMonthlyExpensesAction(), getPriceAnalyticsAction(), getUserId(), resolveUserId(), PriceAnalytics()

### Community 56 - "financial-offline-store.ts"
Cohesion: 0.14
Nodes (14): metadata, CacheEntry, clearStore(), financialOfflineStore, getAllEntries(), getEntry(), openDatabase(), putEntry() (+6 more)

### Community 57 - "v"
Cohesion: 0.33
Nodes (4): m(), st(), U(), v

### Community 58 - "auth.ts"
Cohesion: 0.18
Nodes (13): forgotPasswordAction(), resetPasswordAction(), resolveBaseUrl(), RecoverPasswordPageContent(), RestorePasswordForm(), ForgotPasswordInput, forgotPasswordSchema, LoginInput (+5 more)

### Community 59 - "CLAUDE.md"
Cohesion: 0.18
Nodes (9): Architecture, Commands, Data source switching, graphify, Project, Project rules (from AGENTS.md), Routing / auth middleware, Server Action pattern (+1 more)

### Community 60 - "autocomplete-input.tsx"
Cohesion: 0.36
Nodes (5): AutocompleteInput(), AutocompleteInputProps, countActiveFilters(), TABS, TransactionTabs()

### Community 61 - "financial-dashboard-service.ts"
Cohesion: 0.13
Nodes (22): getMarketOverviewAction(), CategoryBreakdown, DailyBreakdown, DashboardOverview, FinancialKPIs, InstitutionBreakdown, MonthlyBreakdown, TypeBreakdown (+14 more)

### Community 62 - "dashboard-range-filter.test.ts"
Cohesion: 0.25
Nodes (3): ALL, END, START

### Community 63 - "FinancialInstitution"
Cohesion: 0.17
Nodes (9): FinancialInstitution, SupabaseFinancialInstitutionRepository, AccountManagerProps, TransactionFiltersProps, makeInst(), setup(), stubAcc, stubCat (+1 more)

### Community 64 - "templates/[id]/page.tsx"
Cohesion: 0.09
Nodes (26): CreateProductButton(), GenericItemCard(), ItemsPage(), ItemsPageProps, ProductCategoryGroup(), ProductCategoryGroupProps, ProductSearch(), PurchaseDetailPageProps (+18 more)

### Community 65 - "FinancialDashboard.tsx"
Cohesion: 0.29
Nodes (14): useDebouncedValue(), defaultHubCustomRange(), HomeDashboard(), DASHBOARD_TABS, FinancialDashboard(), formatCurrency(), formatRangeLabel(), useFinancialDashboard() (+6 more)

### Community 66 - "VoiceCaptureScreen.tsx"
Cohesion: 0.21
Nodes (13): MAX_AUDIO_SECONDS, BAR_HEIGHTS, formatClock(), VoiceCaptureScreen(), VoiceCaptureScreenProps, AudioRecording, describeMicError(), extensionFor() (+5 more)

### Community 67 - "z"
Cohesion: 0.18
Nodes (3): n(), et, z()

### Community 68 - "20260201000000_initial_schema.sql"
Cohesion: 0.33
Nodes (13): public.handle_new_user, on_auth_user_created, public.market_brand_products, public.market_categories, public.market_generic_items, public.market_price_observations, public.market_purchase_lines, public.market_purchases (+5 more)

### Community 69 - "workbox-f1770938.js"
Cohesion: 0.23
Nodes (8): G, get(), h(), i, k(), O(), s, T()

### Community 71 - "use-toast.ts"
Cohesion: 0.17
Nodes (15): Action, ActionType, actionTypes, addToRemoveQueue(), dispatch(), genId(), listeners, memoryState (+7 more)

### Community 72 - "financial_transactions"
Cohesion: 0.29
Nodes (12): financial_accounts, financial_categories, financial_institutions, financial_scan_executions, financial_transaction_audit_logs, financial_transactions, auth, auth.users (+4 more)

### Community 73 - "AuditTrail.tsx"
Cohesion: 0.47
Nodes (5): getAuditTrailAction(), ACTION_LABELS, AuditTrail(), AuditTrailProps, formatTimestamp()

### Community 74 - "createClient"
Cohesion: 0.12
Nodes (10): GET(), FinancialInstitutionType, FinancialScannerTransaction, SupabaseFinancialScannerTransactionRepository, SupabaseInstitutionTypeRepository, SupabasePriceObservationRepository, createClient(), InstitutionEditDialogProps (+2 more)

### Community 75 - "Purchase"
Cohesion: 0.25
Nodes (3): Purchase, SupabasePurchaseRepository, PurchaseCompletedViewProps

### Community 76 - "constructor"
Cohesion: 0.21
Nodes (5): b(), constructor(), deleteCacheAndMetadata(), F, p()

### Community 77 - "financial-dashboard.ts"
Cohesion: 0.24
Nodes (14): formatZodError(), getAuthUserId(), getCategoryBreakdownAction(), getDailyBreakdownAction(), getDashboardOverviewAction(), getFinancialKPIsAction(), getInstitutionBreakdownAction(), getMonthlyBreakdownAction() (+6 more)

### Community 78 - "user.ts"
Cohesion: 0.27
Nodes (8): changePasswordAction(), updateProfileAction(), ProfileForm(), authService, ChangePasswordInput, changePasswordSchema, UpdateProfileInput, updateProfileSchema

### Community 79 - "PurchaseCompletedView.tsx"
Cohesion: 0.13
Nodes (24): addMultipleTemplateItemsAction(), deleteTemplateAction(), getUserId(), removeTemplateItemAction(), updateTemplateAction(), DeleteTemplateButton(), AddItemDialog(), RemoveTemplateItemButton() (+16 more)

### Community 81 - "Supermarket"
Cohesion: 0.15
Nodes (3): MasterDataService, Supermarket, SupabaseSupermarketRepository

### Community 82 - "manifest.json"
Cohesion: 0.18
Nodes (10): background_color, description, display, icons, name, orientation, scope, short_name (+2 more)

### Community 83 - "app/layout.tsx"
Cohesion: 0.24
Nodes (6): inter, metadata, viewport, Toaster(), ThemeProvider(), PwaInstallPrompt()

### Community 84 - "package.json"
Cohesion: 0.20
Nodes (9): name, private, scripts, build, dev, lint, start, test (+1 more)

### Community 85 - "master-data-schemas.ts"
Cohesion: 0.20
Nodes (9): createCategorySchema, createSupermarketSchema, createUnitSchema, deleteCategorySchema, deleteSupermarketSchema, deleteUnitSchema, updateCategorySchema, updateSupermarketSchema (+1 more)

### Community 89 - "20260718120000_notifications.sql"
Cohesion: 0.36
Nodes (7): notify_on_scanner_execution_change, notifications, notify_on_scanner_execution_change(), push_subscriptions, auth, auth.users, trg_notify_on_scanner_execution_change

### Community 90 - "fallback-ce627215c0e4a9af.js"
Cohesion: 0.36
Nodes (4): f(), h(), r(), u()

### Community 91 - "financial-ai-capture.ts"
Cohesion: 0.25
Nodes (11): describeFailure(), extractTransactionFromAudioAction(), extractTransactionFromTextAction(), formatZodError(), readExtraction(), requireWebhookUrl(), isEmptyExtraction(), readReportedFailure() (+3 more)

### Community 92 - "CategoryPieChart.tsx"
Cohesion: 0.40
Nodes (5): CategoryPieChart(), CategoryPieChartProps, DISTINCT_COLORS, formatCurrency(), SliceDatum

### Community 93 - "create-purchase-mock.test.ts"
Cohesion: 0.25
Nodes (7): mockBrandProductRepo, mockGenericItemRepo, mockLineRepo, mockObservationRepo, mockPurchaseRepo, mockTemplateItemRepo, mockTemplateRepo

### Community 94 - "recommendation-logic.test.ts"
Cohesion: 0.25
Nodes (7): mockBrandProductRepo, mockGenericItemRepo, mockLineRepo, mockObservationRepo, mockPurchaseRepo, mockTemplateItemRepo, mockTemplateRepo

### Community 95 - "NewTransactionDialog.tsx"
Cohesion: 0.19
Nodes (10): ExtractionResult, MAX_CAPTURE_TEXT, DialogScreen, NewTransactionDialog(), NewTransactionDialogProps, subscribeToNothing(), EXAMPLES, TextCaptureScreen() (+2 more)

### Community 96 - "Sentry"
Cohesion: 0.29
Nodes (6): mcp, Sentry, $schema, oauth, type, url

### Community 97 - "InstitutionBarChart.tsx"
Cohesion: 0.40
Nodes (5): COLORS, CustomTooltip(), formatCurrency(), InstitutionBarChart(), InstitutionBarChartProps

### Community 98 - "HomeDashboard.tsx"
Cohesion: 0.10
Nodes (21): DashboardLoading(), currency(), ModuleColumnProps, useFinancialOverview(), SparkStatCard(), SparkStatCardProps, StatTile(), StatTileProps (+13 more)

### Community 99 - "useFinancialRealtime.ts"
Cohesion: 0.15
Nodes (14): FinancialNotificationCenter(), FinancialNotificationCenterProps, formatAmount(), ScanExecutionPayload, ScannerTransactionPayload, TransactionPayload, FinancialRealtimeProvider(), ConnectionStatus (+6 more)

### Community 100 - "useTransactionsOffline.ts"
Cohesion: 0.50
Nodes (4): searchTransactionsAction(), SearchParams, TransactionsOfflineState, useTransactionsOffline()

### Community 102 - "supermarket.ts"
Cohesion: 0.70
Nodes (4): createSupermarketAction(), deleteSupermarketAction(), getUserId(), updateSupermarketAction()

### Community 104 - "proxy.ts"
Cohesion: 0.60
Nodes (3): updateSession(), config, proxy()

### Community 105 - "BalanceHeroCard.tsx"
Cohesion: 0.67
Nodes (3): BalanceHeroCard(), BalanceHeroCardProps, formatCurrency()

### Community 106 - "jest.config.js"
Cohesion: 0.50
Nodes (3): createJestConfig, customJestConfig, nextJest

### Community 120 - ".mcp.json"
Cohesion: 0.50
Nodes (3): graphify-mcp, graphify, Sentry

## Knowledge Gaps
- **502 isolated node(s):** `Sentry`, `graphify-mcp`, `Project`, `Commands`, `Server Action pattern` (+497 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **39 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `UUID` connect `UUID` to `button.tsx`, `entities/index.ts`, `implementations.ts`, `BrandProduct`, `financial-settings.ts`, `IRepository`, `User`, `financial-balance.ts`, `Notification`, `FinancialCategory`, `FinancialScanExecution`, `repositories/financial.ts`, `FinancialTransaction`, `TemplateItem`, `PurchaseLine`, `InMemoryFinancialTransactionRepository`, `core.ts`, `InstitutionManager.tsx`, `entities/financial.ts`, `GenericItem`, `FinancialAccount`, `financial-dashboard-service.ts`, `FinancialInstitution`, `Template`, `createClient`, `Purchase`, `Supermarket`, `FinancialTransactionAuditLog`?**
  _High betweenness centrality (0.132) - this node is a cross-community bridge._
- **Why does `cn()` connect `cn` to `card.tsx`, `button.tsx`, `ScannerManager.tsx`, `ScanDetailsForm.tsx`, `date-range.ts`, `financial-settings.ts`, `dropdown-menu.tsx`, `TransactionDetailClient.tsx`, `product.ts`, `financial-balance.ts`, `responsive-dialog.tsx`, `NotificationBell.tsx`, `utils.ts`, `MarketOverview.tsx`, `server.ts`, `useTransactionWizard.ts`, `DateRangeFilter.tsx`, `CaptureMethodChooser.tsx`, `InstitutionManager.tsx`, `FinancialInbox.tsx`, `entities/financial.ts`, `TransactionCard.tsx`, `auth-user.ts`, `analytics.ts`, `autocomplete-input.tsx`, `templates/[id]/page.tsx`, `FinancialDashboard.tsx`, `VoiceCaptureScreen.tsx`, `PurchaseCompletedView.tsx`, `HomeDashboard.tsx`, `BalanceHeroCard.tsx`?**
  _High betweenness centrality (0.078) - this node is a cross-community bridge._
- **Why does `Button()` connect `button.tsx` to `card.tsx`, `cn`, `ScanDetailsForm.tsx`, `financial-settings.ts`, `dropdown-menu.tsx`, `TransactionDetailClient.tsx`, `getAuthUserId`, `product.ts`, `responsive-dialog.tsx`, `TransactionTimeline.tsx`, `NotificationBell.tsx`, `utils.ts`, `MarketOverview.tsx`, `CaptureMethodChooser.tsx`, `InstitutionManager.tsx`, `FinancialInbox.tsx`, `TransactionAiWizard.tsx`, `financial-offline-store.ts`, `templates/[id]/page.tsx`, `VoiceCaptureScreen.tsx`, `PurchaseCompletedView.tsx`, `app/layout.tsx`, `RouteError.tsx`, `NewTransactionDialog.tsx`, `HomeDashboard.tsx`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **What connects `Sentry`, `graphify-mcp`, `Project` to the rest of the system?**
  _502 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `card.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.05209397344228805 - nodes in this community are weakly interconnected._
- **Should `cn` be split into smaller, more focused modules?**
  _Cohesion score 0.04683544303797468 - nodes in this community are weakly interconnected._
- **Should `button.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.12788461538461537 - nodes in this community are weakly interconnected._