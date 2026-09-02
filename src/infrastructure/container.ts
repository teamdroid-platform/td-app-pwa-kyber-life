import {
    InMemoryUserRepository,
    InMemorySupermarketRepository,
    InMemoryCategoryRepository,
    InMemoryUnitRepository,
    InMemoryGenericItemRepository,
    InMemoryBrandProductRepository,
    InMemoryTemplateRepository,
    InMemoryTemplateItemRepository,
    InMemoryPurchaseRepository,
    InMemoryPurchaseLineRepository,
    InMemoryPriceObservationRepository,
    InMemoryPasswordResetTokenRepository,
    InMemoryFinancialTransactionRepository,
    InMemoryFinancialTransactionAuditLogRepository,
    InMemoryFinancialScannerTransactionRepository,
    InMemoryFinancialScanExecutionRepository,
    InMemoryFinancialInstitutionRepository,
    InMemoryFinancialInstitutionTypeRepository,
    InMemoryFinancialCategoryRepository,
    InMemoryNotificationRepository,
    InMemoryPushSubscriptionRepository,
    InMemoryBalanceSettingsRepository,
    InMemoryPeriodSettingsRepository
} from "./repositories/implementations";
import {
    InMemoryBankInstitutionRepository,
    InMemoryBankAccountRepository,
    InMemoryBankCardRepository,
    InMemoryBankAccountBalanceSnapshotRepository,
    InMemoryBankCardStatementRepository,
    InMemoryBankMovementRepository,
    InMemoryBankNumberObservationRepository
} from "./repositories/bank-in-memory";
import { seedRepositories } from "./seed/seed-data";
import { randomUUID } from "crypto";

// Supabase Repositories
import {
    SupabaseUserRepository,
    SupabaseSupermarketRepository,
    SupabaseCategoryRepository,
    SupabaseUnitRepository,
    SupabaseGenericItemRepository,
    SupabaseBrandProductRepository,
    SupabaseTemplateRepository,
    SupabaseTemplateItemRepository,
    SupabasePurchaseRepository,
    SupabasePurchaseLineRepository,
    SupabasePriceObservationRepository,
    SupabaseFinancialTransactionRepository,
    SupabaseFinancialTransactionAuditLogRepository,
    SupabaseFinancialScannerTransactionRepository,
    SupabaseFinancialScanExecutionRepository,
    SupabaseInstitutionTypeRepository,
    SupabaseFinancialInstitutionRepository,
    SupabaseFinancialCategoryRepository,
    SupabaseNotificationRepository,
    SupabasePushSubscriptionRepository,
    SupabaseBankInstitutionRepository,
    SupabaseBankAccountRepository,
    SupabaseBankCardRepository,
    SupabaseBankAccountBalanceSnapshotRepository,
    SupabaseBankCardStatementRepository,
    SupabaseBankMovementRepository,
    SupabaseBankNumberObservationRepository,
    SupabaseBalanceSettingsRepository
} from "./repositories/supabase"; // Need to create this index or import individually
import { SupabasePeriodSettingsRepository } from "./repositories/supabase/supabase-period-settings-repository";

// ... Previous imports ...

// Generic Singleton Helper.
//
// In-memory repositories hold seeded state in arrays, so we persist them on
// `global` to survive dev hot-reloads (otherwise every file edit would reset the
// data). Supabase repositories are stateless — they open a client per request —
// so caching them on `global` gives no benefit and actively hurts DX: the cached
// instance freezes the OLD class definition, hiding code changes until a server
// restart. For Supabase we therefore create fresh instances so hot-reload (and
// production cold starts) always use the latest code.
function singleton<T>(name: string, value: () => T): T {
    if (process.env.DATA_SOURCE === 'SUPABASE') {
        return value();
    }
    // @ts-ignore
    const globalStore = global as any;
    if (!globalStore.__kyber_container) {
        globalStore.__kyber_container = {};
    }
    if (!globalStore.__kyber_container[name]) {
        globalStore.__kyber_container[name] = value();
    }
    return globalStore.__kyber_container[name];
}

const isSupabase = process.env.DATA_SOURCE === 'SUPABASE';

// Singleton instances (Persisted across Hot Reloads in Dev via global)
export const userRepository = singleton("userRepo", () => isSupabase ? new SupabaseUserRepository() : new InMemoryUserRepository());
// For PasswordResetToken, Supabase handles it, but AuthService needs an instance. 
// If Supabase, we can use InMemory as a placeholder since it won't be used by our modified actions, 
// OR simpler: just keep InMemory for now as it's harmless.
export const passwordResetTokenRepository = singleton("tokenRepo", () => new InMemoryPasswordResetTokenRepository());

export const supermarketRepository = singleton("supermarketRepo", () => isSupabase ? new SupabaseSupermarketRepository() : new InMemorySupermarketRepository());
export const categoryRepository = singleton("categoryRepo", () => isSupabase ? new SupabaseCategoryRepository() : new InMemoryCategoryRepository());
export const unitRepository = singleton("unitRepo", () => isSupabase ? new SupabaseUnitRepository() : new InMemoryUnitRepository());
export const genericItemRepository = singleton("genericItemRepo", () => isSupabase ? new SupabaseGenericItemRepository() : new InMemoryGenericItemRepository());
export const brandProductRepository = singleton("brandProductRepo", () => isSupabase ? new SupabaseBrandProductRepository() : new InMemoryBrandProductRepository());
export const templateRepository = singleton("templateRepo", () => isSupabase ? new SupabaseTemplateRepository() : new InMemoryTemplateRepository());
export const templateItemRepository = singleton("templateItemRepo_v2", () => isSupabase ? new SupabaseTemplateItemRepository() : new InMemoryTemplateItemRepository());
export const purchaseRepository = singleton("purchaseRepo", () => isSupabase ? new SupabasePurchaseRepository() : new InMemoryPurchaseRepository());
export const purchaseLineRepository = singleton("purchaseLineRepo_v3", () => isSupabase ? new SupabasePurchaseLineRepository() : new InMemoryPurchaseLineRepository());
export const priceObservationRepository = singleton("priceObservationRepo", () => isSupabase ? new SupabasePriceObservationRepository() : new InMemoryPriceObservationRepository());
export const financialTransactionRepository = singleton("financialTransactionRepo", () => isSupabase ? new SupabaseFinancialTransactionRepository() : new InMemoryFinancialTransactionRepository());
export const financialTransactionAuditLogRepository = singleton("financialTransactionAuditLogRepo", () => isSupabase ? new SupabaseFinancialTransactionAuditLogRepository() : new InMemoryFinancialTransactionAuditLogRepository());
export const financialScannerTransactionRepository = singleton("financialScannerTransactionRepo", () => isSupabase ? new SupabaseFinancialScannerTransactionRepository() : new InMemoryFinancialScannerTransactionRepository());
export const financialScanExecutionRepository = singleton("financialScanExecutionRepo", () => isSupabase ? new SupabaseFinancialScanExecutionRepository() : new InMemoryFinancialScanExecutionRepository());

export const financialInstitutionTypeRepository = singleton("financialInstitutionTypeRepo_v4", () => isSupabase ? new SupabaseInstitutionTypeRepository() : new InMemoryFinancialInstitutionTypeRepository());
export const financialInstitutionRepository = singleton("financialInstitutionRepo_v4", () => isSupabase ? new SupabaseFinancialInstitutionRepository() : new InMemoryFinancialInstitutionRepository());
export const financialCategoryRepository = singleton("financialCategoryRepo_v4", () => isSupabase ? new SupabaseFinancialCategoryRepository() : new InMemoryFinancialCategoryRepository());

// Módulo Bancos
export const bankInstitutionRepository = singleton("bankInstitutionRepo", () => isSupabase ? new SupabaseBankInstitutionRepository() : new InMemoryBankInstitutionRepository());
export const bankAccountRepository = singleton("bankAccountRepo", () => isSupabase ? new SupabaseBankAccountRepository() : new InMemoryBankAccountRepository());
export const bankCardRepository = singleton("bankCardRepo", () => isSupabase ? new SupabaseBankCardRepository() : new InMemoryBankCardRepository());
export const balanceSettingsRepository = singleton("balanceSettingsRepo", () =>
    isSupabase ? new SupabaseBalanceSettingsRepository() : new InMemoryBalanceSettingsRepository());
export const periodSettingsRepository = singleton("periodSettingsRepo", () =>
    isSupabase ? new SupabasePeriodSettingsRepository() : new InMemoryPeriodSettingsRepository());
export const bankSnapshotRepository = singleton("bankSnapshotRepo", () => isSupabase ? new SupabaseBankAccountBalanceSnapshotRepository() : new InMemoryBankAccountBalanceSnapshotRepository());
export const bankStatementRepository = singleton("bankStatementRepo", () => isSupabase ? new SupabaseBankCardStatementRepository() : new InMemoryBankCardStatementRepository());
export const bankMovementRepository = singleton("bankMovementRepo", () => isSupabase
    ? new SupabaseBankMovementRepository()
    // La versión in-memory deriva los movimientos de las transacciones, así que
    // necesita los tres repos de los que la vista SQL hace JOIN.
    : new InMemoryBankMovementRepository(financialTransactionRepository, bankCardRepository, bankStatementRepository));
export const bankObservationRepository = singleton("bankObservationRepo", () => isSupabase
    ? new SupabaseBankNumberObservationRepository()
    : new InMemoryBankNumberObservationRepository());

export const notificationRepository = singleton("notificationRepo", () => isSupabase ? new SupabaseNotificationRepository() : new InMemoryNotificationRepository());
export const pushSubscriptionRepository = singleton("pushSubscriptionRepo", () => isSupabase ? new SupabasePushSubscriptionRepository() : new InMemoryPushSubscriptionRepository());

// Services
import { AuthService } from "@/application/services/auth-service";
import { MasterDataService } from "@/application/services/master-data-service";
import { ProductService } from "@/application/services/product-service";
import { TemplateService } from "@/application/services/template-service";
import { PurchaseService } from "@/application/services/purchase-service";
import { AnalyticsService } from "@/application/services/analytics-service";
import { UserService } from "@/application/services/user-service";
import { FinancialTransactionService } from "@/application/services/financial-transaction-service";
import { FinancialInboxService } from "@/application/services/financial-inbox-service";
import { FinancialDashboardService } from "@/application/services/financial-dashboard-service";
import { FinancialSettingsService } from "@/application/services/financial-settings-service";
import { BankService } from "@/application/services/bank-service";
import { BankIdentificationService } from "@/application/services/bank-identification-service";
import { NotificationService } from "@/application/services/notification-service";
import { PushSubscriptionService } from "@/application/services/push-subscription-service";
import { BalanceService } from "@/application/services/balance-service";

export const authService = new AuthService(userRepository, passwordResetTokenRepository);
export const userService = new UserService(userRepository);
// Bancos va primero: transacciones e inbox sincronizan contra el.
export const bankIdentificationService = new BankIdentificationService(
    bankObservationRepository,
    bankAccountRepository,
    bankCardRepository,
    bankInstitutionRepository,
);
export const bankService = new BankService(
    bankInstitutionRepository,
    bankAccountRepository,
    bankCardRepository,
    bankSnapshotRepository,
    bankStatementRepository,
    bankMovementRepository,
    financialTransactionRepository,
    bankIdentificationService,
    financialScannerTransactionRepository,
);
export const financialTransactionService = new FinancialTransactionService(
    financialTransactionRepository, 
    financialTransactionAuditLogRepository,
    financialInstitutionRepository,
    financialCategoryRepository,
    bankService,
    bankCardRepository,
);
export const financialInboxService = new FinancialInboxService(
    financialScannerTransactionRepository,
    financialTransactionRepository,
    financialTransactionAuditLogRepository,
    financialInstitutionRepository,
    financialCategoryRepository,
    bankService,
    bankCardRepository,
);
export const financialDashboardService = new FinancialDashboardService(financialTransactionRepository, financialCategoryRepository, financialInstitutionRepository, financialScannerTransactionRepository, bankCardRepository);
export const balanceService = new BalanceService(
    financialTransactionRepository,
    bankAccountRepository,
    bankCardRepository,
    bankMovementRepository,
    bankSnapshotRepository,
    financialCategoryRepository,
    balanceSettingsRepository,
);
export const financialSettingsService = new FinancialSettingsService(financialInstitutionTypeRepository, financialInstitutionRepository, financialCategoryRepository, financialTransactionRepository);
export const notificationService = new NotificationService(notificationRepository);
export const pushSubscriptionService = new PushSubscriptionService(pushSubscriptionRepository);
export const masterDataService = new MasterDataService(supermarketRepository, categoryRepository, unitRepository);
export const productService = new ProductService(genericItemRepository, brandProductRepository, priceObservationRepository);
export const templateService = new TemplateService(templateRepository, templateItemRepository);
export const purchaseService = new PurchaseService(purchaseRepository, purchaseLineRepository, templateRepository, templateItemRepository, genericItemRepository, priceObservationRepository, brandProductRepository);
export const analyticsService = new AnalyticsService(
    purchaseRepository,
    purchaseLineRepository,
    priceObservationRepository,
    genericItemRepository,
    brandProductRepository,
    categoryRepository,
    unitRepository
);


// Initializer function (to be called at app bootstrap)
// Initializer function (Singleton Promise Pattern)
let initializationPromise: Promise<void> | null = null;

export async function initializeContainer() {
    // Global check for dev hot reload
    // @ts-ignore
    if (global.__kyber_initialized) {
        // Even if initialized, check if repositories are empty (rare case of partial reset)? 
        // No, with singleton repos, they should be fine.
        // Uncomment logging if debugging needed
        // console.log("Container already initialized (Global Check). Skipping seed.");
        return;
    }
    // @ts-ignore
    global.__kyber_initialized = true;

    // If a promise is already running, return it to wait for the same result
    if (initializationPromise) return initializationPromise;

    // Create the cleanup/initialization promise
    initializationPromise = (async () => {
        console.log(`Initializing container... Source: ${process.env.DATA_SOURCE || 'MEMORY'}`);
        try {
            // ALWAYS seed basic master data (Category, Unit)
            await seedRepositories(categoryRepository, unitRepository);

            // DATA SOURCE STRATEGY
            const dataSource = process.env.DATA_SOURCE || "MEMORY"; // Default to MEMORY

            if (dataSource === "MOCK") {
                console.log("Initializing in MOCK mode...");
                const { loadMockData } = await import("./seed/mock-loader");
                await loadMockData(
                    userRepository,
                    supermarketRepository,
                    genericItemRepository,
                    purchaseRepository,
                    categoryRepository,
                    templateRepository,
                    templateItemRepository,
                    "00000000-0000-0000-0000-000000000000"
                );
            } else if (dataSource === 'SUPABASE') {
                console.log("Initializing in SUPABASE mode...");
            } else {
                // MEMORY MODE (Default)
                console.log("Initializing in MEMORY mode...");

                // Seed default test user if not exists
                // SKIP for Supabase to avoid "cookies() outside request" error during container init
                if (dataSource !== 'SUPABASE') {
                    const defaultUserEmail = "test@test.com";
                    const constantUserId = "00000000-0000-0000-0000-000000000000";
                    let existingUser = await userRepository.findByEmail(defaultUserEmail);

                    // If user exists but has wrong ID (from earlier random seeding), delete it
                    if (existingUser && existingUser.id !== constantUserId) {
                        console.log(`[SEED] User ${defaultUserEmail} exists with wrong ID ${existingUser.id}. Deleting to enforce constant ID.`);
                        await userRepository.delete(existingUser.id);
                        existingUser = null; // Force recreation
                    }

                    if (!existingUser) {
                        const hash = "test"; // PLAIN TEXT for V1
                        await userRepository.create({
                            id: constantUserId, // CONSTANT ID for dev persistence across resets
                            email: defaultUserEmail,
                            passwordHash: hash,
                            defaultCurrencyCode: "USD",
                            image: null,
                            firstName: null,
                            lastName: null,
                            phone: null,
                            isDeleted: false,
                            bio: null,
                            country: null,
                            province: null,
                            city: null,
                            parish: null,
                            neighborhood: null,
                            primaryStreet: null,
                            secondaryStreet: null,
                            addressReference: null,
                            postalCode: null,
                            socials: null,
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString()
                        });
                        console.log(`Default test user seeded: ${defaultUserEmail} / test with ID ${constantUserId}`);
                    }

                    console.log("Seeding comprehensive mock data for MEMORY mode...");
                    const { loadMockData } = await import("./seed/mock-loader");
                    await loadMockData(
                        userRepository,
                        supermarketRepository,
                        genericItemRepository,
                        purchaseRepository,
                        categoryRepository,
                        templateRepository,
                        templateItemRepository,
                        "00000000-0000-0000-0000-000000000000" // Persistent Test User ID
                    );
                }
            }

            // @ts-ignore
            global.__kyber_initialized = true;
            console.log(`Container initialized (Source: ${dataSource}).`);
        } catch (error) {
            console.error("Failed to initialize container:", error);
            initializationPromise = null;
            throw error;
        }
    })();

    return initializationPromise;
}
