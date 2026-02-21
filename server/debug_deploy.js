const fs = require('fs');
const path = require('path');

function findEntryFileHelper(baseDir, entryRelativePath, depth = 0) {
    if (depth > 10) return null;
    try {
        const target = path.join(baseDir, entryRelativePath);
        if (fs.existsSync(target) && fs.statSync(target).isFile()) {
            return target;
        }

        const items = fs.readdirSync(baseDir);
        for (const item of items) {
            const itemPath = path.join(baseDir, item);
            if (fs.existsSync(itemPath) && fs.statSync(itemPath).isDirectory()) {
                if (['node_modules', '.git', '.next', 'dist', 'build', '.idea', '.vscode'].includes(item)) {
                    continue;
                }
                const found = findEntryFileHelper(itemPath, entryRelativePath, depth + 1);
                if (found) return found;
            }
        }
    } catch (e) { return null; }
    return null;
}

const userId = '698974cb937390819c75593a';
const baseUserDir = path.join(__dirname, 'user_projects');
const userDir = path.join(baseUserDir, userId);

console.log(`Checking userDir: ${userDir}`);

const packageJson = findEntryFileHelper(userDir, 'package.json', 0);
console.log(`packageJson: ${packageJson}`);

const indexFile = findEntryFileHelper(userDir, 'index.html', 0);
console.log(`indexFile: ${indexFile}`);

if (!packageJson && !indexFile) {
    console.warn("[Deploy] No project found. Searching deeply...");
    let deepFound = false;
    let sourceDir = userDir;
    const subdirs = fs.readdirSync(userDir).filter(f => fs.statSync(path.join(userDir, f)).isDirectory());
    for (const sub of subdirs) {
        console.log(`Checking subdir: ${sub}`);
        if (fs.existsSync(path.join(userDir, sub, 'package.json')) || fs.existsSync(path.join(userDir, sub, 'index.html'))) {
            sourceDir = path.join(userDir, sub);
            deepFound = true;
            console.log(`Found in depth 1: ${sourceDir}`);
            break;
        }
        // Depth 2
        const subsubdirs = fs.readdirSync(path.join(userDir, sub)).filter(f => fs.statSync(path.join(userDir, sub, f)).isDirectory());
        for (const subsub of subsubdirs) {
            console.log(`  Checking subsubdir: ${sub}/${subsub}`);
            if (fs.existsSync(path.join(userDir, sub, subsub, 'package.json')) || fs.existsSync(path.join(userDir, sub, subsub, 'index.html'))) {
                sourceDir = path.join(userDir, sub, subsub);
                deepFound = true;
                console.log(`Found in depth 2: ${sourceDir}`);
                break;
            }
        }
        if (deepFound) break;
    }
    if (!deepFound) {
        console.error("[Deploy] No project found. RETURN 404");
    } else {
        console.log(`SUCCESS: sourceDir is ${sourceDir}`);
    }
}
