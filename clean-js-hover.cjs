const fs = require('fs');
const path = require('path');
function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    if (fs.statSync(file).isDirectory()) { 
      results = results.concat(walk(file));
    } else { 
      if (file.endsWith('.jsx') || file.endsWith('.js')) results.push(file);
    }
  });
  return results;
}
const jsFiles = walk('./src');
let changed = 0;
jsFiles.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  // Remove onMouseEnter={...} and onMouseLeave={...} with up to 1 level of nested curly braces
  let newContent = content.replace(/onMouse(?:Enter|Leave)\s*=\s*\{([^{}]|\{[^{}]*\})*\}/g, '');
  // Also remove simple ones that might be passed as simple functions onMouseEnter={handleEnter}
  newContent = newContent.replace(/onMouse(?:Enter|Leave)\s*=\s*\{[^{}]*\}/g, '');
  if (newContent !== content) {
      fs.writeFileSync(file, newContent);
      changed++;
  }
});
console.log('Done cleaning JS hovers in ' + changed + ' files');
