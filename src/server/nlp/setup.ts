import { NlpManager } from "node-nlp";

let managerPromise: Promise<NlpManager> | null = null;

// ─── RULES ────────────────────────────────────────────────────
// Rule 1: Never guess — if score < 0.75 treat as intent.none
// Rule 2: All intents must have 10+ training examples
// Rule 3: Unknown commands tell user what to do
// Rule 4: Fast keyword detection runs BEFORE NLP
// Rule 5: Entities extracted and attached to result

export async function getNlp(): Promise<NlpManager> {
  if (!managerPromise) {
    managerPromise = (async () => {
      const manager = new NlpManager({
        languages: ["en"],
        forceNER: true,
        nlu: { useNoneFeature: true },
        autoSave: false,
      });

      // ────────────────────────────────────────────────────────
      // INTENT: SAVE
      // ────────────────────────────────────────────────────────
      const saveDocs = [
        // General saves
        "save this",
        "save my",
        "save these",
        "save john number 08034332394",
        "save my classmate john 08034332394",
        "save my password is 1234",
        "save my email is test@gmail.com",
        "save victor address port harcourt",
        "save my bank account 1234567890",
        "save my pin 4321",
        "save my notes for today",
        "save my friend mike number",
        "remember this",
        "remember my password",
        "remember my classmate",
        "remember john number 08034332394",
        "remember my pin is 1234",
        "store this for me",
        "store my number",
        "store my password",
        "store my address",
        "keep this safe",
        "keep my number",
        "keep my password",
        "note this down",
        "note down my number",
        "note my classmate details",
        "i want to save my number",
        "please save this for me",
        "can you save my password",
        "add this to my memory",
        "record my number",
        "record this information",
        // Price saves
        "save coke price 300",
        "save garri price 500",
        "save rice cost 2000",
        "save the price of tomatoes 150",
        "save fuel price 650",
        "save bread selling price 200",
        "save the cost of milk 400",
        "save indomie price 120",
        "save current price of sugar 800",
        "save beans price 1200",
        "store the price of eggs 100",
        "remember coke costs 300",
        "record price of petrol 650",
        "keep price of tomatoes 200",
        "save market price of yam 500",
        "save palm oil price 3000",
        "save price of noodles 150",
        "save price of water 50",
        "save price of chicken 3500",
        "save the cost of flour 1500",
      ];
      saveDocs.forEach(doc => manager.addDocument("en", doc, "intent.save"));

      // ────────────────────────────────────────────────────────
      // INTENT: RETRIEVE
      // ────────────────────────────────────────────────────────
      const retrieveDocs = [
        // General retrieves
        "find my number",
        "find my password",
        "find john",
        "find my classmate john",
        "find that note about rent",
        "find my email",
        "show my number",
        "show my password",
        "show me my saved notes",
        "show my classmate",
        "show all my contacts",
        "show my bank details",
        "get my number",
        "get my password",
        "get my saved info",
        "retrieve my number",
        "retrieve my notes",
        "search for john",
        "search my notes",
        "look up my number",
        "look up john",
        "what is my password",
        "what is my pin",
        "what is my number",
        "what was my email",
        "what did i save about john",
        "what did i save about rent",
        "do i have any notes",
        "do i have johns number",
        "give me my saved data",
        "check my saved notes",
        "where is my password",
        "i need my number",
        "can you find my classmate",
        // Price retrieves
        "what is the price of coke",
        "find price of garri",
        "show me coke price",
        "how much is rice",
        "get the cost of tomatoes",
        "what did i save for bread price",
        "find my saved prices",
        "show all prices",
        "price of fuel",
        "how much is indomie",
        "what is the cost of beans",
        "show me the price of milk",
        "find the price of yam",
        "how much did i save for sugar",
        "what is palm oil price",
        "check price of chicken",
        "look up price of eggs",
        "retrieve price of petrol",
        "get price of noodles",
        "what is the market price of flour",
      ];
      retrieveDocs.forEach(doc => manager.addDocument("en", doc, "intent.retrieve"));

      // ────────────────────────────────────────────────────────
      // INTENT: DELETE
      // ────────────────────────────────────────────────────────
      const deleteDocs = [
        "delete my number",
        "delete my password",
        "delete that note",
        "delete my classmate john",
        "remove my number",
        "remove my saved note",
        "remove that password",
        "clear my number",
        "clear my notes",
        "erase my number",
        "erase my password",
        "i want to delete my note",
        "please remove this",
        "delete price of coke",
        "remove saved price of garri",
        "delete that price",
        "clear price of rice",
        "erase the price i saved",
        "remove the coke price",
        "delete my saved prices",
      ];
      deleteDocs.forEach(doc => manager.addDocument("en", doc, "intent.delete"));

      // ────────────────────────────────────────────────────────
      // INTENT: GREET
      // ────────────────────────────────────────────────────────
      const greetDocs = [
        "hi",
        "hello",
        "hey",
        "hey there",
        "hi there",
        "good morning",
        "good afternoon",
        "good evening",
        "good night",
        "howdy",
        "what is up",
        "how are you",
        "how are you doing",
        "how is it going",
      ];
      greetDocs.forEach(doc => manager.addDocument("en", doc, "intent.greet"));

      // ────────────────────────────────────────────────────────
      // INTENT: HELP
      // ────────────────────────────────────────────────────────
      const helpDocs = [
        "help",
        "help me",
        "i need help",
        "what can you do",
        "what are you",
        "how do i use this",
        "how does this work",
        "how do i save",
        "how do i find my notes",
        "what commands do you support",
        "what are your features",
        "show me how to use this",
        "guide me",
        "tutorial",
        "instructions",
        "how do i save a price",
        "how do i find a price",
        "how do i check price",
      ];
      helpDocs.forEach(doc => manager.addDocument("en", doc, "intent.help"));

      // ────────────────────────────────────────────────────────
      // INTENT: NONE — teaches model what NOT to classify
      // ────────────────────────────────────────────────────────
      const noneDocs = [
        "okay",
        "ok",
        "alright",
        "hmm",
        "nice",
        "cool",
        "sure",
        "yes",
        "no",
        "maybe",
        "thanks",
        "thank you",
        "bye",
        "goodbye",
        "see you",
        "lol",
        "haha",
        "wow",
        "really",
        "interesting",
        "i see",
        "got it",
        "understood",
        "makes sense",
        "not sure",
        "i dont know",
        "whatever",
        "never mind",
        "forget it",
        "skip",
        "ignore that",
        "testing",
        "test",
        "hello world",
        "asdfghjkl",
        "what time is it",
        "tell me a joke",
        "what is the weather",
        "calculate 2 plus 2",
        "translate this",
        "who are you",
        "are you a robot",
        "what is your name",
      ];
      noneDocs.forEach(doc => manager.addDocument("en", doc, "intent.none"));

      // ────────────────────────────────────────────────────────
      // ENTITIES
      // ────────────────────────────────────────────────────────
      manager.addRegexEntity(
        "phone", "en",
        /(?:\+234|234|0)?[7-9][0-1]\d{8}\b/g
      );

      manager.addRegexEntity(
        "email", "en",
        /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
      );

      manager.addRegexEntity(
        "money", "en",
        /(?:₦|\$|usd|ngn)?\s?\d{1,3}(?:,\d{3})*(?:\.\d+)?/gi
      );

      manager.addRegexEntity(
        "date_like", "en",
        /\b(?:today|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\b/gi
      );

      manager.addRegexEntity(
        "password_like", "en",
        /\b(?:password|pin|passcode|otp|secret)\b/gi
      );

      // Price keyword entity — helps downstream handlers detect price intent
      manager.addRegexEntity(
        "price_like", "en",
        /\b(?:price|prices|cost|costs|rate|rates|amount|selling|market price|how much)\b/gi
      );

      // Places
      manager.addNamedEntityText("place", "port harcourt", ["en"], ["port harcourt", "ph", "portharcourt"]);
      manager.addNamedEntityText("place", "lagos", ["en"], ["lagos"]);
      manager.addNamedEntityText("place", "abuja", ["en"], ["abuja"]);
      manager.addNamedEntityText("place", "kano", ["en"], ["kano"]);

      // ────────────────────────────────────────────────────────
      // ANSWERS
      // ────────────────────────────────────────────────────────
      manager.addAnswer("en", "intent.greet",
        "Hello! 👋 How can I help you today?\n\n💾 Save: 'save my [info]'\n💰 Price: 'save coke price 300'\n🔍 Find: 'show my [topic]'\n📄 Upload: tap the + button"
      );

      manager.addAnswer("en", "intent.help",
        "Here's what I can do:\n\n💾 Save info: 'save my classmate John 08034332394'\n💰 Save price: 'save coke price 300'\n🔍 Find info: 'show my classmate John'\n💸 Find price: 'what is the price of coke'\n📄 Upload: tap the + button\n🗑️ Delete: 'delete my note about John'"
      );

      // Rule: Tell user when command is not understood
      manager.addAnswer("en", "intent.none",
        "I didn't understand that. Try:\n\n💾 'save my [info]'\n💰 'save coke price 300'\n🔍 'show my [topic]'\n💸 'price of coke'\n📄 tap + to upload\n\nType 'help' to see all commands."
      );

      await manager.train();
      return manager;
    })();
  }

  return managerPromise;
}