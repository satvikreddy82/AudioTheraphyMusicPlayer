const fs = require('fs');
const path = require('path');

const PUB = path.join(__dirname, 'public');
if (!fs.existsSync(PUB)) {
  fs.mkdirSync(PUB, { recursive: true });
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const item of fs.readdirSync(src)) {
      copyRecursive(path.join(src, item), path.join(dest, item));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

const itemsToCopy = [
  'index.html',
  'player.html',
  'style.css',
  'player.css',
  'player.js',
  'pwa.js',
  'musicService.js',
  'sw.js',
  'manifest.json',
  'manifest.webmanifest',
  'assets',
  'icons'
];

for (const item of itemsToCopy) {
  const srcPath = path.join(__dirname, item);
  const destPath = path.join(PUB, item);
  if (fs.existsSync(srcPath)) {
    copyRecursive(srcPath, destPath);
  }
}

console.log('Build complete! Output in public/');

