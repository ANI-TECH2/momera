import { NlpManager } from "node-nlp";

export function addHelpIntent(manager: NlpManager): void {
  const helpDocs = [
    "help", "help me", "i need help", "what can you do",
    "what are you", "how do i use this", "how does this work",
    "how do i save", "how do i find my notes",
    "what commands do you support", "what are your features",
    "show me how to use this", "guide me", "tutorial",
    "instructions", "how do i save a price", "how do i find a price",
    "how do i check price", "how do i upload a file",
    "how do i save an image", "how do i search",
    "what can i do here", "what is this app for",
    "how does saving work", "how do i store something",
    "how do i save dollar price", "how do i save pound price",
    "how do i save price in euros", "how do i search by currency",
    "how do i find usd prices", "can i save prices in different currencies",
    "how do i save international contact",
    "how do i find my uk contact",
  ];

  helpDocs.forEach(doc => manager.addDocument("en", doc, "intent.help"));
}