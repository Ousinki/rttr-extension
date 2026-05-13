const span = { tagName: 'SPAN', dataset: { idx: String(Math.floor(0 / 2)) } };
console.log('tagName:', span.tagName);
console.log('dataset.idx:', span.dataset.idx);
console.log('truthy:', !!span.dataset.idx);
