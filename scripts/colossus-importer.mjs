/**
 * Colossus Importer
 *
 * Parses raw stat-block text (as found in the Colossus of the Drylands supplement)
 * and creates a fully populated Colossus actor with embedded Segment items.
 */

// ─────────────────────────────────────────────────────────────────────────────
//  PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse raw colossus text into a structured JS object.
 * @param {string} rawText
 * @returns {object} parsed colossus data
 */
export function parseColossus(rawText) {
    // Normalise line endings and split into non-empty "blocks" separated by blank lines
    const lines = rawText.replace(/\r\n/g, '\n').split('\n').map(l => l.trim());

    // ── Header (always lines 0–1) ─────────────────────────────────────────────
    const firstLine = lines[0] ?? '';
    const commaIdx = firstLine.indexOf(',');
    const name = commaIdx > 0 ? firstLine.slice(0, commaIdx).trim() : firstLine;
    const subtitle = commaIdx > 0 ? firstLine.slice(commaIdx + 1).trim() : '';

    const tierMatch = (lines[1] ?? '').match(/Tier\s+(\d+)/i);
    const tier = tierMatch ? parseInt(tierMatch[1]) : 1;

    // First word of the colossus name is the shared prefix for segment headers
    const prefix = name.split(/\s+/)[0];

    // ── Group lines into blank-line-separated blocks ──────────────────────────
    const blocks = [];
    let current = [];
    for (const line of lines) {
        if (line === '') {
            if (current.length) { blocks.push(current); current = []; }
        } else {
            current.push(line);
        }
    }
    if (current.length) blocks.push(current);

    // ── Find where segment blocks start ───────────────────────────────────────
    // A segment block starts when the first line begins with "<prefix> " and
    // the block contains "Adjacent" or "Difficulty" somewhere.
    const segmentStartIdx = blocks.findIndex((b, i) => {
        if (i === 0) return false;
        const header = b[0];
        if (!header.startsWith(prefix + ' ')) return false;
        return b.some(l => /^Adjacent|^Difficulty|^HP/i.test(l));
    });

    // ── Parse pre-segment (colossus-level) blocks ─────────────────────────────
    let description = '';
    let motives = '';
    let size = '';
    let thresholds = { major: 0, severe: 0 };
    let stress = 0;
    const experiences = [];
    const colFeatures = [];

    // Everything before segmentStartIdx that isn't the name/tier line
    const headerBlocks = segmentStartIdx > 0 ? blocks.slice(0, segmentStartIdx) : blocks;
    let inFeatures = false;

    for (const block of headerBlocks) {
        if (block[0] === 'Features') { inFeatures = true; continue; }

        if (inFeatures) {
            for (const line of block) {
                const feat = parseFeatureLine(line);
                if (feat) colFeatures.push(feat);
            }
            continue;
        }

        for (const line of block) {
            const threshM = line.match(/Thresholds:\s*(\d+)\/(\d+)\s*\|\s*Stress:\s*(\d+)/i);
            if (threshM) {
                thresholds = { major: parseInt(threshM[1]), severe: parseInt(threshM[2]) };
                stress = parseInt(threshM[3]);
                continue;
            }
            if (/^Experience:/i.test(line)) {
                const expStr = line.replace(/^Experience:\s*/i, '');
                for (const chunk of expStr.split(',')) {
                    const m = chunk.trim().match(/^(.+?)\s*\+(\d+)$/);
                    if (m) experiences.push({ name: m[1].trim(), value: parseInt(m[2]) });
                }
                continue;
            }
            if (/^Motives\s*[&and]*\s*Tactics/i.test(line)) {
                motives = line.replace(/^[^:]+:\s*/, '');
                continue;
            }
            if (/^Size:/i.test(line)) { size = line.replace(/^Size:\s*/i, ''); continue; }
        }

        // First non-header, non-labeled paragraph → description
        const blockText = block.join(' ');
        if (!description && !block[0].match(/^(Tier|Segments:|Thresholds|Experience|Motives|Size|Features)/i)) {
            description = blockText;
        }
    }

    // ── Parse segment blocks ──────────────────────────────────────────────────
    const segments = [];
    if (segmentStartIdx >= 0) {
        for (let i = segmentStartIdx; i < blocks.length; i++) {
            if (!blocks[i][0].startsWith(prefix + ' ')) continue;
            segments.push(parseSegmentBlock(blocks, i, prefix));
        }
    }

    return { name, subtitle, tier, description, motives, size, thresholds, stress, experiences, features: colFeatures, segments };
}

/**
 * Convert a parsed colossus object into Foundry actor + embedded segment items.
 * @param {object} parsed  Return value of parseColossus()
 * @returns {Promise<Actor>}
 */
export async function importColossus(parsed) {
    const { name, subtitle, tier, description, motives, size, thresholds, stress, experiences, features, segments } = parsed;

    // Build experiences object (keyed by random ID, as the system stores them)
    const expObj = {};
    for (const exp of experiences) {
        expObj[foundry.utils.randomID()] = { name: exp.name, value: exp.value, description: '' };
    }

    // Build notes string from motives + size (nice to have as reference)
    const notes = [motives ? `Motives & Tactics: ${motives}` : '', size ? `Size: ${size}` : '']
        .filter(Boolean).join('\n');

    // ── Create actor ──────────────────────────────────────────────────────────
    const actorData = {
        name: subtitle ? `${name}, ${subtitle}` : name,
        type: 'fb-cod.colossus',
        system: {
            description,
            type: 'standard',
            tier,
            experiences: expObj,
            damageThresholds: { major: thresholds.major, severe: thresholds.severe },
            resources: {
                hitPoints: { value: 0, max: 0 },
                stress: { value: 0, max: stress }
            },
            notes
        }
    };

    const actor = await Actor.create(actorData);
    if (!actor) { ui.notifications.error('Foundryborne Giants | Failed to create Colossus actor.'); return; }

    // ── Colossus-level features ───────────────────────────────────────────────
    const featureItems = features.map(f => ({
        name: f.name,
        type: 'feature',
        system: { description: f.description, featureForm: f.actionType }
    }));
    if (featureItems.length) await actor.createEmbeddedDocuments('Item', featureItems);

    // ── Segment items ─────────────────────────────────────────────────────────
    const segmentItems = segments.flatMap(seg => buildSegmentItems(seg));
    if (segmentItems.length) await actor.createEmbeddedDocuments('Item', segmentItems);

    ui.notifications.info(
        `Foundryborne Giants | "${actorData.name}" imported with ${segmentItems.length} segment(s).`
    );
    actor.sheet.render({ force: true });
    return actor;
}

// ─────────────────────────────────────────────────────────────────────────────
//  INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a single feature/action line of the form:
 *   "Name - Passive|Action|Reaction: Description text"
 * @param {string} line
 * @returns {{name:string, actionType:string, description:string}|null}
 */
function parseFeatureLine(line) {
    const m = line.match(/^(.+?)\s+-\s+(Passive|Action|Reaction):\s*(.+)/i);
    if (!m) return null;
    return { name: m[1].trim(), actionType: m[2].toLowerCase(), description: m[3].trim() };
}

/**
 * Extract all lines that belong to a segment block (until the next segment header).
 * @param {string[][]} blocks  All blocks
 * @param {number}     start   Index of the segment's starting block
 * @param {string}     prefix  Colossus name prefix (e.g. "Ikeri")
 * @returns {object}  Parsed segment data
 */
function parseSegmentBlock(blocks, start, prefix) {
    // Collect lines from this block onward until the next segment header
    const lines = [];
    for (let i = start; i < blocks.length; i++) {
        if (i > start && blocks[i][0].startsWith(prefix + ' ')) break;
        lines.push(...blocks[i], '');
    }

    const headerLine = lines[0] ?? '';

    // Parse count suffix, e.g. "Ikeri Arm (2)" → count=2
    const countM = headerLine.match(/\((\d+)\)/);
    const count = countM ? parseInt(countM[1]) : 1;
    const rawSegName = headerLine.replace(/\s*\(\d+\)/, '').replace(prefix + ' ', '').trim();
    const segType = inferSegmentType(rawSegName);

    // Parse stat fields
    let adjacentSegments = '';
    let difficulty = 12;
    let hp = 5;
    let atkModifier = null;
    const attacks = [];
    const features = [];
    let inFeatures = false;

    for (const line of lines) {
        if (!line) continue;

        if (/^Adjacent Segments?:/i.test(line)) {
            adjacentSegments = line.replace(/^Adjacent Segments?:\s*/i, '').trim();
        } else if (/^Difficulty:/i.test(line)) {
            const m = line.match(/Difficulty:\s*(\d+)\s*\|\s*HP:\s*(\d+)/i);
            if (m) { difficulty = parseInt(m[1]); hp = parseInt(m[2]); }
        } else if (/^ATK:/i.test(line)) {
            // Format: "ATK: +2 | PeckName: Range | 1d10+1 phy"
            // or      "ATK: +2 | PeckName Range | 1d10+1 phy"
            const m = line.match(/ATK:\s*([+-]?\d+)\s*\|\s*([^|]+)\s*\|\s*(.+)/i);
            if (m) {
                atkModifier = parseInt(m[1]);
                const middlePart = m[2].trim();
                const dmgStr = m[3].trim();

                // "Peck: Melee" or "Punch: Very Close" or without colon "Stomp Very Close"
                const colonSplit = middlePart.match(/^([^:]+):\s*(.+)$/);
                const atkName = colonSplit ? colonSplit[1].trim() : middlePart.split(/\s+/)[0];
                const rangeStr = colonSplit ? colonSplit[2].trim() : middlePart.replace(atkName, '').trim();

                attacks.push({ name: atkName, range: mapRange(rangeStr), damage: dmgStr });
            }
        } else if (line === 'Features') {
            inFeatures = true;
        } else if (inFeatures) {
            const feat = parseFeatureLine(line);
            if (feat) features.push(feat);
        }
    }

    // Parse chainGroup from the Chain feature text, e.g. "Chain (A) - Passive: ..."
    let chainGroup = '';
    let fatal = false;
    for (const f of features) {
        const chainM = f.name.match(/^Chain\s*\(([A-Z])\)$/i);
        if (chainM) chainGroup = chainM[1].toUpperCase();
        if (/^Fatal$/i.test(f.name)) fatal = true;
    }

    return { name: rawSegName, segmentType: segType, count, adjacentSegments, difficulty, hp, atkModifier, attacks, features, chainGroup, fatal };
}

/**
 * Infer segment type key from the raw name.
 * @param {string} name  e.g. "Head", "Arm", "Leg"
 * @returns {string}
 */
function inferSegmentType(name) {
    const l = name.toLowerCase();
    if (l === 'head') return 'head';
    if (l === 'torso') return 'torso';
    if (l === 'neck') return 'neck';
    if (l === 'core') return 'core';
    if (l === 'tail') return 'tail';
    if (l.includes('arm')) return 'arm-left';
    if (l.includes('leg')) return 'leg-left';
    if (l.includes('wing')) return 'wing-left';
    if (l.includes('claw')) return 'claw';
    return 'other';
}

/**
 * Map a plain range string to the system's internal range key.
 * @param {string} rangeStr  e.g. "Melee", "Very Close"
 * @returns {string}
 */
function mapRange(rangeStr) {
    const map = {
        'melee': 'melee',
        'very close': 'veryClose',
        'close': 'close',
        'far': 'far',
        'very far': 'veryFar'
    };
    return map[rangeStr.toLowerCase()] ?? 'melee';
}

/**
 * Map damage type abbreviations to system keys.
 * @param {string} dmgStr  e.g. "1d10+1 phy"
 * @returns {string[]}
 */
function mapDamageTypes(dmgStr) {
    const abbrev = { phy: 'physical', psy: 'psychic', mag: 'magic', mix: 'physical' };
    const types = [];
    for (const [abbr, full] of Object.entries(abbrev)) {
        if (new RegExp(abbr, 'i').test(dmgStr)) types.push(full);
    }
    return types.length ? types : ['physical'];
}

/**
 * Extract just the dice formula from a damage string like "1d10+1 phy".
 * @param {string} dmgStr
 * @returns {string}
 */
function extractFormula(dmgStr) {
    return dmgStr.replace(/\s*(phy|psy|mag|mix)\b/gi, '').trim();
}

/**
 * Build an attack action source object for ActionsField (keyed by _id).
 * @param {object} atk           Parsed attack ({name, range, damage})
 * @param {number} atkModifier   ATK bonus
 * @returns {object}
 */
function buildAttackActionSource(atk, atkModifier) {
    const id = foundry.utils.randomID();
    return [id, {
        _id: id,
        type: 'attack',
        systemPath: 'actions',
        name: atk.name,
        description: '',
        actionType: 'action',
        chatDisplay: true,
        range: atk.range,
        roll: {
            type: 'attack',
            trait: null,
            difficulty: null,
            bonus: atkModifier ?? 0,
            advState: 'neutral',
            useDefault: false,
            diceRolling: { multiplier: 'prof', flatMultiplier: 1, dice: 'd6', compare: null, treshold: null }
        },
        damage: {
            direct: false,
            includeBase: false,
            parts: [{
                applyTo: 'hitPoints',
                resultBased: false,
                base: false,
                type: mapDamageTypes(atk.damage),
                value: {
                    multiplier: 'flat',
                    flatMultiplier: 1,
                    dice: 'd6',
                    bonus: null,
                    custom: { enabled: true, formula: extractFormula(atk.damage) }
                },
                valueAlt: {
                    multiplier: 'flat',
                    flatMultiplier: 1,
                    dice: 'd6',
                    bonus: null,
                    custom: { enabled: false, formula: '' }
                }
            }]
        }
    }];
}

/**
 * Build a passive/action/reaction feature action source object.
 * @param {{name:string, actionType:string, description:string}} feat
 * @returns {[string, object]}
 */
function buildFeatureActionSource(feat) {
    const id = foundry.utils.randomID();
    return [id, {
        _id: id,
        type: 'passive',
        systemPath: 'actions',
        name: feat.name,
        description: feat.description,
        actionType: feat.actionType,
        chatDisplay: true
    }];
}

/**
 * Build one or more segment item data objects, expanding count > 1 into named copies.
 * @param {object} seg  Parsed segment data
 * @returns {object[]}  Array of Foundry item creation data objects
 */
function buildSegmentItems(seg) {
    /** Side name pairs for symmetric body parts */
    const SIDES = {
        arm: ['Left Arm', 'Right Arm'],
        leg: ['Left Leg', 'Right Leg'],
        wing: ['Left Wing', 'Right Wing']
    };
    const TYPE_PAIRS = {
        arm: ['arm-left', 'arm-right'],
        leg: ['leg-left', 'leg-right'],
        wing: ['wing-left', 'wing-right']
    };

    const items = [];

    for (let i = 0; i < seg.count; i++) {
        let segName = seg.name;
        let segType = seg.segmentType;

        if (seg.count > 1) {
            const base = seg.name.toLowerCase();
            const sideKey = Object.keys(SIDES).find(k => base.includes(k));
            if (sideKey) {
                segName = SIDES[sideKey][i] ?? `${seg.name} ${i + 1}`;
                segType = TYPE_PAIRS[sideKey]?.[i] ?? seg.segmentType;
            } else {
                segName = `${seg.name} ${i + 1}`;
            }
        }

        // Build the actions plain object (keyed by _id) for ActionsField
        const actionsObj = {};
        for (const atk of seg.attacks) {
            const [id, src] = buildAttackActionSource(atk, seg.atkModifier);
            actionsObj[id] = src;
        }
        for (const feat of seg.features) {
            const [id, src] = buildFeatureActionSource(feat);
            actionsObj[id] = src;
        }

        items.push({
            name: segName,
            type: 'fb-cod.colossal-segment',
            system: {
                difficulty: seg.difficulty,
                atkModifier: seg.atkModifier,
                adjacentSegments: seg.adjacentSegments,
                segmentType: segType,
                fatal: seg.fatal,
                chainGroup: seg.chainGroup,
                resource: {
                    type: 'simple',
                    name: 'HP',
                    value: seg.hp,
                    max: seg.hp
                },
                actions: actionsObj
            }
        });
    }

    return items;
}
