const fs = require('fs');
const path = require('path');
function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else { 
      if (file.endsWith('.jsx') || file.endsWith('.js')) results.push(file);
    }
  });
  return results;
}
const jsFiles = walk('./src');
jsFiles.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  // Match property exactly like `animation: 'fadeIn 0.5s',` or `animation: 'fadeIn 0.5s'`
  content = content.replace(/animation:\s*['"][^'"]+['"],?/g, '');
  // Also clean up any trailing comma that might be left if it was the last prop in an object, but React handles trailing commas in style objects fine.
  fs.writeFileSync(file, content);
});
console.log('Done cleaning JS files');
