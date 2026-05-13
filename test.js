const { JSDOM } = require("jsdom");
const dom = new JSDOM(`<body></body>`);
const document = dom.window.document;

const span = document.createElement('span');
span.dataset.idx = String(Math.floor(0 / 2));
console.log('tagName:', span.tagName);
console.log('dataset.idx:', span.dataset.idx);
console.log('truthy:', !!span.dataset.idx);
