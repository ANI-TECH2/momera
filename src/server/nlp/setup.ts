import { NlpManager } from "node-nlp";

let managerPromise: Promise<NlpManager> | null = null;

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
        "save my colleague details",
        "save my customer number",
        "save my brothers number",
        "save my sisters number",
        "save my boss number",
        "save my account number",
        "save my atm pin",
        "save my wifi password",
        "store this note",
        "keep this note",
        "remember this note",
        "jot this down",
        "jot down this info",
        "log this for me",
        "take note of this",
        "save my address in london",
        "save my us phone number",
        "save my uk mobile",
        "store my canadian number",
        "save my indian contact",
        "remember my australia number",
        "save my dubai contact",
        "store my south africa number",
        // NGN price saves
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
        "save price of bag 2000",
        "save shoe price 5000",
        "save phone price 80000",
        "save price of laptop 250000",
        "save price of charger 3000",
        "save price of shirt 4000",
        "save price of trouser 3500",
        "save price of generator 150000",
        "save diesel price 1200",
        "save price of data 1000",
        "save mtn data price 1000",
        "save airtime price 500",
        // USD price saves
        "save apple price $2.99",
        "save milk cost $1.49",
        "save price of bread $3.50",
        "save gas price $4.20 per gallon",
        "save cost of coffee $5",
        "save price of burger $8.99",
        "save rent $1200",
        "save grocery cost $150",
        "save price of netflix $15.99",
        "save electricity bill $120",
        "save price of iphone $999",
        "save cost of airpods $249",
        "save price of pizza $12",
        "save gym membership $30",
        "save internet bill $60",
        // GBP price saves
        "save price of bread £1.20",
        "save milk £0.89",
        "save monthly rent £900",
        "save cost of tube fare £2.50",
        "save price of fish and chips £8",
        "save electricity bill £80",
        "save broadband £30",
        "save price of pint £5",
        "save price of coffee £3.50",
        "save cost of petrol £1.50 per litre",
        // EUR price saves
        "save price of coffee €3",
        "save rent €800",
        "save cost of baguette €1.20",
        "save metro ticket €1.90",
        "save price of wine €12",
        // INR price saves
        "save price of rice ₹60",
        "save dal price ₹120",
        "save petrol price ₹100",
        "save price of chai ₹20",
        "save price of mobile data ₹299",
        // GHS price saves
        "save price of kenkey ₵5",
        "save waakye price ₵10",
        "save mobile data ₵50 ghana",
        // KES price saves
        "save price of unga KSh 200",
        "save matatu fare KSh 50",
        "save price of sukuma KSh 30",
        // ZAR price saves
        "save price of bread R15",
        "save petrol price R22 per litre",
        "save price of data R149 south africa",
        // Bulk saves
        "prices pepper 50 garri 50 fruit 50",
        "price list pepper 50 garri 50 rice 2500",
        "save prices rice 2500 beans 1500 yam 600",
        "bulk save coke 300 pepsi 250 water 100",
        "save these prices pepper 200 tomato 150 onion 100",
        "save prices apple $2 milk $1 bread $3",
        "bulk save bread £1.20 milk £0.89 eggs £2",
        "price list rice ₹60 dal ₹120 flour ₹50",
      ];
      saveDocs.forEach(doc => manager.addDocument("en", doc, "intent.save"));

      // ────────────────────────────────────────────────────────
      // INTENT: RETRIEVE — GENERAL NOTES & CONTACTS
      // ────────────────────────────────────────────────────────
      const retrieveDocs = [
        // Core retrieve commands
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
        "show me what i saved",
        "what did i store",
        "what have i saved",
        "pull up my notes",
        "bring up my saved info",
        "show my recent notes",
        "what notes do i have",
        "find my recent saves",
        "show my saved contacts",
        "find my colleague details",
        "what did i save about mike",
        "find mike number",
        "what is john phone number",
        "show me peter contact",
        "do i have emeka number",
        "find tunde details",
        "search for my customer number",
        // Nigerian contact retrieves
        "find chioma number",
        "what is chukwu phone number",
        "show me emeka contact",
        "find bola number",
        "get ade number",
        "do i have seun contact",
        "find kunle details",
        "look up ngozi number",
        "show me femi saved info",
        "what is kemi number",
        "find taiwo contact",
        "show me biodun number",
        "get chidi contact",
        "find ifeanyi phone number",
        // UK contact retrieves
        "find james london number",
        "what is oliver uk number",
        "show me emily contact london",
        "find harry phone number uk",
        "get sophie number from london",
        "do i have liam uk contact",
        "find charlotte number england",
        "look up william contact",
        "show me george saved number",
        "what is noah uk phone",
        // US contact retrieves
        "find michael us number",
        "what is jessica american number",
        "show me david contact usa",
        "find ashley phone number america",
        "get joshua number united states",
        "do i have tyler us contact",
        "find brittany number",
        "look up christopher contact",
        "show me madison saved info",
        "what is brandon us phone",
        // India contact retrieves
        "find raj number",
        "what is priya contact",
        "show me arjun phone number",
        "find deepa india contact",
        "get ravi saved number",
        "do i have anjali contact",
        "find amit phone",
        "look up sunita number",
        "show me rohit contact",
        "what is neha saved number",
        // Ghana contact retrieves
        "find kwame number",
        "what is abena contact ghana",
        "show me kofi phone number",
        "find ama ghana contact",
        "get kwesi number",
        // Kenya contact retrieves
        "find kamau number kenya",
        "what is wanjiku contact",
        "show me kipchoge phone",
        "find akinyi kenya number",
        "get mwangi saved contact",
        // South Africa contact retrieves
        "find thabo south africa number",
        "what is sipho contact",
        "show me nomsa phone",
        "find zanele sa number",
        "get mandla contact south africa",
        // General international
        "find my contact from london",
        "show me saved number from dubai",
        "look up my us contact",
        "find my friend from india",
        "get number of my canada contact",
        "show me my australian contact",
        "find saved info about my uk friend",
        "retrieve my german contact",
        "find my french colleague number",
        "show me my singapore contact",
        // Credential & account retrieves
        "what is my wifi password",
        "find my netflix password",
        "show me my bank account number",
        "what is my atm pin",
        "find my email password",
        "show my instagram password",
        "get my facebook login",
        "what is my paypal password",
        "find my bvn number",
        "show my nin number",
        "what is my nuban",
        "find my account number",
        "show my sort code",
        "what is my routing number",
        "find my iban",
        "show my swift code",
        "what is my social security number",
        "find my national insurance number",
        "show my drivers license number",
        "what is my passport number",
      ];
      retrieveDocs.forEach(doc => manager.addDocument("en", doc, "intent.retrieve"));

      // ────────────────────────────────────────────────────────
      // INTENT: RETRIEVE — PRICES (kept separate for scoring)
      // ────────────────────────────────────────────────────────
      const retrievePriceDocs = [
        // NGN prices
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
        "what is the price of bag",
        "how much is shoe",
        "find the price of phone",
        "price of laptop",
        "how much is a bag",
        "what is the cost of shoe",
        "check the price of rice",
        "show me garri price",
        "how much did i save for coke",
        "what price did i save for pepper",
        "get the price of tomato",
        "how much is onion",
        "price of diesel",
        "how much is fuel",
        "what is data price",
        "what is the naira price of rice",
        "show ngn price of chicken",
        "how much is generator in naira",
        "what did i save for diesel price",
        "find the price of palm oil",
        "how much is airtime",
        // USD prices
        "how much is apple in dollars",
        "what is the dollar price of milk",
        "find price of coffee in usd",
        "how much is netflix subscription",
        "what did i save for rent in dollars",
        "show me the usd price of iphone",
        "how much is gas in the us",
        "find price of pizza in dollars",
        "what is the cost of burger",
        "how much is gym membership in usd",
        "what is the price of coffee in america",
        "how much did i save for groceries",
        "find my saved dollar prices",
        "show all usd prices",
        "what are my dollar prices",
        "how much is internet bill",
        "what is the price of airpods",
        "show me price of netflix",
        // GBP prices
        "how much is bread in pounds",
        "what is the pound price of milk",
        "find price of tube fare in gbp",
        "how much is a pint in london",
        "what did i save for rent in pounds",
        "show me the gbp price of petrol",
        "how much is broadband uk",
        "find price of fish and chips",
        "what is the cost of electricity in uk",
        "how much is coffee in london",
        "find my saved pound prices",
        "show all gbp prices",
        "what are my pound prices",
        "how much is council tax",
        "what is the price of oyster card",
        // EUR prices
        "how much is coffee in euros",
        "what is the euro price of baguette",
        "find price of metro ticket in eur",
        "how much is rent in europe",
        "what did i save for wine in euros",
        "show me the eur price",
        "find my saved euro prices",
        "show all eur prices",
        "what are my euro prices",
        "how much is croissant in france",
        // INR prices
        "how much is rice in rupees",
        "what is the rupee price of dal",
        "find price of petrol in india",
        "how much is chai",
        "what did i save for mobile data india",
        "show me inr price",
        "find my saved rupee prices",
        "show all inr prices",
        "what are my india prices",
        "how much is onion in india",
        // GHS prices
        "how much is kenkey in cedis",
        "what is the cedi price",
        "find price in ghana cedis",
        "how much is waakye",
        "show me ghs price",
        "find my saved cedi prices",
        // KES prices
        "how much is unga in kenya",
        "what is the shilling price",
        "find price in kenyan shillings",
        "how much is matatu fare",
        "show me kes price",
        "find my saved shilling prices",
        // ZAR prices
        "how much is bread in rands",
        "what is the rand price",
        "find price in south africa",
        "how much is petrol in south africa",
        "show me zar price",
        "find my saved rand prices",
        // AED prices
        "how much is shawarma in dubai",
        "what is the dirham price",
        "find price in uae",
        "how much is rent in dubai",
        "show me aed price",
        "find my saved dirham prices",
        // General price retrieves
        "find all my saved prices",
        "show all my prices",
        "list my prices",
        "what prices have i saved",
        "show my price list",
        "check all prices",
        "show me prices i saved",
        "what did i save prices for",
        "list all prices i have",
        "show prices by category",
        "find my market prices",
        "show my grocery prices",
        "show my food prices",
        "find my saved product prices",
        "show my shopping prices",
        "list all my product costs",
      ];
      retrievePriceDocs.forEach(doc => manager.addDocument("en", doc, "intent.retrieve"));

      // ────────────────────────────────────────────────────────
      // INTENT: RETRIEVE — FILES & IMAGES
      // ────────────────────────────────────────────────────────
      const retrieveFileDocs = [
        // Images
        "show my images",
        "find my photos",
        "show my pictures",
        "get my uploaded images",
        "find my uploaded photos",
        "show me my images",
        "retrieve my photos",
        "find my screenshots",
        "show my uploaded pictures",
        "do i have any images",
        "show me photos i uploaded",
        "find my scanned images",
        "show image of receipt",
        "find photo of invoice",
        "show my saved images",
        "get my photos",
        "show my profile picture",
        "find my product photos",
        "show my property images",
        "find photo i saved",
        "get my uploaded screenshots",
        "show me my snapshots",
        "find my saved pics",
        "show my business photos",
        "find my id card photo",
        "show photo of my document",
        // Documents
        "show my documents",
        "find my files",
        "show my pdfs",
        "get my uploaded files",
        "find my receipts",
        "show my invoices",
        "retrieve my documents",
        "find my contracts",
        "show my uploaded documents",
        "do i have any files",
        "find my saved documents",
        "get my pdf files",
        "show me files i uploaded",
        "find my reports",
        "show my docs",
        "get all my files",
        "find my tax documents",
        "show my insurance documents",
        "find my tenancy agreement",
        "show my payslip",
        "find my medical records",
        "show my birth certificate",
        "find my passport copy",
        "show my utility bills",
        "find my bank statements",
        "show my school certificate",
        "find my waec result",
        "show my jamb result",
        "find my work permit",
        "show my visa documents",
        "find my business registration",
        "show my cac documents",
        "find my nin slip",
        "show my bvn document",
        "find my land documents",
      ];
      retrieveFileDocs.forEach(doc => manager.addDocument("en", doc, "intent.retrieve"));

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
        "delete image",
        "remove my photo",
        "delete that file",
        "remove my document",
        "delete uploaded file",
        "erase that image",
        "remove my receipt",
        "clear my files",
        "delete all my notes",
        "remove john from my contacts",
        "delete price of bag",
        "remove shoe price",
        "delete that contact",
        "remove saved contact",
        "erase my saved info",
        "clear all my saved data",
        "wipe my notes",
        "delete the dollar price of milk",
        "remove my gbp price for bread",
        "clear saved usd prices",
        "delete my uk contact",
        "remove india contact",
        "erase my saved us number",
        "delete price of coffee in dollars",
        "remove price of rent in pounds",
      ];
      deleteDocs.forEach(doc => manager.addDocument("en", doc, "intent.delete"));

      // ────────────────────────────────────────────────────────
      // INTENT: UPDATE
      // ────────────────────────────────────────────────────────
      const updateDocs = [
        "update the price",
        "update coke price",
        "change garri price to 600",
        "update price of rice to 3000",
        "edit the price of tomato",
        "change the price",
        "update my note",
        "edit my note about john",
        "change john number",
        "update johns contact",
        "fix the price of bread",
        "correct the price",
        "change price of beans",
        "update price to 500",
        "modify the price",
        "change the number i saved",
        "update my saved contact",
        "edit price of shoe",
        "update bag price",
        "replace the old price",
        "set new price for garri",
        "change price of diesel",
        "update dollar price of milk",
        "change the gbp price of bread",
        "update pound price of petrol",
        "edit usd price of coffee",
        "change euro price of baguette",
        "update rupee price of rice",
        "fix the cedi price of kenkey",
        "update the rand price of petrol",
        "change dirham price of rent",
        "update shilling price of unga",
        "edit my uk contact number",
        "change my us friend number",
        "update india contact",
        "fix saved number for james",
      ];
      updateDocs.forEach(doc => manager.addDocument("en", doc, "intent.update"));

      // ────────────────────────────────────────────────────────
      // INTENT: LIST
      // ────────────────────────────────────────────────────────
      const listDocs = [
        "show all my notes",
        "list all notes",
        "show everything i saved",
        "list all my contacts",
        "show all contacts",
        "list all prices",
        "show all my prices",
        "show all saved prices",
        "list everything",
        "show all my data",
        "show all my files",
        "list all documents",
        "show all my images",
        "list all my photos",
        "show all uploaded files",
        "show all my saved items",
        "give me all my notes",
        "show all",
        "list all",
        "see all my saves",
        "what have i stored",
        "show all ngn prices",
        "show all dollar prices",
        "list all usd prices",
        "show all pound prices",
        "list all gbp prices",
        "show all euro prices",
        "show all rupee prices",
        "list all my currency prices",
        "show prices grouped by currency",
        "list all contacts by country",
        "show my uk contacts",
        "show my us contacts",
        "list my nigeria contacts",
        "show my india contacts",
        "list international contacts",
        "show my overseas contacts",
      ];
      listDocs.forEach(doc => manager.addDocument("en", doc, "intent.list"));

      // ────────────────────────────────────────────────────────
      // INTENT: GREET
      // ────────────────────────────────────────────────────────
      const greetDocs = [
        "hi", "hello", "hey", "hey there", "hi there",
        "good morning", "good afternoon", "good evening", "good night",
        "howdy", "what is up", "how are you", "how are you doing",
        "how is it going", "yo", "sup", "hiya", "morning", "evening",
        "how far", "how body", "wella", "oya", "e kaaro", "e kaasan",
        "ndewo", "kedu", "sannu",
      ];
      greetDocs.forEach(doc => manager.addDocument("en", doc, "intent.greet"));

      // ────────────────────────────────────────────────────────
      // INTENT: HELP
      // ────────────────────────────────────────────────────────
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

      // ────────────────────────────────────────────────────────
      // INTENT: NONE
      // ────────────────────────────────────────────────────────
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

      // ────────────────────────────────────────────────────────
      // ENTITIES
      // ────────────────────────────────────────────────────────

      // Phone numbers — Nigerian, US, UK, international
      manager.addRegexEntity("phone", "en",
        /(?:\+?(?:234|1|44|91|233|254|27|971|49|33|81|86)\s?)?(?:\(?\d{1,4}\)?\s?)?(?:\d[\s\-]?){6,14}\d/g
      );

      // Email
      manager.addRegexEntity("email", "en",
        /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
      );

      // Money — all supported currencies
      manager.addRegexEntity("money", "en",
        /(?:₦|₹|₵|¥|CA\$|A\$|S\$|MX\$|R\$|CN¥|GH₵|KSh|AED|﷼|SR|\bR\b|\$|£|€)\s?\d{1,3}(?:[,\s]\d{3})*(?:\.\d{1,2})?|\d{1,3}(?:[,\s]\d{3})*(?:\.\d{1,2})?\s?(?:ngn|usd|gbp|eur|cad|aud|inr|ghs|kes|zar|aed|jpy|cny|sar|brl|mxn|sgd|naira|dollar|dollars|pound|pounds|euro|euros|rupee|rupees|cedi|cedis|shilling|yen|yuan|rand|dirham|riyal|real|peso)\b/gi
      );

      // Dates
      manager.addRegexEntity("date_like", "en",
        /\b(?:today|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\b/gi
      );

      // Password/credential markers
      manager.addRegexEntity("password_like", "en",
        /\b(?:password|pin|passcode|otp|secret|credential|login|passphrase)\b/gi
      );

      // Price keyword entity
      manager.addRegexEntity("price_like", "en",
        /\b(?:price|prices|cost|costs|rate|rates|amount|selling|market price|how much|worth|value)\b/gi
      );

      // Currency keyword entity — helps route to correct currency handler
      manager.addRegexEntity("currency_like", "en",
        /\b(?:ngn|usd|gbp|eur|cad|aud|inr|ghs|kes|zar|aed|jpy|cny|sar|brl|mxn|sgd|naira|dollar|dollars|pound|pounds|euro|euros|rupee|rupees|cedi|cedis|shilling|yen|yuan|rand|dirham|riyal|real|peso|₦|₹|₵|¥|\$|£|€)\b/gi
      );

      // Image keyword entity
      manager.addRegexEntity("image_like", "en",
        /\b(?:image|images|photo|photos|picture|pictures|screenshot|screenshots|pic|pics|snap|jpg|jpeg|png|gif|webp)\b/gi
      );

      // Document/file keyword entity
      manager.addRegexEntity("file_like", "en",
        /\b(?:document|documents|doc|docs|pdf|pdfs|file|files|receipt|receipts|invoice|invoices|contract|contracts|report|reports|certificate|payslip|statement|agreement|permit|registration)\b/gi
      );

      // Name-like patterns (title-cased words)
      manager.addRegexEntity("name_like", "en",
        /\b[A-Z][a-z]{2,}\b/g
      );

      // Country/region entity — helps route retrieval to correct context
      manager.addRegexEntity("country_like", "en",
        /\b(?:nigeria|nigerian|uk|united kingdom|england|britain|british|usa|us|america|american|united states|india|indian|ghana|ghanaian|kenya|kenyan|south africa|south african|uae|dubai|canada|canadian|australia|australian|germany|german|france|french|japan|japanese|china|chinese|brazil|brazilian|mexico|mexican|singapore)\b/gi
      );

      // ─── NAMED PLACES ────────────────────────────────────────
      // Nigeria
      manager.addNamedEntityText("place", "port harcourt", ["en"], ["port harcourt", "ph", "portharcourt", "garden city"]);
      manager.addNamedEntityText("place", "lagos", ["en"], ["lagos", "lag", "eko"]);
      manager.addNamedEntityText("place", "abuja", ["en"], ["abuja", "fct", "federal capital territory"]);
      manager.addNamedEntityText("place", "kano", ["en"], ["kano"]);
      manager.addNamedEntityText("place", "ibadan", ["en"], ["ibadan"]);
      manager.addNamedEntityText("place", "enugu", ["en"], ["enugu", "coal city"]);
      manager.addNamedEntityText("place", "benin", ["en"], ["benin city", "benin"]);
      manager.addNamedEntityText("place", "warri", ["en"], ["warri"]);
      manager.addNamedEntityText("place", "aba", ["en"], ["aba"]);
      manager.addNamedEntityText("place", "jos", ["en"], ["jos", "plateau"]);
      manager.addNamedEntityText("place", "calabar", ["en"], ["calabar"]);
      manager.addNamedEntityText("place", "asaba", ["en"], ["asaba"]);
      manager.addNamedEntityText("place", "uyo", ["en"], ["uyo"]);
      manager.addNamedEntityText("place", "onitsha", ["en"], ["onitsha"]);
      // UK
      manager.addNamedEntityText("place", "london", ["en"], ["london", "greater london"]);
      manager.addNamedEntityText("place", "manchester", ["en"], ["manchester"]);
      manager.addNamedEntityText("place", "birmingham", ["en"], ["birmingham", "brum"]);
      manager.addNamedEntityText("place", "edinburgh", ["en"], ["edinburgh"]);
      manager.addNamedEntityText("place", "leeds", ["en"], ["leeds"]);
      manager.addNamedEntityText("place", "glasgow", ["en"], ["glasgow"]);
      manager.addNamedEntityText("place", "bristol", ["en"], ["bristol"]);
      // US
      manager.addNamedEntityText("place", "new york", ["en"], ["new york", "nyc", "new york city"]);
      manager.addNamedEntityText("place", "los angeles", ["en"], ["los angeles", "la", "l.a."]);
      manager.addNamedEntityText("place", "chicago", ["en"], ["chicago"]);
      manager.addNamedEntityText("place", "houston", ["en"], ["houston"]);
      manager.addNamedEntityText("place", "miami", ["en"], ["miami"]);
      manager.addNamedEntityText("place", "atlanta", ["en"], ["atlanta"]);
      manager.addNamedEntityText("place", "dallas", ["en"], ["dallas"]);
      // India
      manager.addNamedEntityText("place", "mumbai", ["en"], ["mumbai", "bombay"]);
      manager.addNamedEntityText("place", "delhi", ["en"], ["delhi", "new delhi"]);
      manager.addNamedEntityText("place", "bangalore", ["en"], ["bangalore", "bengaluru"]);
      manager.addNamedEntityText("place", "hyderabad", ["en"], ["hyderabad"]);
      manager.addNamedEntityText("place", "chennai", ["en"], ["chennai", "madras"]);
      // Africa
      manager.addNamedEntityText("place", "accra", ["en"], ["accra"]);
      manager.addNamedEntityText("place", "nairobi", ["en"], ["nairobi"]);
      manager.addNamedEntityText("place", "johannesburg", ["en"], ["johannesburg", "joburg", "jozi"]);
      manager.addNamedEntityText("place", "cape town", ["en"], ["cape town"]);
      manager.addNamedEntityText("place", "dubai", ["en"], ["dubai", "uae"]);

      // ────────────────────────────────────────────────────────
      // ANSWERS
      // ────────────────────────────────────────────────────────
      manager.addAnswer("en", "intent.greet",
        "Hello! 👋 How can I help you today?\n\n" +
        "💾 *Save:* 'save my [info]'\n" +
        "💰 *Price:* 'save coke ₦300' or 'save coffee $5'\n" +
        "🔍 *Find:* 'show my [topic]'\n" +
        "📸 *Images:* 'show my photos'\n" +
        "📄 *Files:* 'show my documents'\n" +
        "➕ *Upload:* tap the + button"
      );

      manager.addAnswer("en", "intent.help",
        "Here's what I can do:\n\n" +
        "💾 *Save info:*\n" +
        "  → 'save my classmate John 08034332394'\n" +
        "  → 'save my wifi password abc123'\n\n" +
        "💰 *Save prices (multi-currency):*\n" +
        "  → 'save coke ₦300' · 'save coffee $5' · 'save bread £1.20'\n" +
        "  → 'save rice €2' · 'save dal ₹60' · 'save kenkey ₵5'\n" +
        "  → Bulk: 'price pepper 50 garri 800 rice 2500'\n\n" +
        "🔍 *Find notes & contacts:*\n" +
        "  → 'find John number'\n" +
        "  → 'show my classmate'\n" +
        "  → 'find my uk contact'\n\n" +
        "💸 *Find prices:*\n" +
        "  → 'price of coke' · 'how much is garri'\n" +
        "  → 'show usd prices' · 'show all pound prices'\n" +
        "  → 'how much is coffee in dollars'\n\n" +
        "📸 *Find images:*\n" +
        "  → 'show my photos' · 'find my screenshots'\n\n" +
        "📄 *Find files:*\n" +
        "  → 'show my documents' · 'find my receipts'\n\n" +
        "🗑️ *Delete:*\n" +
        "  → 'delete my note about John'\n" +
        "  → 'remove garri price'\n\n" +
        "✏️ *Update:*\n" +
        "  → 'update coke price to ₦400'\n" +
        "  → 'change dollar price of milk'\n\n" +
        "➕ *Upload files:* tap the + button"
      );

      manager.addAnswer("en", "intent.update",
        "To update, say:\n\n" +
        "✏️ 'update coke price to ₦400'\n" +
        "✏️ 'change garri price to ₦600'\n" +
        "✏️ 'update dollar price of milk'\n" +
        "✏️ 'change pound price of bread'\n" +
        "✏️ 'update John number'"
      );

      manager.addAnswer("en", "intent.list",
        "To see all your saved items:\n\n" +
        "📋 'show all my notes'\n" +
        "💰 'show all my prices'\n" +
        "💵 'show all usd prices'\n" +
        "💷 'show all gbp prices'\n" +
        "💶 'show all eur prices'\n" +
        "📸 'show all my images'\n" +
        "📄 'show all my documents'\n" +
        "👥 'show all my contacts'\n" +
        "🌍 'show my uk contacts'"
      );

      manager.addAnswer("en", "intent.none",
        "I didn't understand that. Try:\n\n" +
        "💾 'save my [info]'\n" +
        "💰 'save coke ₦300' or 'save coffee $5'\n" +
        "🔍 'show my [topic]'\n" +
        "💸 'price of coke' or 'how much is bread'\n" +
        "📸 'show my photos'\n" +
        "📄 'show my documents'\n" +
        "➕ tap + to upload\n\n" +
        "Type *help* to see all commands."
      );

      await manager.train();
      return manager;
    })();
  }

  return managerPromise;
}