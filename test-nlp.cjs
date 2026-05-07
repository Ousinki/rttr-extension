const nlp = require('compromise');

const text = "The two fighters locked eyes before the boxing match, neither wanting to be the first to look away. He took off his jacket.";
const doc = nlp(text);

console.log("--- Nouns ---");
console.log(doc.nouns().out('array'));

console.log("\n--- Verbs ---");
console.log(doc.verbs().out('array'));

console.log("\n--- Chunks ---");
console.log(doc.chunks().out('array'));

console.log("\n--- Clauses ---");
console.log(doc.clauses().out('array'));

console.log("\n--- Phrasal Verbs? ---");
// compromise might have a phrasal verbs plugin or match syntax
console.log(doc.match('#PhrasalVerb').out('array'));
console.log(doc.match('#Verb #Noun').out('array'));
