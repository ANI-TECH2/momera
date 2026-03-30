import { NlpManager } from "node-nlp";

let managerPromise: Promise<NlpManager> | null = null;

export async function getNlp(): Promise<NlpManager> {
  if (!managerPromise) {
    managerPromise = (async () => {
      const manager = new NlpManager({
        languages: ["en"],
        forceNER: true,
      });

      // ────────────────────────────────────────────────────────────
      // INTENT TRAINING
      // ────────────────────────────────────────────────────────────

      // SAVE
      manager.addDocument("en", "save this %data%", "intent.save");
      manager.addDocument("en", "save my %data%", "intent.save");
      manager.addDocument("en", "remember this %data%", "intent.save");
      manager.addDocument("en", "remember my %data%", "intent.save");
      manager.addDocument("en", "store this %data%", "intent.save");
      manager.addDocument("en", "store my %data%", "intent.save");
      manager.addDocument("en", "keep this %data%", "intent.save");
      manager.addDocument("en", "keep my %data%", "intent.save");
      manager.addDocument("en", "note this %data%", "intent.save");
      manager.addDocument("en", "note down %data%", "intent.save");
      manager.addDocument("en", "save john number 0803", "intent.save");
      manager.addDocument("en", "remember my password is 1234", "intent.save");
      manager.addDocument("en", "store victor address in port harcourt", "intent.save");

      // RETRIEVE
      manager.addDocument("en", "find my %data%", "intent.retrieve");
      manager.addDocument("en", "find %data%", "intent.retrieve");
      manager.addDocument("en", "show my %data%", "intent.retrieve");
      manager.addDocument("en", "show me my %data%", "intent.retrieve");
      manager.addDocument("en", "get my %data%", "intent.retrieve");
      manager.addDocument("en", "retrieve my %data%", "intent.retrieve");
      manager.addDocument("en", "search for %data%", "intent.retrieve");
      manager.addDocument("en", "look up %data%", "intent.retrieve");
      manager.addDocument("en", "what is my %data%", "intent.retrieve");
      manager.addDocument("en", "what was my %data%", "intent.retrieve");
      manager.addDocument("en", "what did i save about %data%", "intent.retrieve");
      manager.addDocument("en", "do i have %data%", "intent.retrieve");
      manager.addDocument("en", "find john from port harcourt", "intent.retrieve");
      manager.addDocument("en", "show my password", "intent.retrieve");
      manager.addDocument("en", "find that note about rent", "intent.retrieve");

      // DELETE
      manager.addDocument("en", "delete my %data%", "intent.delete");
      manager.addDocument("en", "remove my %data%", "intent.delete");
      manager.addDocument("en", "clear my %data%", "intent.delete");
      manager.addDocument("en", "delete that note about %data%", "intent.delete");

      // GREET
      manager.addDocument("en", "hi", "intent.greet");
      manager.addDocument("en", "hello", "intent.greet");
      manager.addDocument("en", "hey", "intent.greet");
      manager.addDocument("en", "good morning", "intent.greet");
      manager.addDocument("en", "good afternoon", "intent.greet");
      manager.addDocument("en", "good evening", "intent.greet");

      // HELP
      manager.addDocument("en", "help", "intent.help");
      manager.addDocument("en", "what can you do", "intent.help");
      manager.addDocument("en", "how do i use this", "intent.help");
      manager.addDocument("en", "how does this work", "intent.help");
      manager.addDocument("en", "what are your features", "intent.help");
      manager.addDocument("en", "what commands do you support", "intent.help");

      // FALLBACK / NONE
      manager.addDocument("en", "okay", "intent.none");
      manager.addDocument("en", "alright", "intent.none");
      manager.addDocument("en", "hmm", "intent.none");
      manager.addDocument("en", "nice", "intent.none");

      // ────────────────────────────────────────────────────────────
      // CUSTOM REGEX ENTITIES
      // ────────────────────────────────────────────────────────────

      manager.addRegexEntity(
        "phone",
        "en",
        /(?:\+234|234|0)?[7-9][0-1]\d{8}\b/g
      );

      manager.addRegexEntity(
        "email",
        "en",
        /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
      );

      manager.addRegexEntity(
        "money",
        "en",
        /(?:₦|\$|usd|ngn)?\s?\d{1,3}(?:,\d{3})*(?:\.\d+)?/gi
      );

      manager.addRegexEntity(
        "date_like",
        "en",
        /\b(?:today|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\b/gi
      );

      manager.addRegexEntity(
        "password_like",
        "en",
        /\b(?:password|pin|passcode|otp)\b/gi
      );

      // Small enum examples for places you expect often.
      manager.addNamedEntityText("place", "port harcourt", ["en"], [
        "port harcourt",
        "ph",
        "portharcourt",
      ]);

      manager.addNamedEntityText("place", "lagos", ["en"], ["lagos"]);
      manager.addNamedEntityText("place", "abuja", ["en"], ["abuja"]);

      // Optional answers
      manager.addAnswer("en", "intent.greet", "Hello! 👋");
      manager.addAnswer("en", "intent.help", "Type help to see examples.");

      await manager.train();
      manager.save();
      return manager;
    })();
  }

  return managerPromise;
}