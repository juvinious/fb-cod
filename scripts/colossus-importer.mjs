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
    // Normalise line endings and split into lines
    const rawLines = rawText.replace(/\r\n/g, '\n').split('\n').map(l => l.trim());
    const lines = rawLines.filter(l => l !== '');

    // ── Header (Find the Tier line as the anchor) ─────────────────────────────
    const tierIdx = rawLines.findIndex(l => /Tier\s+(\d+)/i.test(l));
    let name = '';
    let subtitle = '';
    let tier = 1;

    if (tierIdx >= 0) {
        const tierMatch = rawLines[tierIdx].match(/Tier\s+(\d+)/i);
        tier = parseInt(tierMatch[1]);

        // Collect all lines before the Tier line for name and subtitle
        const headerLines = rawLines.slice(0, tierIdx).filter(l => l !== '');
        if (headerLines.length > 0) {
            const fullTitle = headerLines[0];
            const commaIdx = fullTitle.indexOf(',');
            if (commaIdx > 0) {
                name = fullTitle.slice(0, commaIdx).trim();
                subtitle = (fullTitle.slice(commaIdx + 1) + " " + headerLines.slice(1).join(" ")).trim();
            } else {
                name = fullTitle;
                subtitle = headerLines.slice(1).join(" ");
            }
        }
    } else {
        // Fallback for unexpected format
        const firstLine = lines[0] ?? '';
        const commaIdx = firstLine.indexOf(',');
        name = commaIdx > 0 ? firstLine.slice(0, commaIdx).trim() : firstLine;
        subtitle = commaIdx > 0 ? firstLine.slice(commaIdx + 1).trim() : '';
    }

    // First word of the colossus name is the shared prefix for segment headers
    const prefix = name.split(/\s+/)[0].toUpperCase();

    // ── Find where segment blocks start ───────────────────────────────────────
    // A segment header starts with prefix + ' ' and is followed by stats
    const segmentHeaderIdxs = [];
    for (let i = 0; i < rawLines.length; i++) {
        const l = rawLines[i].toUpperCase();
        if (l.startsWith(prefix + ' ') && i > 0) {
            // Check next 5 lines for segment keywords
            const nextLines = rawLines.slice(i + 1, i + 6);
            if (nextLines.some(nl => /^(Adjacent|Difficulty|HP)/i.test(nl))) {
                segmentHeaderIdxs.push(i);
            }
        }
    }

    const firstSegmentIdx = segmentHeaderIdxs[0] ?? rawLines.length;

    // ── Parse Colossus-Level Data ─────────────────────────────────────────────
    const colLines = rawLines.slice(0, firstSegmentIdx);
    let description = '';
    let motives = '';
    let size = '';
    let thresholds = { major: 0, severe: 0 };
    let stress = 0;
    const experiences = [];
    const colFeatures = [];
    let inFeatures = false;
    let currentFeature = null;

    for (let i = 0; i < colLines.length; i++) {
        const line = colLines[i];
        if (!line) continue;

        if (line.toUpperCase() === 'FEATURES') { inFeatures = true; continue; }

        if (inFeatures) {
            const feat = parseFeatureLine(line);
            if (feat) {
                if (currentFeature) colFeatures.push(currentFeature);
                currentFeature = feat;
            } else if (currentFeature) {
                currentFeature.description += " " + line;
            }
            continue;
        }

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
        if (/^Segments:/i.test(line)) continue;
        if (i <= tierIdx) continue; // Skip header/tier lines

        // Anything else before Features is description
        if (!description && line.length > 20) {
            description = line;
            // Potential multi-line description? Check if next line is not a labeled line
            let next = i + 1;
            while (next < colLines.length &&
                !colLines[next].match(/^(Thresholds|Experience|Motives|Size|Segments:|FEATURES)/i)) {
                if (colLines[next]) description += " " + colLines[next];
                next++;
            }
            i = next - 1;
        }
    }
    if (currentFeature) colFeatures.push(currentFeature);

    // ── Parse Segments ────────────────────────────────────────────────────────
    const segments = [];
    for (let j = 0; j < segmentHeaderIdxs.length; j++) {
        const start = segmentHeaderIdxs[j];
        const end = segmentHeaderIdxs[j + 1] ?? rawLines.length;
        const segLines = rawLines.slice(start, end);
        segments.push(parseSegmentBlock(segLines, prefix));
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

    // ── Pre-fetch Segment Footprints ──────────────────────────────────────────
    const pack = game.packs.get("fb-cod.colossal-segments");
    const footprints = {};
    if (pack) {
        console.log(`fb-cod | Found pack ${pack.collection}, fetching documents...`);
        const docs = await pack.getDocuments();
        console.log(`fb-cod | Fetched ${docs.length} documents from pack.`);
        for (const doc of docs) {
            const type = doc.system.segmentType;
            if (type) {
                footprints[type] = doc.toObject();
                console.log(`fb-cod | Cached footprint for type: ${type}, img: ${footprints[type].img}`);
            }
        }
    } else {
        console.error("fb-cod | Could not find compendium pack 'fb-cod.colossal-segments'");
    }

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
    if (!actor) { ui.notifications.error('fb-cod | Failed to create Colossus actor.'); return; }

    // ── Colossus-level features ───────────────────────────────────────────────
    const featureItems = features.map(f => ({
        name: f.name,
        type: 'feature',
        system: {
            description: f.description,
            featureForm: f.actionType,
            originItemType: 'fb-cod.colossus'
        }
    }));
    if (featureItems.length) await actor.createEmbeddedDocuments('Item', featureItems);

    // ── Segment items & Segment-level features ────────────────────────────────
    const allSegmentItems = [];
    const allSegmentFeatures = [];
    for (const seg of segments) {
        const { segmentItems, segmentFeatures } = buildSegmentItems(seg, footprints);
        allSegmentItems.push(...segmentItems);
        allSegmentFeatures.push(...segmentFeatures);
    }

    let createdSegments = [];
    if (allSegmentItems.length) {
        createdSegments = await actor.createEmbeddedDocuments('Item', allSegmentItems);
    }
    if (allSegmentFeatures.length) {
        await actor.createEmbeddedDocuments('Item', allSegmentFeatures);
    }

    // ── Second Pass: Resolve Adjacency Names to IDs ──────────────────────────
    if (createdSegments.length > 0) {
        // Build a mapping of Name -> ID and SegmentType -> ID (Array)
        const nameToId = new Map();
        const typeToIds = new Map();

        for (const segDoc of createdSegments) {
            nameToId.set(segDoc.name.toLowerCase(), segDoc.id);

            const typeKey = segDoc.system.segmentType;
            if (typeKey) {
                if (!typeToIds.has(typeKey)) typeToIds.set(typeKey, []);
                typeToIds.get(typeKey).push(segDoc.id);
            }
        }

        const updates = [];
        for (const segDoc of createdSegments) {
            const pendingNames = segDoc.system.adjacentSegments || [];
            if (pendingNames.length === 0) continue;

            const resolvedIds = [];
            for (const name of pendingNames) {
                const lowerName = name.toLowerCase();

                // 1. Try exact name match (e.g. "Left Arm")
                if (nameToId.has(lowerName)) {
                    resolvedIds.push(nameToId.get(lowerName));
                    continue;
                }

                // 2. Try segment type match (e.g. "Arms" -> "arm")
                // Resolve to ALL instances of that type found on the colossus
                const inferredType = inferSegmentType(name);
                if (typeToIds.has(inferredType)) {
                    resolvedIds.push(...typeToIds.get(inferredType));
                }
            }

            // Deduplicate and filter nulls
            const finalIds = [...new Set(resolvedIds)].filter(Boolean);

            if (finalIds.length > 0) {
                updates.push({
                    _id: segDoc.id,
                    'system.adjacentSegments': finalIds
                });
            }
        }

        if (updates.length > 0) {
            await actor.updateEmbeddedDocuments('Item', updates);
        }
    }

    ui.notifications.info(
        `fb-cod | "${actorData.name}" imported with ${createdSegments.length} segment(s).`
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
    // Greedily match the name allowing internal hyphens, up to the last " - Type:"
    const m = line.match(/^(.+)\s+-\s+(Passive|Action|Reaction):\s*(.+)/i);
    if (!m) return null;
    return { name: m[1].trim(), actionType: m[2].toLowerCase(), description: m[3].trim() };
}

/**
 * Extract all lines that belong to a segment block (until the next segment header).
 * @param {string[][]} blocks  The blocks belonging to this segment
 * @param {string}     prefix  Colossus name prefix (e.g. "Ikeri")
 * @returns {object}  Parsed segment data
 */
function parseSegmentBlock(blocks, prefix) {
    const lines = blocks.flat();
    const headerLine = lines[0] ?? '';

    // Parse count suffix, e.g. "Ikeri Arm (2)" → count=2
    const countM = headerLine.match(/\((\d+)\)/);
    const count = countM ? parseInt(countM[1]) : 1;

    // Remove prefix and count to get the "clean" name
    let rawSegName = headerLine.replace(/\s*\(\d+\)/, '')
        .replace(new RegExp("^" + prefix, 'i'), '')
        .trim();

    // Title Case the segment name (e.g. "HEAD" -> "Head")
    if (rawSegName === rawSegName.toUpperCase()) {
        rawSegName = rawSegName.charAt(0) + rawSegName.slice(1).toLowerCase();
    }

    const segType = inferSegmentType(rawSegName);

    // Parse stat fields
    let adjacentSegments = [];
    let difficulty = 12;
    let hp = 5;
    let atkModifier = null;
    const attacks = [];
    const features = [];
    let inFeatures = false;
    let currentFeature = null;
    const prefixCaseInsensitive = new RegExp("^" + prefix, 'i');

    for (let line of lines) {
        if (!line) continue;
        line = line.trim();

        if (/^Adjacent Segments?:/i.test(line)) {
            const rawAdjacent = line.replace(/^Adjacent Segments?:\s*/i, '').trim();
            // Split by comma or semicolon, trim, and remove empty strings
            adjacentSegments = rawAdjacent.split(/[,;]/).map(s => s.trim()).filter(Boolean);
        } else if (/^Difficulty:/i.test(line)) {
            // Difficulty: 16 | HP: 5
            // or Difficulty: 15 | HP: None
            const m = line.match(/Difficulty:\s*(\d+)\s*\|\s*HP:\s*([\w\d]+)/i);
            if (m) {
                difficulty = parseInt(m[1]);
                const hpStr = m[2].trim().toLowerCase();
                hp = hpStr === 'none' ? 0 : (parseInt(hpStr) || 5);
            }
        } else if (/^ATK:?/i.test(line)) {
            // Format: "ATK +2 | Peck Name: Range | 1d10+1 phy" or "ATK: +2 | Peck Name (Range) | 1d10+1 phy"
            const m = line.match(/^ATK:?\s*([+-]?\d+)\s*\|\s*([^|]+)\s*\|\s*(.+)/i);
            if (m) {
                atkModifier = parseInt(m[1]);
                const middlePart = m[2].trim();
                const dmgStr = m[3].trim();

                let atkName = middlePart;
                let rangeStr = 'Melee';

                // Handle "Peck: Melee" vs "Peck (Melee)"
                const colonMatch = middlePart.match(/^([^:]+):\s*(.+)$/);
                const parenMatch = middlePart.match(/^([^(]+)\(([^)]+)\)$/);

                if (colonMatch) {
                    atkName = colonMatch[1].trim();
                    rangeStr = colonMatch[2].trim();
                } else if (parenMatch) {
                    atkName = parenMatch[1].trim();
                    rangeStr = parenMatch[2].trim();
                } else {
                    // Fallback splitting first word if missing both
                    atkName = middlePart.split(/\s+/)[0];
                    rangeStr = middlePart.replace(atkName, '').trim() || 'Melee';
                }

                attacks.push({ name: atkName, range: mapRange(rangeStr), damage: dmgStr });
            }
        } else if (line.toUpperCase() === 'FEATURES') {
            inFeatures = true;
        } else if (inFeatures) {
            const feat = parseFeatureLine(line);
            if (feat) {
                if (currentFeature) features.push(currentFeature);
                currentFeature = feat;
            } else if (currentFeature) {
                currentFeature.description += " " + line;
            }
        }
    }
    if (currentFeature) features.push(currentFeature);

    // Parse chainGroup from the Chain feature text, e.g. "Chain (A) - Passive: ..."
    let chainGroup = '';
    let fatal = false;
    for (const f of features) {
        // Match "Chain (A)", "Chain A", "Chain Group (A)", or "Chain Group A"
        const chainM = f.name.match(/^(?:Chain|Chain Group)\s*\(?([A-L])\)?$/i);
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
    if (l.includes('head')) return 'head';
    if (l.includes('neck')) return 'neck';
    if (l.includes('torso')) return 'torso';
    if (l.includes('thorax')) return 'thorax';
    if (l.includes('abdomen')) return 'abdomen';
    if (l.includes('carapace')) return 'carapace';
    if (l.includes('clipping')) return 'carapace';
    if (l.includes('shell')) return 'shell';
    if (l.includes('arm')) return 'arm';
    if (l.includes('forelimb')) return 'forelimb';
    if (l.includes('foreleg')) return 'forelimb';
    if (l.includes('hindlimb')) return 'hindlimb';
    if (l.includes('hindleg')) return 'hindlimb';
    if (l.includes('leg')) return 'leg';
    if (l.includes('wing')) return 'wing';
    if (l.includes('claw')) return 'claw';
    if (l.includes('talon')) return 'talon';
    if (l.includes('pincer')) return 'pincer';
    if (l.includes('tentacle')) return 'tentacle';
    if (l.includes('antenna') || l.includes('antennae')) return 'antennae';
    if (l.includes('tail')) return 'tail';
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
 * Build an attack feature source object.
 * @param {object} atk           Parsed attack ({name, range, damage})
 * @param {number} atkModifier   ATK bonus
 * @param {string} segmentName   Name of the linked segment
 * @returns {object}
 */
function buildAttackFeatureSource(atk, atkModifier, segmentName) {
    const actionId = foundry.utils.randomID();
    const isMagic = (atk.damage || '').toLowerCase().includes('magical') || (atk.damage || '').toLowerCase().includes('mag');
    const icon = isMagic ? "icons/magic/symbols/ring-circle-smoke-blue.webp" : "icons/skills/melee/strike-sword-blood-red.webp";

    return {
        name: atk.name,
        type: 'feature',
        img: icon,
        system: {
            identifier: segmentName,
            originItemType: 'fb-cod.colossal-segment',
            featureForm: 'action',
            actions: {
                [actionId]: {
                    _id: actionId,
                    type: 'attack',
                    systemPath: 'actions',
                    name: atk.name,
                    img: icon,
                    actionType: 'action',
                    chatDisplay: true,
                    range: atk.range,
                    cost: [],
                    uses: { value: null, max: '', recovery: null },
                    target: { type: 'any', amount: null },
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
                            }
                        }],
                        includeBase: false
                    }
                }
            }
        }
    };
}

/**
 * Build a generic feature source object.
 * @param {object} feat
 * @param {string} featureForm
 * @param {string} segmentName
 * @returns {object}
 */
function buildFeatureSource(feat, featureForm, segmentName) {
    const actionId = foundry.utils.randomID();

    // Assign generic icons based on featureForm
    let icon = "icons/skills/melee/strike-sword-blood-red.webp";
    let internalActionType = 'damage'; // default to damage if not passive
    if (featureForm === 'passive') {
        icon = "icons/magic/defensive/shield-barrier-glowing-blue.webp";
        internalActionType = 'effect';
    } else if (featureForm === 'reaction') {
        icon = "icons/skills/movement/feet-winged-boots-glowing-yellow.webp";
    }

    const actionSource = {
        _id: actionId,
        type: internalActionType,
        systemPath: 'actions',
        name: feat.name,
        img: icon,
        actionType: featureForm === 'passive' ? '' : featureForm,
        description: `<p>${feat.description}</p>`,
        chatDisplay: true,
        cost: [],
        uses: { value: null, max: '', recovery: null },
        target: { type: 'any', amount: null }
    };

    return {
        name: feat.name,
        type: 'feature',
        img: icon,
        system: {
            identifier: segmentName,
            originItemType: 'fb-cod.colossal-segment',
            featureForm: featureForm,
            actions: { [actionId]: actionSource }
        }
    };
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
        type: 'effect', // Map to generic 'effect' type
        systemPath: 'actions',
        name: feat.name,
        description: feat.description,
        actionType: feat.actionType, // 'action', 'reaction', or 'passive'
        chatDisplay: true
    }];
}

/**
 * Build one or more segment item data objects, expanding count > 1 into named copies.
 * @param {object} seg         Parsed segment data
 * @param {object} footprints  Map of segmentType -> footprint item data
 * @returns {object[]}  Array of Foundry item creation data objects
 */
function buildSegmentItems(seg, footprints = {}) {
    /** Side name suffixes for symmetric body parts */
    const SIDES = {
        arm: ['Left Arm', 'Right Arm'],
        forelimb: ['Left Forelimb', 'Right Forelimb'],
        hindlimb: ['Left Hindlimb', 'Right Hindlimb'],
        leg: ['Left Leg', 'Right Leg'],
        wing: ['Left Wing', 'Right Wing'],
        claw: ['Left Claw', 'Right Claw'],
        talon: ['Left Talon', 'Right Talon'],
        pincer: ['Left Pincer', 'Right Pincer'],
        tentacle: ['Left Tentacle', 'Right Tentacle'],
        antennae: ['Left Antenna', 'Right Antenna']
    };

    const segmentItems = [];
    const segmentFeatures = [];

    for (let i = 0; i < seg.count; i++) {
        let segName = seg.name;
        let segType = seg.segmentType;
        let position = '';

        if (seg.count > 1) {
            // Find side naming mapping based on the inferred segment type
            const sideNameMap = SIDES[segType];

            if (sideNameMap && seg.count === 2) {
                const sideName = sideNameMap[i]; // "Left Arm", "Right Arm"
                segName = sideName;
                position = sideName.split(' ')[0]; // "Left", "Right"
            } else {
                const singularBase = seg.name.replace(/s$/i, '');
                segName = `${singularBase} ${i + 1}`;
                position = `${i + 1}`;
            }
        }

        // Build the actions plain object (keyed by _id) for ActionsField
        // Build the actions (Attacks stay on the segment)
        // Attacks and Features both become top-level Actor Items linked to this segment
        for (const atk of seg.attacks) {
            segmentFeatures.push(buildAttackFeatureSource(atk, seg.atkModifier, segName));
        }

        for (const feat of seg.features) {
            const [actionId, actionSource] = buildFeatureActionSource(feat);
            segmentFeatures.push({
                name: feat.name,
                type: 'feature',
                system: {
                    description: feat.description,
                    featureForm: feat.actionType, // 'action', 'reaction', or 'passive'
                    identifier: segName, // Link to segment
                    originItemType: 'fb-cod.colossal-segment',
                    actions: { [actionId]: actionSource }
                }
            });
        }

        const footprint = footprints[segType];
        if (!footprint) console.warn(`fb-cod | No footprint found in compendium for segment type: ${segType}`);
        const footprintData = footprint ? foundry.utils.deepClone(footprint) : null;

        const segmentData = {
            name: segName,
            type: 'fb-cod.colossal-segment',
            img: footprintData?.img || 'systems/daggerheart/assets/icons/documents/actors/dragon-head.svg',
            system: foundry.utils.mergeObject(footprintData?.system || {}, {
                difficulty: seg.difficulty || footprintData?.system?.difficulty || 12,
                attack: {
                    modifier: seg.atkModifier || footprintData?.system?.attack?.modifier || 0
                },
                adjacentSegments: (seg.adjacentSegments && seg.adjacentSegments.length > 0)
                    ? seg.adjacentSegments
                    : (footprintData?.system?.adjacentSegments || []),
                segmentType: segType,
                position,
                fatal: seg.fatal || footprintData?.system?.fatal || false,
                chainGroup: seg.chainGroup || footprintData?.system?.chainGroup || "",
                hitPoints: {
                    value: seg.hp ?? footprintData?.system?.hitPoints?.value ?? 5,
                    max: seg.hp ?? footprintData?.system?.hitPoints?.max ?? 5
                },
                resource: {} // Nullify resource
            })
        };

        segmentItems.push(segmentData);
    }

    return { segmentItems, segmentFeatures };
}
