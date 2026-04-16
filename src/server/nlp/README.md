# NLP Intent Setup - Clean Architecture

This directory contains the Natural Language Processing (NLP) setup for the Memora app, organized into separate intent files for better maintainability.

## Directory Structure

```
src/server/nlp/
├── intents/                    # Individual intent files
│   ├── delete.ts              # Delete intent training data
│   ├── save.ts                # Save intent training data
│   ├── retrieve.ts            # General retrieve intent (notes & contacts)
│   ├── retrieve-prices.ts     # Price-specific retrieve intent
│   ├── retrieve-files.ts      # File/image retrieve intent
│   ├── update.ts              # Update intent training data
│   ├── list.ts                # List/show all data intent
│   ├── greet.ts               # Greeting intent
│   ├── help.ts                # Help intent
│   ├── none.ts                # None/fallback intent
│   └── index.ts               # Exports all intents
├── setup.ts                   # Main NLP manager setup
├── replyBuilder.ts            # Response formatting utilities
└── README.md                  # This file
```

## Intent Categories

### Core Intents
- **delete.ts** - Handles deletion of saved data (notes, prices, contacts, files)
- **save.ts** - Handles saving new information (notes, prices, contacts)
- **update.ts** - Handles updating existing saved data

### Retrieve Intents
- **retrieve.ts** - General retrieval for notes and contacts
- **retrieve-prices.ts** - Price-specific queries and searches
- **retrieve-files.ts** - File and image retrieval

### Utility Intents
- **list.ts** - Show all data, categorized views, recent items
- **greet.ts** - Greeting and conversational starters
- **help.ts** - Help and guidance requests
- **none.ts** - Fallback for unrecognized inputs

## Usage

The main `setup.ts` file imports all intents and trains the NLP model:

```typescript
import {
  addDeleteIntent,
  addSaveIntent,
  addRetrieveIntent,
  addRetrievePricesIntent,
  addRetrieveFilesIntent,
  addUpdateIntent,
  addListIntent,
  addGreetIntent,
  addHelpIntent,
  addNoneIntent,
} from "./intents";

// All intents are added to the manager and trained
```

## Adding New Intents

1. Create a new file in the `intents/` directory (e.g., `new-intent.ts`)
2. Export a function that adds training documents to the manager:

```typescript
import { NlpManager } from "node-nlp";

export function addNewIntent(manager: NlpManager): void {
  const trainingDocs = [
    "example phrase one",
    "example phrase two",
    // ... more training examples
  ];

  trainingDocs.forEach(doc => manager.addDocument("en", doc, "intent.new"));
}
```

3. Add the export to `intents/index.ts`
4. Import and call the function in `setup.ts`

## Training Data Guidelines

- Include multiple variations of the same intent
- Cover different phrasings users might use
- Include both formal and informal language
- Consider different contexts (questions, commands, statements)
- Test edge cases and common misspellings

## Maintenance

Each intent file can be maintained independently, making it easier to:
- Add new training examples
- Debug specific intent recognition issues
- Update intent logic without affecting others
- Track changes to specific intent categories