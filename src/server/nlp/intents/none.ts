import { NlpManager } from "node-nlp";

export function addNoneIntent(manager: NlpManager): void {
  const noneDocs = [
    "okay", "ok", "alright", "hmm", "nice", "cool", "sure",
    "yes", "no", "maybe", "thanks", "thank you", "bye", "goodbye",
    "see you", "lol", "haha", "wow", "really", "interesting",
    "i see", "got it", "understood", "makes sense", "not sure",
    "i dont know", "whatever", "never mind", "forget it", "skip",
    "ignore that", "testing", "test", "hello world", "asdfghjkl",
    "what time is it", "tell me a joke", "what is the weather",
    "calculate 2 plus 2", "translate this", "who are you",
    "are you a robot", "what is your name",
  ];

  noneDocs.forEach(doc => manager.addDocument("en", doc, "intent.none"));
}