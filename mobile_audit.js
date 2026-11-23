const fs = require('fs');
const path = require('path');

function checkFile(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  ['useRef', 'useMemo', 'useCallback', 'useState', 'useEffect'].forEach(hook => {
    const hookRegex = new RegExp('\\b' + hook + '\\b');
    if (hookRegex.test(code)) {
      const importRegex = new RegExp('import\\s+[^;]*?\\b' + hook + '\\b[^;]*?from\\s+[\'"]react[\'"]');
      const reactDotRegex = new RegExp('React\\.' + hook);
      if (!importRegex.test(code) && !reactDotRegex.test(code)) {
        console.log(`Missing ${hook} in: ${filePath}`);
      }
    }
  });
}

function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      if (f !== 'node_modules' && f !== '.git' && f !== '.expo') walk(full);
    } else if (f.endsWith('.tsx') || f.endsWith('.ts')) {
      checkFile(full);
    }
  }
}

walk(path.join(__dirname, 'mobile/src'));
checkFile(path.join(__dirname, 'mobile/App.tsx'));
