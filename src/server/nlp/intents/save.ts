import { NlpManager } from "node-nlp";

export function addSaveIntent(manager: NlpManager): void {
  const saveDocs = [
    // Core save patterns
    "save this",
    "save my number",
    "save my password",
    "save john number 08034332394",
    "save my classmate john 08034332394",
    "save my email is test@gmail.com",
    "save victor address port harcourt",
    "save my bank account 1234567890",
    "save my pin 4321",
    "remember this",
    "remember my password",
    "remember john number 08034332394",
    "store this for me",
    "store my number",
    "store my password",
    "keep this safe",
    "keep my number",
    "note this down",
    "note down my number",
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

    // International contact saves (reduced)
    "save my address in london",
    "save my us phone number",
    "save my uk mobile",
    "store my canadian number",
    "save my indian contact",
    "remember my australia number",
    "save my dubai contact",
    "store my south africa number",

    // Price saves - NGN (reduced)
    "save coke price 300",
    "save garri price 500",
    "save rice cost 2000",
    "save tomatoes price 150",
    "save fuel price 650",
    "save bread price 200",
    "save milk cost 400",
    "save indomie price 120",
    "save sugar price 800",
    "save beans price 1200",
    "save eggs price 100",
    "save palm oil price 3000",
    "save noodles price 150",
    "save water price 50",
    "save chicken price 3500",
    "save flour price 1500",
    "save bag price 2000",
    "save shoe price 5000",
    "save phone price 80000",
    "save laptop price 250000",
    "save charger price 3000",
    "save shirt price 4000",
    "save generator price 150000",
    "save diesel price 1200",
    "save data price 1000",
    "save airtime price 500",

    // Price saves - USD (reduced)
    "save apple price $2.99",
    "save milk cost $1.49",
    "save bread price $3.50",
    "save gas price $4.20",
    "save coffee price $5",
    "save burger price $8.99",
    "save rent $1200",
    "save iphone price $999",
    "save pizza price $12",

    // Price saves - GBP (reduced)
    "save bread price £1.20",
    "save milk £0.89",
    "save rent £900",
    "save tube fare £2.50",
    "save fish and chips £8",
    "save electricity bill £80",
    "save pint price £5",

    // Price saves - EUR (reduced)
    "save coffee price €3",
    "save rent €800",
    "save baguette price €1.20",
    "save wine price €12",

    // Price saves - INR (reduced)
    "save rice price ₹60",
    "save dal price ₹120",
    "save petrol price ₹100",
    "save chai price ₹20",

    // Price saves - Other currencies (reduced)
    "save kenkey price ₵5",
    "save unga price KSh 200",
    "save bread price R15",

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

  saveDocs.forEach((doc) => {
    manager.addDocument("en", doc, "save");
  });

  // Add response examples for better training
  manager.addAnswer("en", "save", "I'll save that for you.");
  manager.addAnswer("en", "save", "Your information has been saved.");
  manager.addAnswer("en", "save", "Got it! I've saved that.");
}