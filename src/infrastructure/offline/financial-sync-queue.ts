import { financialOfflineStore } from "./financial-offline-store";
import { 
    createInstitutionAction, updateInstitutionAction, deleteInstitutionAction,
    createCategoryAction, updateCategoryAction, deleteCategoryAction
} from "@/app/actions/financial-settings";

export type SyncActionType = 
    | 'CREATE_INSTITUTION' | 'UPDATE_INSTITUTION' | 'DELETE_INSTITUTION'
    | 'CREATE_CATEGORY' | 'UPDATE_CATEGORY' | 'DELETE_CATEGORY';

export interface SyncJob {
    id: string; // The ID of the item being synced (institutionId, categoryId)
    action: SyncActionType;
    payload?: any;
    timestamp: number;
}

export class FinancialSyncQueue {
    private isProcessing = false;

    /**
     * Add a job to the sync queue.
     */
    async enqueue(job: Omit<SyncJob, 'timestamp'>) {
        const fullJob: SyncJob = {
            ...job,
            timestamp: Date.now()
        };
        // Store using a composite key: id + action to allow multiple actions on the same item?
        // Actually, just using a unique ID for the job is better.
        const jobId = `${job.id}_${job.action}_${fullJob.timestamp}`;
        await financialOfflineStore.settingsQueue.add(jobId, fullJob);
        
        // Attempt to process immediately if online
        if (typeof navigator !== 'undefined' && navigator.onLine) {
            this.processQueue();
        }
    }

    /**
     * Process all jobs in the queue.
     */
    async processQueue() {
        if (this.isProcessing) return;
        if (typeof navigator !== 'undefined' && !navigator.onLine) return;

        this.isProcessing = true;
        
        try {
            const jobs = await financialOfflineStore.settingsQueue.getAll();
            // Sort jobs by timestamp to process in order
            const sortedJobs = jobs.sort((a, b) => (a.data as SyncJob).timestamp - (b.data as SyncJob).timestamp);

            for (const { id: jobId, data } of sortedJobs) {
                const job = data as SyncJob;
                let success = false;
                
                try {
                    switch (job.action) {
                        case 'CREATE_INSTITUTION':
                            await createInstitutionAction(job.payload);
                            break;
                        case 'UPDATE_INSTITUTION':
                            await updateInstitutionAction(job.id, job.payload);
                            break;
                        case 'DELETE_INSTITUTION':
                            await deleteInstitutionAction(job.id);
                            break;
                        case 'CREATE_CATEGORY':
                            await createCategoryAction(job.payload);
                            break;
                        case 'UPDATE_CATEGORY':
                            await updateCategoryAction(job.id, job.payload);
                            break;
                        case 'DELETE_CATEGORY':
                            await deleteCategoryAction(job.id);
                            break;
                        default:
                            console.warn(`Unknown sync action: ${job.action}`);
                    }
                    success = true;
                } catch (error) {
                    console.error(`Failed to process sync job ${jobId}:`, error);
                    // Depending on the error, we might want to keep it in the queue or drop it.
                    // For now, if it's a network error it will throw. If it's a validation error, we should probably drop it to prevent blocking.
                    // Assuming network errors or server errors throw. Let's keep it simple: if error, stop processing queue to maintain order.
                    break;
                }

                if (success) {
                    await financialOfflineStore.settingsQueue.remove(jobId);
                }
            }
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Set up online listener to process queue when connection is restored.
     */
    setupListeners() {
        if (typeof window !== 'undefined') {
            window.addEventListener('online', () => {
                this.processQueue();
            });
        }
    }
}

export const financialSyncQueue = new FinancialSyncQueue();
