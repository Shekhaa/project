const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'mobile/src');

function getAllFiles(dir, exts = ['.ts', '.tsx']) {
  let files = [];
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    if (fs.statSync(full).isDirectory()) {
      if (item !== 'node_modules' && item !== '.expo') {
        files = files.concat(getAllFiles(full, exts));
      }
    } else if (exts.some(ext => item.endsWith(ext))) {
      files.push(full);
    }
  }
  return files;
}

const files = [path.join(__dirname, 'mobile/App.tsx'), ...getAllFiles(srcDir)];
console.log(`Checking ${files.length} files...`);

// Check for missing local imports
files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  const importLines = content.match(/import\s+(?:{[^}]+}|\w+|\*\s+as\s+\w+)\s+from\s+['"][^'"]+['"]/g) || [];
  
  importLines.forEach(line => {
    const match = line.match(/from\s+['"]([^'"]+)['"]/);
    if (!match) return;
    const importPath = match[1];
    if (importPath.startsWith('.')) {
      const dir = path.dirname(f);
      const resolved = path.resolve(dir, importPath);
      const possible = [
        resolved + '.ts',
        resolved + '.tsx',
        resolved + '.js',
        resolved + '.jsx',
        path.join(resolved, 'index.ts'),
        path.join(resolved, 'index.tsx'),
      ];
      if (!possible.some(p => fs.existsSync(p))) {
        console.error(`Broken relative import in ${f}: ${importPath}`);
      }
    }
  });
});

console.log('Relative import check complete.');
