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
      if (file.endsWith('.css')) results.push(file);
    }
  });
  return results;
}
const cssFiles = walk('./src');
cssFiles.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  // Remove any CSS rule that contains :hover
  // Matches from the start of the selector (after previous '}') up to the closing '}'
  content = content.replace(/(?:^|\})([^{]*?:hover[^{]*?\{[^}]*\})/g, function(match, p1) {
      // return the '}' if it matched one at the start, to preserve the previous block's closing brace
      return match.startsWith('}') ? '}\n' : '';
  });
  // The above regex might need to run twice in case of adjacent :hover blocks
  content = content.replace(/(?:^|\})([^{]*?:hover[^{]*?\{[^}]*\})/g, function(match, p1) {
      return match.startsWith('}') ? '}\n' : '';
  });
  fs.writeFileSync(file, content);
});
console.log('Done cleaning hover from CSS files');
