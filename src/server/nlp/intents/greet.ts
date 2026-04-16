import { NlpManager } from "node-nlp";

export function addGreetIntent(manager: NlpManager): void {
  const greetDocs = [
    "hi", "hello", "hey", "hey there", "hi there",
    "good morning", "good afternoon", "good evening", "good night",
    "howdy", "what is up", "how are you", "how are you doing",
    "how is it going", "yo", "sup", "hiya", "morning", "evening",
    "how far", "how body", "wella", "oya", "e kaaro", "e kaasan",
    "ndewo", "kedu", "sannu",
  ];

  greetDocs.forEach(doc => manager.addDocument("en", doc, "intent.greet"));
}