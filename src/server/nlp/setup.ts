import { NlpManager } from "node-nlp";
import {
  addDeleteIntent,
  addSaveIntent,
  addRetrieveIntent,
  addRetrieveFilesIntent,
  addUpdateIntent,
  addListIntent,
  addGreetIntent,
  addHelpIntent,
  addNoneIntent,
} from "./intents";

let managerPromise: Promise<NlpManager> | null = null;

// Cache for trained model
let trainedManager: NlpManager | null = null;

export async function getNlp(): Promise<NlpManager> {
  // Return cached trained manager if available
  if (trainedManager) {
    return trainedManager;
  }

  if (!managerPromise) {
    managerPromise = (async () => {
      console.log("[NLP] Initializing NLP Manager with optimized settings...");

      const manager = new NlpManager({
        languages: ["en"],
        forceNER: false, // Disable NER for faster processing
        nlu: {
          useNoneFeature: true,
          // Optimize for speed
          log: false,
          trainByDomain: false,
        },
        autoSave: false,
        // Performance optimizations
        threshold: 0.7, // Lower threshold for faster classification
        // Use faster stemmer
        useStemDict: true,
        fullStemming: false,
      });

      // Add all intents from separate files
      console.log("[NLP] Adding intents...");
      addDeleteIntent(manager);
      addSaveIntent(manager);
      addRetrieveIntent(manager);
      addRetrieveFilesIntent(manager);
      addUpdateIntent(manager);
      addListIntent(manager);
      addGreetIntent(manager);
      addHelpIntent(manager);
      addNoneIntent(manager);

      console.log("[NLP] Training model with optimized settings...");
      const startTime = Date.now();

      // Train with optimized settings
      await manager.train({
        epochs: 50, // Reduced from default 1000
        numThreads: 1, // Single thread for better performance in server environment
        errorThresh: 0.01, // Stop early when error is low enough
        log: false, // Disable training logs for speed
      });

      const trainingTime = Date.now() - startTime;
      console.log(`[NLP] Training completed in ${trainingTime}ms`);

      // Cache the trained manager
      trainedManager = manager;

      return manager;
    })();

    try {
      const manager = await managerPromise;
      return manager;
    } catch (error) {
      console.error("[NLP] Training failed:", error);
      // Reset promise on failure so it can be retried
      managerPromise = null;
      throw error;
    }
  }

  return managerPromise;
}

// Function to clear cache (useful for development/testing)
export function clearNlpCache(): void {
  trainedManager = null;
  managerPromise = null;
  console.log("[NLP] Cache cleared");
}