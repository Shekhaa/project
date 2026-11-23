const fs = require('fs');
const path = require('path');
const babel = require('./mobile/node_modules/@babel/core');

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
let errCount = 0;

for (const file of files) {
  try {
    const code = fs.readFileSync(file, 'utf8');
    babel.transformSync(code, {
      filename: file,
      presets: [require.resolve('./mobile/node_modules/babel-preset-expo')],
      configFile: path.join(__dirname, 'mobile/babel.config.js'),
    });
  } catch (err) {
    console.error(`Babel parse/transform error in ${file}:\n`, err.message);
    errCount++;
  }
}

console.log(`Babel check completed with ${errCount} errors.`);
