/**
 * Colossus Importer
 *
 * Parses raw stat-block text (as found in the Colossus of the Drylands supplement)
 * and creates a fully populated Colossus actor with embedded Segment items.
 */
export class ColossusImporter {

    /**
     * Parse raw colossus text into a structured JS object.
     * @param {string} rawText
     * @returns {object} parsed colossus data
     */
    static parseColossus(rawText) {
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
        const segmentHeaderIdxs = [];
        for (let i = 0; i < rawLines.length; i++) {
            const l = rawLines[i].toUpperCase();
            if (l.startsWith(prefix + ' ') && i > 0) {
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
                const feat = this.parseFeatureLine(line);
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
            if (i <= tierIdx) continue; 

            if (!description && line.length > 20) {
                description = line;
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
            segments.push(this.parseSegmentBlock(segLines, prefix));
        }

        return { name, subtitle, tier, description, motives, size, thresholds, stress, experiences, features: colFeatures, segments };
    }

    /**
     * Unified utility to link segments on an actor based on their requested adjacency.
     * Marks segments as adjacent to each other if they match the names or types listed.
     * @param {Actor} actor
     */
    static async linkSegments(actor) {
        const segments = actor.itemTypes["fb-cod.colossal-segment"] || [];
        if (!segments.length) return;

        const updates = [];
        for (const item of segments) {
            const adjs = item.system.adjacentSegments || [];
            if (!adjs.length) continue;

            const resolvedNames = new Set();
            for (const target of adjs) {
                const targetLower = target.toLowerCase();
                
                const matches = segments.filter(other => {
                    if (other.id === item.id) return false;
                    const otherType = other.system.segmentType?.toLowerCase();
                    const otherName = other.name.toLowerCase();
                    
                    // Match by exact segment type or if the name contains the target
                    return (otherType === targetLower) || otherName.includes(targetLower);
                });

                matches.forEach(m => resolvedNames.add(m.name));
            }

            const newAdjs = Array.from(resolvedNames);
            if (newAdjs.length > 0) {
                updates.push({
                    _id: item.id,
                    "system.adjacentSegments": newAdjs
                });
            }
        }

        if (updates.length > 0) {
            console.log(`fb-cod | Linking adjacency for ${updates.length} segments.`);
            await actor.updateEmbeddedDocuments("Item", updates);
        }
    }

    /**
     * Convert a parsed colossus object into Foundry actor + embedded segment items.
     * @param {object} parsed  Return value of parseColossus()
     * @returns {Promise<Actor>}
     */
    static async importColossus(parsed) {
        const { name, subtitle, tier, description, motives, size, thresholds, stress, experiences, features, segments } = parsed;

        // ── Pre-fetch Segment Footprints ──────────────────────────────────────────
        const pack = game.packs.get("fb-cod.colossal-segments");
        const footprints = {};
        if (pack) {
            const index = await pack.getIndex({ fields: ["img", "segmentType", "system.segmentType"] });
            for (const entry of index) {
                const type = entry.segmentType || entry.system?.segmentType;
                if (type) {
                    footprints[type] = {
                        img: entry.img,
                        system: { segmentType: type }
                    };
                }
            }
        }

        const expObj = {};
        for (const exp of experiences) {
            expObj[foundry.utils.randomID()] = { name: exp.name, value: exp.value, description: '' };
        }

        const actorData = {
            name: subtitle ? `${name}, ${subtitle}` : name,
            type: 'fb-cod.colossus',
            system: {
                description,
                type: 'standard',
                tier,
                experiences: expObj,
                damageThresholds: { major: thresholds.major, severe: thresholds.severe },
                motivesAndTactics: motives,
                size: this.mapActorSize(size),
                resources: {
                    hitPoints: { value: 0, max: 0 },
                    stress: { value: 0, max: stress }
                }
            }
        };

        const actor = await Actor.create(actorData);
        if (!actor) return;

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

        const allSegmentItems = [];
        const allSegmentFeatures = [];
        for (const seg of segments) {
            const { segmentItems, segmentFeatures } = this.buildSegmentItems(seg, footprints);
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

        await this.linkSegments(actor);

        ui.notifications.info(`fb-cod | "${actorData.name}" imported with ${createdSegments.length} segment(s).`);
        actor.sheet.render({ force: true });
        return actor;
    }

    // --- Helpers as Static Methods ---

    static parseFeatureLine(line) {
        const m = line.match(/^(.+)\s+-\s+(Passive|Action|Reaction):\s*(.+)/i);
        if (!m) return null;
        return { name: m[1].trim(), actionType: m[2].toLowerCase(), description: m[3].trim() };
    }

    static parseSegmentBlock(blocks, prefix) {
        const lines = blocks.flat();
        const headerLine = lines[0] ?? '';
        const countM = headerLine.match(/\((\d+)\)/);
        const count = countM ? parseInt(countM[1]) : 1;

        let rawSegName = headerLine.replace(/\s*\(\d+\)/, '').replace(new RegExp("^" + prefix, 'i'), '').trim();
        if (rawSegName === rawSegName.toUpperCase()) {
            rawSegName = rawSegName.charAt(0) + rawSegName.slice(1).toLowerCase();
        }

        const segType = this.inferSegmentType(rawSegName);
        let adjacentSegments = [];
        let difficulty = 12;
        let hp = 5;
        let atkModifier = null;
        const attacks = [];
        const features = [];
        let inFeatures = false;
        let currentFeature = null;

        for (let line of lines) {
            if (!line) continue;
            line = line.trim();

            if (/^Adjacent Segments?:/i.test(line)) {
                const rawAdjacent = line.replace(/^Adjacent Segments?:\s*/i, '').trim();
                adjacentSegments = rawAdjacent.split(/[,;]/).map(s => s.trim()).filter(Boolean);
            } else if (/^Difficulty:/i.test(line)) {
                const m = line.match(/Difficulty:\s*(\d+)\s*\|\s*HP:\s*([\w\d]+)/i);
                if (m) {
                    difficulty = parseInt(m[1]);
                    const hpStr = m[2].trim().toLowerCase();
                    hp = hpStr === 'none' ? 0 : (parseInt(hpStr) || 5);
                }
            } else if (/^ATK:?/i.test(line)) {
                const m = line.match(/^ATK:?\s*([+-]?\d+)\s*\|\s*([^|]+)\s*\|\s*(.+)/i);
                if (m) {
                    atkModifier = parseInt(m[1]);
                    const middlePart = m[2].trim();
                    const dmgStr = m[3].trim();
                    let atkName = middlePart;
                    let rangeStr = 'Melee';
                    const colonMatch = middlePart.match(/^([^:]+):\s*(.+)$/);
                    const parenMatch = middlePart.match(/^([^(]+)\(([^)]+)\)$/);
                    if (colonMatch) {
                        atkName = colonMatch[1].trim();
                        rangeStr = colonMatch[2].trim();
                    } else if (parenMatch) {
                        atkName = parenMatch[1].trim();
                        rangeStr = parenMatch[2].trim();
                    } else {
                        atkName = middlePart.split(/\s+/)[0];
                        rangeStr = middlePart.replace(atkName, '').trim() || 'Melee';
                    }
                    attacks.push({ name: atkName, range: this.mapRange(rangeStr), damage: dmgStr });
                }
            } else if (line.toUpperCase() === 'FEATURES') {
                inFeatures = true;
            } else if (inFeatures) {
                const feat = this.parseFeatureLine(line);
                if (feat) {
                    if (currentFeature) features.push(currentFeature);
                    currentFeature = feat;
                } else if (currentFeature) {
                    currentFeature.description += " " + line;
                }
            }
        }
        if (currentFeature) features.push(currentFeature);

        let parsedSubgroup = '';
        let fatal = false;
        for (const f of features) {
            const chainM = f.name.match(/^(?:Chain|Chain Group)\s*\(?([A-Z])\)?$/i);
            if (chainM) parsedSubgroup = chainM[1].toUpperCase();
            if (/^Fatal$/i.test(f.name)) fatal = true;
        }

        return { name: rawSegName, segmentType: segType, count, adjacentSegments, difficulty, hp, atkModifier, attacks, features, subgroup: parsedSubgroup, fatal };
    }

    static inferSegmentType(name) {
        const l = name.toLowerCase();
        const dynamicTypes = CONFIG.FB_COD.segmentTypes || {};
        for (const [type, label] of Object.entries(dynamicTypes)) {
            if (l.includes(type.toLowerCase()) || l.includes(label.toLowerCase())) return type;
        }
        if (l.includes('head')) return 'head';
        if (l.includes('neck')) return 'neck';
        if (l.includes('torso')) return 'torso';
        if (l.includes('thorax')) return 'thorax';
        if (l.includes('abdomen')) return 'abdomen';
        if (l.includes('carapace')) return 'carapace';
        if (l.includes('shell')) return 'shell';
        if (l.includes('arm')) return 'arm';
        if (l.includes('forelimb')) return 'forelimb';
        if (l.includes('hindlimb')) return 'hindlimb';
        if (l.includes('leg')) return 'leg';
        if (l.includes('wing')) return 'wing';
        if (l.includes('claw')) return 'claw';
        if (l.includes('talon')) return 'talon';
        if (l.includes('pincer')) return 'pincer';
        if (l.includes('tentacle')) return 'tentacle';
        if (l.includes('antenna') || l.includes('antennae')) return 'antennae';
        if (l.includes('tail')) return 'tail';
        return 'carapace';
    }

    static mapActorSize(sizeStr) {
        if (!sizeStr) return 'gargantuan';
        const l = sizeStr.toLowerCase();
        if (l.includes('gargantuan')) return 'gargantuan';
        if (l.includes('huge')) return 'huge';
        if (l.includes('large')) return 'large';
        if (l.includes('medium')) return 'medium';
        if (l.includes('small')) return 'small';
        if (l.includes('tiny')) return 'tiny';
        return 'gargantuan';
    }

    static mapRange(rangeStr) {
        const map = { 'melee': 'melee', 'very close': 'veryClose', 'close': 'close', 'far': 'far', 'very far': 'veryFar' };
        return map[rangeStr.toLowerCase()] ?? 'melee';
    }

    static mapDamageTypes(dmgStr) {
        const abbrev = { phy: 'physical', psy: 'psychic', mag: 'magic', mix: 'physical' };
        const types = [];
        for (const [abbr, full] of Object.entries(abbrev)) {
            if (new RegExp(abbr, 'i').test(dmgStr)) types.push(full);
        }
        return types.length ? types : ['physical'];
    }

    static extractFormula(dmgStr) {
        return dmgStr.replace(/\s*(phy|psy|mag|mix)\b/gi, '').trim();
    }

    static buildAttackFeatureSource(atk, atkModifier, segmentName) {
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
                                type: this.mapDamageTypes(atk.damage),
                                value: {
                                    multiplier: 'flat',
                                    flatMultiplier: 1,
                                    dice: 'd6',
                                    bonus: null,
                                    custom: { enabled: true, formula: this.extractFormula(atk.damage) }
                                }
                            }],
                            includeBase: false
                        }
                    }
                }
            }
        };
    }

    static buildFeatureActionSource(feat) {
        const id = foundry.utils.randomID();
        return [id, {
            _id: id,
            type: 'effect',
            systemPath: 'actions',
            name: feat.name,
            description: feat.description,
            actionType: feat.actionType,
            chatDisplay: true
        }];
    }

    static buildSegmentItems(seg, footprints = {}) {
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
                const sideNameMap = SIDES[segType];
                if (sideNameMap && seg.count === 2) {
                    const sideName = sideNameMap[i];
                    segName = sideName;
                    position = sideName.split(' ')[0];
                } else {
                    const singularBase = seg.name.replace(/s$/i, '');
                    segName = `${singularBase} ${i + 1}`;
                }
            }

            for (const atk of seg.attacks) {
                segmentFeatures.push(this.buildAttackFeatureSource(atk, seg.atkModifier, segName));
            }

            for (const feat of seg.features) {
                const [actionId, actionSource] = this.buildFeatureActionSource(feat);
                segmentFeatures.push({
                    name: feat.name,
                    type: 'feature',
                    system: {
                        description: feat.description,
                        featureForm: feat.actionType,
                        identifier: segName,
                        originItemType: 'fb-cod.colossal-segment',
                        actions: { [actionId]: actionSource }
                    }
                });
            }

            const footprint = footprints[segType];
            const footprintData = footprint ? foundry.utils.deepClone(footprint) : null;

            const metadata = CONFIG.FB_COD.chainGroupsMetadata || {};
            const categoriesMap = Object.entries(metadata).filter(([ident, data]) => ident !== "U" && ident !== "");
            let chainGroupIdent = "";

            if (seg.subgroup) {
                const match = categoriesMap.find(([ident, data]) => {
                    return (ident === seg.subgroup) && (data.segmentTypes || []).includes(segType);
                });
                chainGroupIdent = match ? match[0] : (metadata["U"] ? "U" : "");
            }

            segmentItems.push({
                name: segName,
                type: 'fb-cod.colossal-segment',
                img: footprintData?.img || 'systems/daggerheart/assets/icons/documents/actors/dragon-head.svg',
                system: foundry.utils.mergeObject(footprintData?.system || {}, {
                    difficulty: seg.difficulty || footprintData?.system?.difficulty || 12,
                    attack: { modifier: seg.atkModifier || footprintData?.system?.attack?.modifier || 0 },
                    adjacentSegments: (seg.adjacentSegments && seg.adjacentSegments.length > 0) ? seg.adjacentSegments : (footprintData?.system?.adjacentSegments || []),
                    segmentType: segType,
                    position,
                    fatal: seg.fatal || false,
                    chainGroup: chainGroupIdent,
                    subgroup: seg.subgroup || "",
                    hitPoints: {
                        value: seg.hp ?? footprintData?.system?.hitPoints?.value ?? 5,
                        max: seg.hp ?? footprintData?.system?.hitPoints?.max ?? 5
                    }
                })
            });
        }
        return { segmentItems, segmentFeatures };
    }
}

// Backward compatibility exports
export const parseColossus = ColossusImporter.parseColossus.bind(ColossusImporter);
export const importColossus = ColossusImporter.importColossus.bind(ColossusImporter);
export const linkSegments = ColossusImporter.linkSegments.bind(ColossusImporter);
