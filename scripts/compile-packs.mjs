import { spawn } from 'child_process';
import { stat, readdir, mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

const PACKS_SRC = 'src/packs';
const PACKS_OUT = 'packs';
const MANIFEST_PATH = join(PACKS_SRC, 'manifest.json');
const MODULE_ID = 'fb-cod';

/**
 * Get the last modification time of a file or directory.
 */
async function getMTime(path) {
    try {
        const stats = await stat(path);
        if (stats.isDirectory()) {
            const files = await readdir(path, { recursive: true });
            let maxMTime = stats.mtimeMs;
            for (const file of files) {
                // Ignore manifest.json itself if checking the root
                if (file === 'manifest.json') continue;
                const fstat = await stat(join(path, file));
                if (fstat.mtimeMs > maxMTime) maxMTime = fstat.mtimeMs;
            }
            return maxMTime;
        }
        return stats.mtimeMs;
    } catch {
        return 0;
    }
}

/**
 * Run a shell command and wait for completion.
 */
function runCommand(command, args) {
    return new Promise((resolve, reject) => {
        console.log(`> ${command} ${args.join(' ')}`);
        const proc = spawn(command, args, { stdio: 'inherit', shell: true });
        proc.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Command failed with code ${code}`));
        });
    });
}

/**
 * Load the manifest file.
 */
async function loadManifest() {
    try {
        const data = await readFile(MANIFEST_PATH, 'utf8');
        return JSON.parse(data);
    } catch {
        return {};
    }
}

/**
 * Save the manifest file.
 */
async function saveManifest(manifest) {
    await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
}

/**
 * Main execution logic.
 */
async function main() {
    const args = process.argv.slice(2);
    const isUnpack = args.includes('--unpack') || args.includes('-u');
    
    // Ensure directories exist
    await mkdir(PACKS_SRC, { recursive: true });
    await mkdir(PACKS_OUT, { recursive: true });

    const manifest = await loadManifest();
    const sourcePacks = await readdir(PACKS_SRC);
    const outPacks = await readdir(PACKS_OUT);
    
    // Identify all packs we care about
    const allPacks = Array.from(new Set([...sourcePacks, ...outPacks]))
        .filter(p => p !== 'manifest.json' && !p.startsWith('.'));

    let manifestChanged = false;

    for (const packName of allPacks) {
        const srcPath = join(PACKS_SRC, packName);
        const outPath = join(PACKS_OUT, packName);

        const srcMTime = await getMTime(srcPath);
        const outMTime = await getMTime(outPath);

        const packEntry = manifest[packName] || { packedMTime: 0, unpackedMTime: 0 };

        if (isUnpack) {
            // Unpack if the binary pack is newer than our last recorded unpack timestamp
            if (outMTime > packEntry.unpackedMTime || outMTime === 0 && packEntry.unpackedMTime === 0) {
                console.log(`[Unpacking] ${packName} (Binary is newer than recorded)`);
                await runCommand('npx', [
                    'fvtt', 'package', 'unpack',
                    '--type', 'Module',
                    '--id', MODULE_ID,
                    '-n', packName,
                    '--in', PACKS_OUT,
                    '--out', srcPath
                ]);
                // Update BOTH timestamps in manifest to baseline
                const newSrcMTime = await getMTime(srcPath);
                manifest[packName] = {
                    packedMTime: newSrcMTime,
                    unpackedMTime: outMTime
                };
                manifestChanged = true;
            } else {
                console.log(`[Skipping] ${packName} (Binary is up-to-date with recorded metadata)`);
            }
        } else {
            // Pack if the source JSONs are newer than our last recorded pack timestamp
            if (srcMTime > packEntry.packedMTime) {
                console.log(`[Packing] ${packName} (Source is newer than recorded)`);
                
                // Clear the target pack using the fvtt utility instead of direct file operations
                // to ensure no duplicates if IDs have changed.
                await runCommand('npx', [
                    'fvtt', 'package', 'clear',
                    '--type', 'Module',
                    '--id', MODULE_ID,
                    '-n', packName,
                    '--out', PACKS_OUT
                ]);

                await runCommand('npx', [
                    'fvtt', 'package', 'pack',
                    '--type', 'Module',
                    '--id', MODULE_ID,
                    '-n', packName,
                    '--in', srcPath,
                    '--out', PACKS_OUT
                ]);
                // Update BOTH timestamps in manifest to baseline
                const newOutMTime = await getMTime(outPath);
                manifest[packName] = {
                    packedMTime: srcMTime,
                    unpackedMTime: newOutMTime
                };
                manifestChanged = true;
            } else {
                console.log(`[Skipping] ${packName} (Source is up-to-date with recorded metadata)`);
            }
        }
    }

    if (manifestChanged) {
        await saveManifest(manifest);
        console.log(`[Updated] ${MANIFEST_PATH}`);
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
