const pattern = /what.*s the typical price gap in (?<destination>[a-z\s]+)/;
const text = "what's the typical price gap in paris";
const match = text.match(pattern);
console.log("Match[0]:", match[0]);
console.log("Groups:", match.groups);

const replaced = text.replace(match[0], "");
console.log("Replaced:", `"${replaced}"`);
