/**
 * Dynamically creates the ColossusSheet class by extending Daggerheart's base actor sheet.
 * This allows us to re-compose the sheet using system partials while maintaining full control.
 * @returns {typeof ActorSheetV2}
 */
export function setupColossusSheet() {
    const api = game.system.api;
    const DHBaseActorSheet = api.applications.sheets.api.DHBaseActorSheet;

    return class ColossusSheet extends DHBaseActorSheet {
        /** @override */
        static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
            classes: ["colossus", "dh-style", "adversary"],
            position: { width: 1000, height: 766 },
            window: {
                resizable: true,
                controls: [
                    {
                        icon: 'fa-solid fa-signature',
                        label: 'DAGGERHEART.UI.Tooltip.configureAttribution',
                        action: 'editAttribution'
                    }
                ]
            },
            actions: {
                toggleHitPoints: async function (_, button) {
                    const hitPointsValue = Number.parseInt(button.dataset.value);
                    const newValue = this.document.system.resources.hitPoints.value >= hitPointsValue ? hitPointsValue - 1 : hitPointsValue;
                    await this.document.update({ 'system.resources.hitPoints.value': newValue });
                },
                toggleStress: async function (_, button) {
                    const StressValue = Number.parseInt(button.dataset.value);
                    const newValue = this.document.system.resources.stress.value >= StressValue ? StressValue - 1 : StressValue;
                    await this.document.update({ 'system.resources.stress.value': newValue });
                },
                reactionRoll: function (event) {
                    const config = {
                        event,
                        title: `Reaction Roll: ${this.actor.name}`,
                        headerTitle: 'Adversary Reaction Roll',
                        roll: { type: 'trait' },
                        actionType: 'reaction',
                        hasRoll: true,
                        data: this.actor.getRollData()
                    };
                    this.actor.diceRoll(config);
                },
                createDoc: async function (event, target) {
                    let { segmentName, type } = target.dataset;

                    if (!segmentName) {
                        const segmentGroup = target.closest('.segment-feature-group');
                        if (segmentGroup && segmentGroup.dataset.segmentName) {
                            segmentName = segmentGroup.dataset.segmentName;
                        } else {
                            const segmentItem = target.closest('.segment-item');
                            if (segmentItem) {
                                const segment = this.document.items.get(segmentItem.dataset.itemId);
                                if (segment) segmentName = segment.name;
                            }
                        }
                    }

                    // Call the original createDoc from DHBaseActorSheet (via DHBaseActorSheet.DEFAULT_OPTIONS)
                    const doc = await DHBaseActorSheet.DEFAULT_OPTIONS.actions.createDoc.call(this, event, target);

                    // If it was a feature created from a segment's section, link it
                    if (segmentName && doc && type === 'feature') {
                        await doc.update({
                            "system.identifier": segmentName,
                            "system.originItemType": "fb-cod.colossal-segment"
                        });
                    }
                    return doc;
                },
                addSegment: async function (event, target) {
                    /** 
                     * Fetch the segment types from the DataModel schema. 
                     * This ensures the dropdown matches the valid types defined in the system.
                     * @type {typeof ColossalSegmentDataModel}
                     */
                    const SegmentModel = CONFIG.Item.dataModels["fb-cod.colossal-segment"];
                    const field = SegmentModel.schema.getField("segmentType");
                    const choices = typeof field.choices === "function" ? field.choices() : field.choices;

                    const content = `
                        <div class="daggerheart dh-style">
                            <div class="form-group">
                                <label>Segment Name</label>
                                <div class="form-fields">
                                    <input type="text" name="name" value="New Segment" placeholder="Segment Name" />
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Segment Type</label>
                                <div class="form-fields">
                                    <select name="segmentType">
                                        ${Object.entries(choices).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}
                                    </select>
                                </div>
                            </div>
                        </div>
                    `;

                    const result = await foundry.applications.api.DialogV2.input({
                        window: { title: "Create Colossal Segment" },
                        content: content,
                        classes: ["daggerheart", "dh-style"],
                        ok: {
                            label: "Create",
                            callback: (event, button, dialog) => {
                                const fd = new foundry.applications.ux.FormDataExtended(button.form);
                                return fd.object;
                            }
                        }
                    });

                    if (!result) return;

                    try {
                        // Dynamically retrieve the default icon from the colossal-segments pack index
                        // This avoids hardcoding paths and ensures consistency with the compendium.
                        const pack = game.packs.get("fb-cod.colossal-segments");
                        let img = "icons/svg/item-bag.svg"; // Default fallback
                        if (pack) {
                            const index = await pack.getIndex({ fields: ["system.segmentType"] });
                            const entry = index.find(i => i.system?.segmentType === result.segmentType) ||
                                index.find(i => i.name.toLowerCase().includes(result.segmentType));
                            if (entry) img = entry.img;
                        }

                        // Create the item first, then immediately open the FeatureSheet for full editing
                        const [item] = await this.document.createEmbeddedDocuments("Item", [{
                            name: result.name || "New Segment",
                            type: "fb-cod.colossal-segment",
                            img: img,
                            system: {
                                segmentType: result.segmentType,
                                difficulty: 12,
                                // resource.type is required by BaseDataItem's schema
                                resource: { type: 'simple', value: 10, max: 10 }
                            }
                        }]);
                        // Open native FeatureSheet immediately so user can fill in description, actions, etc.
                        if (item) item.sheet.render({ force: true });
                    } catch (err) {
                        console.error("fb-cod | Error creating segment:", err);
                        ui.notifications.error("Failed to create segment.");
                    }
                },
                adjustSegmentHP: async function (event, target) {
                    const segmentId = target.dataset.itemId;
                    const adjustment = parseInt(target.dataset.adjustment) || 0;
                    if (!segmentId || adjustment === 0) return;

                    const segment = this.document.items.get(segmentId);
                    if (!segment) return;

                    const { value, max } = segment.system.hitPoints;
                    let newHP = value + adjustment;

                    // Clamp HP between 0 and Max
                    newHP = Math.max(0, Math.min(newHP, max));

                    if (newHP !== value) {
                        const updateData = { "system.hitPoints.value": newHP };
                        // Automatically set/unset destroyed based on HP
                        if (newHP === 0) updateData["system.destroyed"] = true;
                        else if (value === 0 && newHP > 0) updateData["system.destroyed"] = false;

                        await segment.update(updateData);
                    }
                },
                toggleSegmentDestroyed: async function (event, target) {
                    const segmentId = target.dataset.itemId;
                    if (!segmentId) return;

                    const segment = this.document.items.get(segmentId);
                    if (!segment) return;

                    // Toggle the destroyed boolean
                    const isDestroyed = segment.system.destroyed;
                    const updateData = { "system.destroyed": !isDestroyed };

                    // If restoring, ensure HP is at least 1
                    if (isDestroyed && segment.system.hitPoints.value === 0) {
                        updateData["system.hitPoints.value"] = 1;
                    }

                    await segment.update(updateData);
                },
                toggleSegmentBroken: async function (event, target) {
                    const segmentId = target.dataset.itemId;
                    if (!segmentId) return;
                    const segment = this.document.items.get(segmentId);
                    if (!segment) return;
                    await segment.update({ "system.broken": !segment.system.broken });
                },
                toggleSegmentCollapsed: async function (event, target) {
                    const segmentId = target.dataset.itemId;
                    if (!segmentId) return;
                    const segment = this.document.items.get(segmentId);
                    if (!segment) return;
                    await segment.update({ "system.collapsed": !segment.system.collapsed });
                },
                /**
                 * Roll a segment attack directly using actor.diceRoll() rather than action.use().
                 * This bypasses the automatic toChat() call that fires at the end of use(),
                 * so only the roll result chat card (from diceRoll()) appears.
                 * If the attack action has no roll configured, we inject a default attack roll config.
                 */
                rollSegmentAttack: async function (event, target) {
                    const { segmentUuid, actionId } = target.dataset;
                    if (!segmentUuid || !actionId) return;

                    const segment = await fromUuid(segmentUuid);
                    const featureItem = this.actor.items.get(actionId);

                    if (!segment || !featureItem) {
                        ui.notifications.warn("fb-cod | Missing segment or feature.");
                        return;
                    }

                    // Enforce mechanical restrictions
                    if (!segment.system.canUseFeature(featureItem.system.featureForm)) {
                        const state = segment.system.destroyed ? "Destroyed" : "Broken";
                        ui.notifications.warn(`fb-cod | Cannot use ${featureItem.name}: Segment is ${state}.`);
                        return;
                    }

                    // Native Daggerheart trigger
                    return featureItem.use(event);
                },
                /**
                 * Send this specific attack/reaction to chat without rolling.
                 */
                toSegmentChat: async function (event, target) {
                    const { segmentUuid, actionId } = target.dataset;
                    if (!segmentUuid || !actionId) return;

                    const segment = await fromUuid(segmentUuid);
                    const featureItem = this.actor.items.get(actionId);

                    if (!segment || !featureItem) return;

                    // Enforce mechanical restrictions
                    if (!segment.system.canUseFeature(featureItem.system.featureForm)) {
                        const state = segment.system.destroyed ? "Destroyed" : "Broken";
                        ui.notifications.warn(`fb-cod | Cannot display ${featureItem.name}: Segment is ${state}.`);
                        return;
                    }

                    if (featureItem.toChat) return featureItem.toChat();
                },
                toggleCondition: async function (event, target) {
                    const condition = target.dataset.condition;
                    const currentValue = this.document.system.conditionImmunities[condition];
                    await this.document.update({ [`system.conditionImmunities.${condition}`]: !currentValue });
                },
                editDoc: async function (event, target) {
                    const uuid = target.dataset.itemUuid;
                    if (!uuid) return;
                    const doc = await fromUuid(uuid);
                    if (doc) doc.sheet.render(true);
                },
                deleteDoc: async function (event, target) {
                    const uuid = target.dataset.itemUuid;
                    if (!uuid) return;
                    const doc = await fromUuid(uuid);
                    if (doc) doc.deleteDialog();
                }

            }
        }, { inplace: false });

        /** @override */
        static PARTS = {
            sidebar: {
                template: 'modules/fb-cod/templates/actor/parts/colossus-sidebar.hbs',
                scrollable: ['.shortcut-items-section']
            },
            header: {
                template: 'systems/daggerheart/templates/sheets/actors/adversary/header.hbs'
            },
            segments: {
                template: "modules/fb-cod/templates/actor/parts/segments.hbs",
                scrollable: ['.segments-list-container']
            },
            features: {
                template: 'modules/fb-cod/templates/actor/parts/colossus-features.hbs',
                scrollable: ['.feature-section']
            },
            effects: {
                template: 'systems/daggerheart/templates/sheets/actors/adversary/effects.hbs',
                scrollable: ['.effects-sections']
            },
            notes: {
                template: 'systems/daggerheart/templates/sheets/actors/adversary/notes.hbs'
            }
        };

        /** @override */
        static TABS = {
            primary: {
                tabs: [
                    { id: 'segments', label: 'Segments', icon: 'fas fa-puzzle-piece' },
                    { id: 'features', label: 'Features' },
                    { id: 'effects', label: 'Effects' },
                    { id: 'notes', label: 'Notes' }
                ],
                initial: 'segments',
                labelPrefix: 'DAGGERHEART.GENERAL.Tabs'
            }
        };

        /** @override */
        async _prepareContext(options) {
            const context = await super._prepareContext(options);

            // Replicate AdversarySheet specific context
            context.systemFields.attack.fields = this.document.system.attack.schema.fields;
            context.resources = Object.keys(this.document.system.resources).reduce((acc, key) => {
                acc[key] = this.document.system.resources[key];
                return acc;
            }, {});

            const maxResource = Math.max(context.resources.hitPoints.max, context.resources.stress.max);
            context.resources.hitPoints.emptyPips = context.resources.hitPoints.max < maxResource ? maxResource - context.resources.hitPoints.max : 0;
            context.resources.stress.emptyPips = context.resources.stress.max < maxResource ? maxResource - context.resources.stress.max : 0;

            const featureForms = ['passive', 'action', 'reaction'];
            const allFeatures = this.document.items.filter(i => i.type === 'feature').sort((a, b) => {
                const aForm = a.system?.featureForm || 'passive';
                const bForm = b.system?.featureForm || 'passive';
                if (aForm !== bForm) return featureForms.indexOf(aForm) - featureForms.indexOf(bForm);
                return (a.sort || 0) - (b.sort || 0);
            });

            // Filter out segment features from the main actor's list
            context.features = allFeatures.filter(f => {
                const sys = f.system;
                return !(sys?.originItemType === 'fb-cod.colossal-segment' && !!sys?.identifier);
            });
            console.log("fb-cod | Total features found:", allFeatures.length, "Core features count:", context.features.length);

            // Wrap context.document in a Proxy so Handlebars inventory-items partial
            // recognizes it as 'adversary' and renders the Action/Reaction/Passive tags.
            context.document = new Proxy(this.document, {
                get(target, prop, receiver) {
                    if (prop === 'type') return 'adversary';
                    return Reflect.get(target, prop, receiver);
                }
            });

            // Prepare Segments
            console.log("fb-cod | Preparing context, item types present:", [...new Set(this.document.items.map(i => i.type))]);

            // First sort segments by anatomical order
            const sortedSegments = this.document.system.segments.sort((a, b) => {
                const order = {
                    'head': 1, 'neck': 2, 'torso': 3, 'core': 3,
                    'arm-left': 4, 'arm-right': 5,
                    'foreleg': 6, 'hindleg': 7,
                    'leg-left': 6, 'leg-right': 7,
                    'wing-left': 8, 'wing-right': 9,
                    'body': 10, 'tail': 11, 'claw': 12, 'other': 99
                };
                return (order[a.system.segmentType] || 99) - (order[b.system.segmentType] || 99);
            });
            console.log(`fb-cod | Context segments count: ${sortedSegments.length}`);

            context.isDefeated = false;
            context.segmentGroups = {}; // key: groupName, value: { name, segments: [], isBroken: boolean }

            // Build segment Feature Groups for the main sheet Features tab
            context.segmentFeatureGroups = [];
            for (const segment of sortedSegments) {
                const segmentFeatures = allFeatures.filter(f =>
                    f.system?.originItemType === 'fb-cod.colossal-segment' &&
                    f.system?.identifier === segment.name
                );

                if (segmentFeatures.length > 0) {
                    context.segmentFeatureGroups.push({
                        segmentName: segment.name,
                        label: `${segment.name} Features`,
                        features: segmentFeatures
                    });
                }
            }

            // Group segments
            context.isDefeated = sortedSegments.length > 0 && sortedSegments.every(s => s.system.destroyed);

            for (const segment of sortedSegments) {
                const sys = segment.system;
                if (!sys) continue;

                // Resolve chain group metadata
                const groupMetadata = (CONFIG.FB_COD.chainGroupsMetadata || {})[sys.chainGroup];
                const groupLabel = groupMetadata?.name || sys.chainGroup;
                const subgroupLabel = sys.subgroup ? ` (${sys.subgroup.toUpperCase()})` : "";

                const groupKey = sys.chainGroup ? `${sys.chainGroup}-${sys.subgroup}` : "core";
                const displayHeader = sys.chainGroup ? `Chain ${groupLabel}${subgroupLabel}` : "Core Segments";

                if (!context.segmentGroups[groupKey]) {
                    context.segmentGroups[groupKey] = {
                        name: displayHeader,
                        segments: [],
                        total: 0,
                        destroyed: 0,
                        isChainDefeated: false,
                        fatal: groupMetadata ? groupMetadata.fatal : (sys.chainGroup ? true : false)
                    };
                }

                context.segmentGroups[groupKey].segments.push(segment);
                context.segmentGroups[groupKey].total++;

                // Pre-calculate tags for rendering
                segment.computedTags = segment.system._getTags();

                if (sys.destroyed) {
                    context.segmentGroups[groupKey].destroyed++;
                    if (sys.fatal) context.isDefeated = true; // Any fatal segment destroyed kills colossus
                }
            }

            // Calculate Chain Defeated status
            for (const group of Object.values(context.segmentGroups)) {
                if (group.total > 0 && group.total === group.destroyed) {
                    group.isChainDefeated = true;
                    if (group.fatal) {
                        context.isDefeated = true; // Fatal chain fully destroyed kills colossus
                    }
                }
            }

            context.hasSegments = sortedSegments.length > 0;

            // Gather all nested actions for the sidebar
            context.segmentAttacks = [];
            context.segmentReactions = [];

            for (const segment of sortedSegments) {
                // Features are not embedded inside the Segment document, they are separate items on the main Actor.
                // We must find any feature whose identifier matches this segment's name.
                const allActorFeatures = this.document.items.filter(i => i.type === 'feature');
                const segmentFeatures = allActorFeatures.filter(f =>
                    f.system?.originItemType === 'fb-cod.colossal-segment' &&
                    f.system?.identifier === segment.name
                );

                for (const feature of segmentFeatures) {
                    if (!feature.system) continue;

                    // The feature itself is the action in Daggerheart.
                    // We map the feature document so it can be rolled directly from the sidebar.
                    const customProperties = {
                        actionType: feature.system.featureForm,
                        _segmentName: segment.name,
                        _segmentUuid: segment.uuid,
                        _getTags: () => {
                            const tags = [];
                            if (feature.system?.actions) {
                                const actionsArr = feature.system.actions.values ? Array.from(feature.system.actions.values()) : [];
                                for (const a of actionsArr) {
                                    if (a._getTags) tags.push(...a._getTags());
                                }
                            }
                            return tags;
                        },
                        _getLabels: () => {
                            // Extract relevant UI badges to show (e.g. passive, reaction)
                            const labels = [];

                            // 1. Fetch native actions (e.g. Attack Range & Damage)
                            if (feature.system?.actions) {
                                const actionsArr = feature.system.actions.values ? Array.from(feature.system.actions.values()) : [];
                                for (const a of actionsArr) {
                                    if (a._getLabels) labels.push(...a._getLabels());
                                }
                            }

                            // 2. Fallbacks
                            if (labels.length === 0 && feature.system.featureForm) {
                                const formPath = feature.system.featureForm.toLowerCase();
                                labels.push(game.i18n.localize(`DAGGERHEART.CONFIG.FeatureForm.${formPath}`));
                            }

                            // Add action cost if present
                            if (feature.system.actionCost) {
                                labels.push(`${feature.system.actionCost} Action(s)`);
                            }
                            return labels;
                        }
                    };

                    const actionView = new Proxy(feature, {
                        get(target, prop) {
                            if (prop in customProperties) {
                                return customProperties[prop];
                            }
                            // Fallback to original property
                            const value = target[prop];
                            return typeof value === 'function' ? value.bind(target) : value;
                        }
                    });

                    const form = feature.system.featureForm?.toLowerCase() || '';

                    // Action forms might be attacks if they have an attack roll, or just explicit 'action'/'attack'
                    // For now, any 'action', 'attack', or combat-capable feature goes to Attacks.
                    const actionsArr = feature.system?.actions?.values ? Array.from(feature.system.actions.values()) : [];
                    const isAttack = form === 'attack' || actionsArr.some(a => a.type === 'attack');

                    if (isAttack) {
                        context.segmentAttacks.push(actionView);
                    } else if (form === 'reaction') {
                        context.segmentReactions.push(actionView);
                    } else if (form === 'action') {
                        // Regular non-attack actions could go to an explicit list if needed,
                        // but for now, we'll keep the sidebar focused on Attacks & Reactions.
                    }
                }
            }

            // Condition Immunities
            context.conditionImmunities = this.document.system.conditionImmunities;

            return context;
        }

        /** @override */
        async _preparePartContext(partId, context, options) {
            context = await super._preparePartContext(partId, context, options);
            switch (partId) {
                case 'header':
                    const { system } = this.document;
                    const { TextEditor } = foundry.applications.ux;
                    context.description = await TextEditor.implementation.enrichHTML(system.description, {
                        secrets: this.document.isOwner,
                        relativeTo: this.document
                    });
                    const adversaryTypes = CONFIG.DH.ACTOR.allAdversaryTypes();
                    context.adversaryType = game.i18n.localize(adversaryTypes[this.document.system.type].label);
                    break;
                case 'notes':
                    await this._prepareNotesContext(context, options);
                    break;
            }
            return context;
        }

        /**
         * Prepare render context for the Notes part (Replicated from AdversarySheet)
         */
        async _prepareNotesContext(context, _options) {
            const { system } = this.document;
            const { TextEditor } = foundry.applications.ux;
            const paths = { notes: 'notes' };
            for (const [key, path] of Object.entries(paths)) {
                const value = foundry.utils.getProperty(system, path);
                context[key] = {
                    field: system.schema.getField(path),
                    value,
                    enriched: await TextEditor.implementation.enrichHTML(value, {
                        secrets: this.document.isOwner,
                        relativeTo: this.document
                    })
                };
            }
        }

        /** @override */
        _attachPartListeners(partId, htmlElement, options) {
            super._attachPartListeners(partId, htmlElement, options);

            // Sync inventory item resource changes
            htmlElement.querySelectorAll('.inventory-item-resource').forEach(element => {
                element.addEventListener('change', async (event) => {
                    const item = await game.system.api.helpers.utils.getDocFromElement(event.currentTarget);
                    if (!item) return;
                    const max = event.currentTarget.max ? Number(event.currentTarget.max) : null;
                    const value = max ? Math.clamp(Number(event.currentTarget.value), 0, max) : event.currentTarget.value;
                    await item.update({ 'system.resource.value': value });
                    this.render();
                });
                element.addEventListener('click', e => e.stopPropagation());
            });
        }
    };
}
