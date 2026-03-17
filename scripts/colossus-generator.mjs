/**
 * Data and Logic for procedurally generating Colossi.
 */
import { ColossusImporter } from './colossus-importer.mjs';
export const ARCHETYPES = {
    quadruped: {
        label: "Quadruped (Great-Beast)",
        segments: [
            { type: "head", count: 1, fatal: true },
            { type: "torso", count: 1 },
            { type: "leg", count: 2, position: ["Front Left", "Front Right"] },
            { type: "leg", count: 2, position: ["Back Left", "Back Right"] },
            { type: "tail", count: 1 }
        ],
        adjacency: [
            ["head", "torso"],
            ["leg", "torso"],
            ["tail", "torso"]
        ]
    },
    avian: {
        label: "Avian (Wind-Sailor)",
        segments: [
            { type: "head", count: 1, fatal: true },
            { type: "neck", count: 1 },
            { type: "torso", count: 1 },
            { type: "wing", count: 2, position: ["Left", "Right"] },
            { type: "talon", count: 2, position: ["Left", "Right"] },
            { type: "tail", count: 1 }
        ],
        adjacency: [
            ["head", "neck"],
            ["neck", "torso"],
            ["wing", "torso"],
            ["talon", "torso"],
            ["tail", "torso"]
        ]
    },
    arthropodal: {
        label: "Arthropodal (Shell-Stalker)",
        segments: [
            { type: "head", count: 1, fatal: true },
            { type: "torso", count: 1 },
            { type: "claw", count: 2, position: ["Left", "Right"] },
            { type: "leg", count: 4, position: ["Front Left", "Front Right", "Back Left", "Back Right"] },
            { type: "shell", count: 1 }
        ],
        adjacency: [
            ["head", "torso"],
            ["claw", "torso"],
            ["leg", "torso"],
            ["shell", "torso"]
        ]
    },
    insectoid: {
        label: "Insectoid (Carapace-Crawler)",
        segments: [
            { type: "head", count: 1, fatal: true },
            { type: "thorax", count: 1 },
            { type: "abdomen", count: 1, fatal: true },
            { type: "leg", count: 6, position: ["Front Left", "Front Right", "Mid Left", "Mid Right", "Rear Left", "Rear Right"] },
            { type: "antennae", count: 2, position: ["Left", "Right"] }
        ],
        adjacency: [
            ["head", "thorax"],
            ["thorax", "abdomen"],
            ["leg", "thorax"],
            ["leg", "abdomen"],
            ["antennae", "head"]
        ]
    },
    bipedal: {
        label: "Bipedal (Steel-Giant)",
        segments: [
            { type: "head", count: 1, fatal: true },
            { type: "torso", count: 1, fatal: true },
            { type: "arm", count: 2, position: ["Left", "Right"] },
            { type: "leg", count: 2, position: ["Left", "Right"] }
        ],
        adjacency: [
            ["head", "torso"],
            ["arm", "torso"],
            ["leg", "torso"]
        ]
    },
    mechanical: {
        label: "Mechanical (Clockwork Sentinel)",
        segments: [
            { type: "head", count: 1, fatal: true },
            { type: "torso", count: 1 },
            { type: "arm", count: 4, position: ["Upper Left", "Upper Right", "Lower Left", "Lower Right"] },
            { type: "leg", count: 2, position: ["Heavy Left", "Heavy Right"] },
            { type: "shell", count: 1 }
        ],
        adjacency: [
            ["head", "torso"],
            ["arm", "torso"],
            ["leg", "torso"],
            ["shell", "torso"]
        ]
    },
    serpentine: {
        label: "Serpentine (Void-Wyrm)",
        segments: [
            { type: "head", count: 1, fatal: true },
            { type: "torso", count: 4, position: ["Segment 1", "Segment 2", "Segment 3", "Segment 4"] },
            { type: "tail", count: 1 }
        ],
        adjacency: [
            ["head", "torso [Segment 1]"],
            ["torso [Segment 1]", "torso [Segment 2]"],
            ["torso [Segment 2]", "torso [Segment 3]"],
            ["torso [Segment 3]", "torso [Segment 4]"],
            ["torso [Segment 4]", "tail"]
        ]
    },
    aquatic: {
        label: "Aquatic (Abyssal-Terror)",
        segments: [
            { type: "head", count: 1, fatal: true },
            { type: "torso", count: 1 },
            { type: "wing", count: 2, position: ["Fin Left", "Fin Right"] },
            { type: "tail", count: 1 },
            { type: "tentacle", count: 2, position: ["Left", "Right"] }
        ],
        adjacency: [
            ["head", "torso"],
            ["wing", "torso"],
            ["tail", "torso"],
            ["tentacle", "torso"]
        ]
    },
    corecentric: {
        label: "Core-Centric (Void-Eye)",
        segments: [
            { type: "carapace", count: 1, fatal: true, name: "Fatal Core (Nucleus)" },
            { type: "torso", count: 1, name: "Fleshy Mass" },
            { type: "tentacle", count: 6, position: ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta"] },
            { type: "shell", count: 1, name: "Protective Aura" }
        ],
        adjacency: [
            ["Fatal Core (Nucleus)", "Fleshy Mass"],
            ["tentacle", "Fleshy Mass"],
            ["Protective Aura", "Fleshy Mass"]
        ]
    },
    headless: {
        label: "Headless-Construct (Ancient-Engine)",
        segments: [
            { type: "carapace", count: 1, fatal: true, name: "Reactor Core" },
            { type: "torso", count: 1, name: "Central Frame" },
            { type: "arm", count: 4, position: ["Front-Left", "Front-Right", "Rear-Left", "Rear-Right"] },
            { type: "leg", count: 2, position: ["Left Support", "Right Support"] },
            { type: "shell", count: 2, position: ["Front Plating", "Rear Plating"] }
        ],
        adjacency: [
            ["Reactor Core", "Central Frame"],
            ["arm", "Central Frame"],
            ["leg", "Central Frame"],
            ["shell", "Central Frame"]
        ]
    }
};

export class ColossusGenerator {
    /**
     * Launch the Generator Dialog.
     */
    static async launch() {
        const archetypes = Object.entries(ARCHETYPES).map(([id, data]) => ({ id, label: data.label }));

        const content = await foundry.applications.handlebars.renderTemplate("modules/fb-cod/templates/actor/colossus-generator-dialog.hbs", {
            archetypes: archetypes
        });

        const dialog = new foundry.applications.api.DialogV2({
            window: { title: "Generate Colossus" },
            content: content,
            buttons: [
                {
                    action: "generate",
                    label: "Generate",
                    icon: "fas fa-magic",
                    default: true,
                    callback: async (event, button, instance) => {
                        const randomize = instance.element.querySelector('[name="randomizeArchetype"]').checked;
                        const archetypeId = instance.element.querySelector('[name="archetype"]').value;
                        const tier = parseInt(instance.element.querySelector('[name="tier"]').value) || 1;
                        await this.generate({ archetype: archetypeId, tier: tier, randomizeArchetype: randomize });
                    }
                },
                {
                    action: "cancel",
                    label: "Cancel",
                    icon: "fas fa-times"
                }
            ]
        });

        await dialog.render(true);

        // Robust post-render UI logic
        const element = dialog.element;
        const randomize = element?.querySelector('[name="randomizeArchetype"]');
        const archetype = element?.querySelector('[name="archetype"]');
        if (randomize && archetype) {
            const toggle = () => {
                const isRandom = randomize.checked;
                archetype.disabled = isRandom;
                const group = archetype.closest(".form-group");
                if (group) {
                    group.style.opacity = isRandom ? "0.5" : "1.0";
                    group.style.pointerEvents = isRandom ? "none" : "auto";
                }
            };
            randomize.addEventListener("change", toggle);
            toggle(); // Initial state
        }
    }

    /**
     * Procedurally generate a Colossus.
     */
    static async generate(options = {}) {
        let archetypeKey = options.archetype || "quadruped";
        if (options.randomizeArchetype) {
            const keys = Object.keys(ARCHETYPES);
            archetypeKey = keys[Math.floor(Math.random() * keys.length)];
            console.log(`fb-cod | Randomized Archetype: ${archetypeKey}`);
        }
        const archetype = ARCHETYPES[archetypeKey] || ARCHETYPES.quadruped;
        const tier = options.tier || 1;

        ui.notifications.info(`fb-cod | Generating ${archetype.label} (Tier ${tier})...`);

        // 0. Select Primary Theme
        const themes = ["aquatic", "earth", "fire", "wind", "void", "mechanical", "beast", "undead"];
        const primaryTheme = themes[Math.floor(Math.random() * themes.length)];
        console.log(`fb-cod | Selected Primary Theme: ${primaryTheme}`);

        // 1. Roll for Name, Motive, Tactics
        const name = await this._rollName(primaryTheme);
        const motiveTactics = await this._rollMotiveTactics();
        const experiences = await this._rollExperiences(2, primaryTheme);

        // 2. Base Actor Data
        const actorData = {
            name: name,
            type: "fb-cod.colossus",
            system: {
                motivesAndTactics: motiveTactics,
                size: "gargantuan",
                difficulty: 10 + (tier * 2),
                damageThresholds: {
                    minor: 4 + (tier * 2),
                    major: 8 + (tier * 4),
                    severe: 12 + (tier * 6)
                },
                experiences: experiences
            }
        };

        const actor = await Actor.create(actorData);
        if (!actor) return;

        // 3. Generate Segments
        const createdSegments = await this._generateSegments(actor, archetype, tier);

        // 4. Assign Chains (grouped segments)
        await this._assignChains(actor, createdSegments, options.archetype);

        // 5. Generate Procedural Features
        await this._generateProceduralFeatures(actor, createdSegments, options.archetype, primaryTheme, tier);

        ui.notifications.info(`fb-cod | Generated ${name}!`);
        actor.sheet.render(true);
    }

    /**
     * Internal: Roll for name components.
     */
    static async _rollName(theme) {
        const tableIds = [
            "fb-cod.colossal-generator-tables.prefixes00000000",
            "fb-cod.colossal-generator-tables.roots00000000000",
            "fb-cod.colossal-generator-tables.suffixes00000000"
        ];

        const results = [];
        for (const tableId of tableIds) {
            const table = await fromUuid(`Compendium.${tableId}`);
            if (table) {
                const candidates = this._filterTableResults(table, theme);
                const result = candidates[Math.floor(Math.random() * candidates.length)];
                results.push(result.name || result.description);
            }
        }

        return results.join(" ") || "Unnamed Colossus";
    }

    /**
     * Internal: Filter table results by theme priority.
     */
    static _filterTableResults(table, theme) {
        if (!table.results) return [];

        const results = table.results.contents || table.results;

        // Priority 1: Direct theme match
        const matching = results.filter(r => {
            const tags = r.flags?.["fb-cod"]?.tags || [];
            return tags.includes(theme);
        });

        if (matching.length > 0) return matching;

        // Priority 2: Generic (no tags)
        const generic = results.filter(r => {
            const tags = r.flags?.["fb-cod"]?.tags || [];
            return tags.length === 0;
        });

        if (generic.length > 0) return generic;

        // Fallback: All results
        return results;
    }

    /**
     * Internal: Roll for multiple experiences.
     */
    static async _rollExperiences(count = 2, theme) {
        const table = await fromUuid("Compendium.fb-cod.colossal-generator-tables.experiences00000");
        const experiences = {};
        if (table) {
            const candidates = this._filterTableResults(table, theme);

            // Randomly shuffle candidates
            const shuffled = candidates.sort(() => 0.5 - Math.random());
            const selection = shuffled.slice(0, count);

            for (const res of selection) {
                const name = res.name || res.description;
                const id = foundry.utils.randomID();
                experiences[id] = {
                    name: name,
                    value: 2,
                    description: ""
                };
            }
        }
        return experiences;
    }

    /**
     * Internal: Generate procedural features based on segments and archetype.
     */
    /**
     * Internal: Generate procedural features based on segments and archetype.
     */
    static async _generateProceduralFeatures(actor, segments, archetypeId, theme, tier = 1) {
        const featuresTable = await fromUuid("Compendium.fb-cod.colossal-generator-tables.segfeatures00000");
        const attacksTable = await fromUuid("Compendium.fb-cod.colossal-generator-tables.segattacks000000");

        if (!featuresTable || !attacksTable) {
            console.error("fb-cod | Could not find segment tables.");
            return;
        }

        const itemsToCreate = [];
        const seenNames = new Set();

        const combatTypes = ["head", "arm", "leg", "claw", "pincer", "tail", "wing", "tentacle", "forelimb", "hindlimb"];
        const supportTypes = ["torso", "thorax", "abdomen", "carapace", "shell", "antennae"];

        // Filter and shuffle candidates
        const attackCandidates = this._filterTableResults(attacksTable, theme).sort(() => 0.5 - Math.random());
        const featureCandidates = this._filterTableResults(featuresTable, theme).sort(() => 0.5 - Math.random());

        // 1. Iterate Segments for Contextual Assignment
        for (const s of segments) {
            const type = (s.system?.segmentType || s.system?._source?.segmentType || "").toLowerCase();
            const isFatal = s.system?.fatal || s.system?._source?.fatal;
            const isCombat = combatTypes.includes(type);
            const isSupport = supportTypes.includes(type);

            // Determine item count: fatal segments scale with tier
            const count = isFatal ? tier : 1;

            if (isCombat) {
                // Combat Segments: Guaranteed Attack(s)
                let attacksFound = 0;
                for (const res of attackCandidates) {
                    if (attacksFound >= count) break;
                    const fullName = (res.name || "").trim();
                    if (seenNames.has(fullName)) continue;

                    if (this._isTypeAllowed(fullName, type)) {
                        // 1. Try to load from Document (Compendium Item)
                        if (res.documentUuid) {
                            const itemDoc = await fromUuid(res.documentUuid);
                            if (itemDoc) {
                                const itemData = itemDoc.toObject();
                                delete itemData._id;
                                
                                // Ensure system fields for linking are set
                                itemData.system = itemData.system || {};
                                itemData.system.identifier = s.name;
                                itemData.system.originItemType = "fb-cod.colossal-segment";
                                
                                itemsToCreate.push(itemData);
                                seenNames.add(fullName);
                                attacksFound++;
                                continue;
                            }
                        }

                        // 2. Fallback: Procedural Construction from Text
                        const name = fullName.split(" (")[0];
                        itemsToCreate.push({
                            name: name,
                            type: "feature",
                            img: res.img || "icons/svg/d20-grey.svg",
                            system: {
                                description: res.description || "",
                                featureForm: "attack",
                                actions: this._createAttackAction(name, tier),
                                identifier: s.name,
                                originItemType: "fb-cod.colossal-segment"
                            }
                        });
                        seenNames.add(fullName);
                        attacksFound++;
                    }
                }

                // Random 33% chance for extra contextual feature
                if (Math.random() < 0.33) {
                    for (const res of featureCandidates) {
                        const fullName = (res.name || "").trim();
                        if (seenNames.has(fullName)) continue;
                        if (this._isTypeAllowed(fullName, type)) {
                            // 1. Try to load from Document (Compendium Item)
                            if (res.documentUuid) {
                                const itemDoc = await fromUuid(res.documentUuid);
                                if (itemDoc) {
                                    const itemData = itemDoc.toObject();
                                    delete itemData._id;
                                    itemData.system = itemData.system || {};
                                    itemData.system.identifier = s.name;
                                    itemData.system.originItemType = "fb-cod.colossal-segment";
                                    itemsToCreate.push(itemData);
                                    seenNames.add(fullName);
                                    break;
                                }
                            }

                            // 2. Fallback
                            itemsToCreate.push({
                                name: fullName.split(" (")[0],
                                type: "feature",
                                img: res.img || "icons/svg/d20-grey.svg",
                                system: {
                                    description: res.description || "",
                                    featureForm: "passive",
                                    identifier: s.name,
                                    originItemType: "fb-cod.colossal-segment"
                                }
                            });
                            seenNames.add(fullName);
                            break;
                        }
                    }
                }
            } else if (isSupport) {
                // Support Segments: Guaranteed Feature(s)
                let featuresFound = 0;
                for (const res of featureCandidates) {
                    if (featuresFound >= count) break;
                    const fullName = (res.name || "").trim();
                    if (seenNames.has(fullName)) continue;

                    if (this._isTypeAllowed(fullName, type)) {
                        // 1. Try to load from Document (Compendium Item)
                        if (res.documentUuid) {
                            const itemDoc = await fromUuid(res.documentUuid);
                            if (itemDoc) {
                                const itemData = itemDoc.toObject();
                                delete itemData._id;
                                itemData.system = itemData.system || {};
                                itemData.system.identifier = s.name;
                                itemData.system.originItemType = "fb-cod.colossal-segment";
                                itemsToCreate.push(itemData);
                                seenNames.add(fullName);
                                featuresFound++;
                                continue;
                            }
                        }

                        // 2. Fallback
                        itemsToCreate.push({
                            name: fullName.split(" (")[0],
                            type: "feature",
                            img: res.img || "icons/svg/d20-grey.svg",
                            system: {
                                description: res.description || "",
                                featureForm: "passive",
                                identifier: s.name,
                                originItemType: "fb-cod.colossal-segment"
                            }
                        });
                        seenNames.add(fullName);
                        featuresFound++;
                    }
                }
            }
        }

        // 2. Final Core Features: 2 unassigned (generic/fallback)
        let coreFound = 0;
        for (const res of featureCandidates) {
            if (coreFound >= 2) break;
            const fullName = (res.name || "").trim();
            if (seenNames.has(fullName)) continue;

            itemsToCreate.push({
                name: fullName.split(" (")[0],
                type: "feature",
                img: res.img || "icons/svg/d20-grey.svg",
                system: {
                    description: res.description || "",
                    featureForm: "action"
                }
            });
            seenNames.add(fullName);
            coreFound++;
        }

        if (itemsToCreate.length) {
            console.log(`fb-cod | Importing ${itemsToCreate.length} procedural features/attacks:`, itemsToCreate.map(f => `${f.name} -> ${f.system.identifier || 'Core'}`));
            await actor.createEmbeddedDocuments("Item", itemsToCreate);
        }
    }

    /**
     * Internal: Check if a segment type matches an item's type tags.
     */
    static _isTypeAllowed(fullName, segmentType) {
        const match = fullName.match(/\((.*)\)/);
        if (!match) return true; // Generic item
        const allowedTypes = match[1].toLowerCase().split("/").map(t => t.trim());

        // Map synonyms
        const synonyms = {
            "forelimb": ["arm", "leg"],
            "hindlimb": ["leg"],
            "pincer": ["claw", "arm"],
            "shell": ["carapace"],
            "thorax": ["torso"],
            "abdomen": ["torso"]
        };

        const target = segmentType.toLowerCase();
        if (allowedTypes.includes(target)) return true;

        // Check synonyms
        const mapped = synonyms[target] || [];
        return mapped.some(m => allowedTypes.includes(m));
    }

    /**
     * Internal: Create a rich attack action object based on tier.
     */
    static _createAttackAction(name, tier) {
        const id = foundry.utils.randomID();
        const bonus = 1 + tier;
        const diceNum = tier;
        const damageBonus = tier * 6;
        const formula = `${diceNum}d8+${damageBonus}`;

        let range = "veryClose";
        const n = name.toLowerCase();
        if (n.includes("breath") || n.includes("blast") || n.includes("shriek") || n.includes("scream") || n.includes("cloud")) {
            range = "far";
        }

        const iconMap = {
            punch: "icons/skills/melee/strike-fist-white.webp",
            kick: "icons/skills/melee/unarmed-strike-kick-blue.webp",
            bite: "icons/creatures/abilities/mouth-teeth-humanoid-fury-red.webp",
            stomp: "icons/skills/melee/strike-hammer-destructive-orange.webp",
            breath: "icons/magic/fire/projectile-wave-yellow.webp",
            shriek: "icons/magic/air/wind-tornado-cyclone-white.webp",
            scream: "icons/magic/air/wind-tornado-cyclone-white.webp",
            blast: "icons/magic/fire/flame-burning-chain.webp",
            swat: "icons/skills/melee/strike-blade-curved-yellow.webp",
            rend: "icons/skills/melee/strike-blade-claw-red.webp",
            crush: "icons/skills/melee/strike-blade-claw-white.webp",
            smash: "icons/skills/melee/strike-mace-destructive-orange.webp"
        };
        let img = "icons/skills/melee/strike-sword-blood-red.webp";
        for (const [key, value] of Object.entries(iconMap)) {
            if (n.includes(key)) {
                img = value;
                break;
            }
        }

        return {
            [id]: {
                _id: id,
                type: "attack",
                name: name,
                img: img,
                actionType: "action",
                chatDisplay: true,
                range: range,
                roll: {
                    type: "attack",
                    bonus: bonus,
                    advState: "neutral",
                    useDefault: false,
                    diceRolling: {
                        multiplier: "prof",
                        dice: "d6"
                    }
                },
                damage: {
                    parts: [{
                        applyTo: "hitPoints",
                        type: ["physical"],
                        value: {
                            multiplier: "flat",
                            flatMultiplier: 1,
                            dice: "d6",
                            bonus: null,
                            custom: {
                                enabled: true,
                                formula: formula
                            }
                        },
                        resultBased: false,
                        base: false
                    }],
                    includeBase: false,
                    direct: false
                },
                baseAction: false,
                originItem: { type: "itemCollection" }
            }
        };
    }

    /**
     * Internal: Roll for motive and tactics.
     */
    static async _rollMotiveTactics() {
        const table = await fromUuid("Compendium.fb-cod.colossal-generator-tables.motives000000000");
        if (table) {
            const roll = await table.roll();
            return roll.results[0].name || roll.results[0].description;
        }
        return "Unknown Motives";
    }

    /**
     * Internal: Generate and link segments.
     */
    static async _generateSegments(actor, archetype, tier) {
        const segmentsPack = game.packs.get("fb-cod.colossal-segments");
        if (!segmentsPack) return;

        const segmentItems = [];
        let segDefIndex = 0;
        for (const segDef of archetype.segments) {
            const footprint = await this._getFootprint(segmentsPack, segDef.type);

            // Find desired adjacency targets from archetype
            const adjTargets = archetype.adjacency
                .filter(pair => pair.includes(segDef.type))
                .map(pair => pair.find(t => t !== segDef.type))
                .filter(Boolean);

            for (let i = 0; i < segDef.count; i++) {
                const pos = segDef.position ? segDef.position[i] : "";
                const baseName = segDef.name || footprint.name;
                const finalName = pos ? `${baseName} (${pos})` : baseName;

                segmentItems.push({
                    name: finalName,
                    type: "fb-cod.colossal-segment",
                    img: footprint.img,
                    system: foundry.utils.mergeObject(footprint.system || {}, {
                        segmentType: segDef.type,
                        position: pos,
                        fatal: segDef.fatal || false,
                        difficulty: (footprint.system.difficulty || 12) + (tier - 1),
                        hitPoints: {
                            value: (footprint.system.hitPoints?.value || 5) + (tier * 2),
                            max: (footprint.system.hitPoints?.max || 5) + (tier * 2)
                        },
                        footprintId: footprint._id,
                        adjacentSegments: adjTargets,
                        chainGroup: "", // Explicitly clear
                        subgroup: ""    // Explicitly clear
                    })
                });
            }
            segDefIndex++;
        }

        const created = await actor.createEmbeddedDocuments("Item", segmentItems);

        // Link Adjacency using unified utility
        await ColossusImporter.linkSegments(actor);

        return created;
    }


    /**
    * Internal: Automatically group related segments into chains using dynamic identifiers and subgroups.
    */
    static async _assignChains(actor, segments, archetypeId) {
        const updates = [];
        const metadata = CONFIG.FB_COD.chainGroupsMetadata || {};

        // 1. Group segments by their resolved chain group
        const segmentsByGroup = {};

        for (const s of segments) {
            const footprintId = s.system?.footprintId || "";
            const type = (s.system?.segmentType || s.system?._source?.segmentType || "").toLowerCase();
            if (!type) continue;

            const match = Object.entries(metadata).find(([ident, data]) => {
                // For generator, prioritize matching via the specific footprint ID if available
                return (data.categories || []).includes(footprintId) || (data.segmentTypes || []).includes(type);
            });

            const ident = match ? match[0] : "";
            if (!ident) continue;

            if (!segmentsByGroup[ident]) segmentsByGroup[ident] = [];
            segmentsByGroup[ident].push(s);
        }

        // 2. Assign segments in a group to a single chain (subgroup 'a') ONLY if there are multiple segments
        for (const [ident, segmentList] of Object.entries(segmentsByGroup)) {
            if (segmentList.length > 1) {
                for (const s of segmentList) {
                    updates.push({
                        _id: s.id,
                        "system.chainGroup": ident,
                        "system.subgroup": "a"
                    });
                }
            } else if (segmentList.length === 1) {
                // Ensure single segments are explicitly unchained
                const s = segmentList[0];
                updates.push({
                    _id: s.id,
                    "system.chainGroup": "",
                    "system.subgroup": ""
                });
            }
        }

        if (updates.length > 0) {
            console.log(`fb-cod | Assigning ${updates.length} segments to chain groups.`);
            await actor.updateEmbeddedDocuments("Item", updates);
        }
    }

    static async _getFootprint(pack, type) {
        // Index using both top-level and system-level fields for compatibility
        const index = await pack.getIndex({ fields: ["segmentType", "system.segmentType"] });
        let entry = index.find(i => (i.segmentType || i.system?.segmentType) === type);
        if (!entry) entry = index.find(i => i.name.toLowerCase().includes(type));

        if (entry) return pack.getDocument(entry._id);

        return {
            name: type.capitalize(),
            img: "icons/svg/d20-grey.svg",
            system: { segmentType: type, difficulty: 12, hitPoints: { value: 5, max: 5 } }
        };
    }
}
