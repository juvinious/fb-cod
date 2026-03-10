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
            position: { width: 660, height: 766 },
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
                addSegment: async function (event, target) {
                    const SegmentModel = CONFIG.Item.dataModels["fb-cod.colossal-segment"];
                    const choices = SegmentModel.schema.getField("segmentType").choices;

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
                        // Create the item first, then immediately open the FeatureSheet for full editing
                        const [item] = await this.document.createEmbeddedDocuments("Item", [{
                            name: result.name || "New Segment",
                            type: "fb-cod.colossal-segment",
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
                        console.error("Foundryborne Giants | Error creating segment:", err);
                        ui.notifications.error("Failed to create segment.");
                    }
                },
                adjustSegmentHP: async function (event, target) {
                    const segmentId = target.dataset.itemId;
                    const adjustment = parseInt(target.dataset.adjustment) || 0;
                    if (!segmentId || adjustment === 0) return;

                    const segment = this.document.items.get(segmentId);
                    if (!segment) return;

                    const currentHP = segment.system.hp.value;
                    const maxHP = segment.system.hp.max;
                    let newHP = currentHP + adjustment;

                    // Clamp HP between 0 and Max
                    newHP = Math.max(0, Math.min(newHP, maxHP));

                    if (newHP !== currentHP) {
                        await segment.update({ "system.hp.value": newHP });
                    }
                },
                toggleSegmentDestroyed: async function (event, target) {
                    const segmentId = target.dataset.itemId;
                    if (!segmentId) return;

                    const segment = this.document.items.get(segmentId);
                    if (!segment) return;

                    // Toggle the destroyed boolean
                    const isDestroyed = segment.system.destroyed;
                    await segment.update({ "system.destroyed": !isDestroyed });
                },
                toggleSegmentBroken: async function (event, target) {
                    const segmentId = target.dataset.itemId;
                    if (!segmentId) return;

                    const segment = this.document.items.get(segmentId);
                    if (!segment) return;

                    // Toggle the broken boolean
                    const isBroken = segment.system.broken;
                    await segment.update({ "system.broken": !isBroken });
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
                    if (!segment) return;
                    const action = segment.system?.actions?.get(actionId);
                    if (!action) return;

                    // Prepare the config from the action (sets hasRoll, roll data, etc.)
                    const config = action.prepareConfig(event);
                    if (!config) return;

                    // If the action has no roll configured, inject a sensible attack roll default
                    if (!config.hasRoll) {
                        config.roll = {
                            type: 'attack',
                            label: action.name,
                            baseModifiers: [{ label: 'ATK', value: segment.system?.atkModifier ?? 0 }],
                            difficulty: segment.system?.difficulty ?? 12,
                            advantage: 0
                        };
                        config.hasRoll = true;
                    }

                    // Call diceRoll directly — this opens the roll dialog and creates the roll chat card.
                    // We never call action.use(), so action.toChat() is never triggered separately.
                    await this.actor.diceRoll(config);
                },
                /**
                 * Send this specific attack action to chat without rolling.
                 */
                toSegmentChat: async function (event, target) {
                    const { segmentUuid, actionId } = target.dataset;
                    if (!segmentUuid || !actionId) return;
                    const segment = await fromUuid(segmentUuid);
                    if (!segment) return;
                    const action = segment.system?.actions?.get(actionId);
                    if (action?.toChat) return action.toChat();
                },
                toggleCondition: async function (event, target) {
                    const condition = target.dataset.condition;
                    const currentValue = this.document.system.conditionImmunities[condition];
                    await this.document.update({ [`system.conditionImmunities.${condition}`]: !currentValue });
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
                template: "modules/fb-cod/templates/actor/parts/segments.hbs"
            },
            features: {
                template: 'systems/daggerheart/templates/sheets/actors/adversary/features.hbs',
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
            context.features = this.document.system.features.sort((a, b) =>
                a.system.featureForm !== b.system.featureForm
                    ? featureForms.indexOf(a.system.featureForm) - featureForms.indexOf(b.system.featureForm)
                    : a.sort - b.sort
            );

            // Prepare Segments
            console.log("Foundryborne Giants | Preparing context, item types present:", [...new Set(this.document.items.map(i => i.type))]);
            context.segments = this.document.system.segments.sort((a, b) => {
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
            console.log(`Foundryborne Giants | Context segments count: ${context.segments.length}`);

            // Aggregate all attack-type actions from each segment into the sidebar attack list.
            // We store the actual action model instance so inventory-item-compact can call _getLabels.
            context.segmentAttacks = [];
            for (const segment of context.segments) {
                if (!segment.system?.actions) continue;
                for (const action of segment.system.actions) {
                    if (action.type !== 'attack') continue;
                    // Attach segment metadata onto the action for use in the template
                    action._segmentName = segment.name;
                    action._segmentUuid = segment.uuid;
                    context.segmentAttacks.push(action);
                }
            }

            // --- Calculate Colossus Defeated State ---
            context.isDefeated = false;
            const chainGroups = {}; // key: groupName, value: { total: int, destroyed: int }

            for (const segment of context.segments) {
                const sys = segment.system;
                if (!sys) continue;

                // 1. Fatal checked: if any fatal segment is destroyed, the colossus falls.
                if (sys.fatal && sys.destroyed) {
                    context.isDefeated = true;
                    break;
                }

                // 2. Tally chain groups (e.g., Chain A)
                if (sys.chainGroup) {
                    const group = sys.chainGroup.toUpperCase();
                    if (!chainGroups[group]) chainGroups[group] = { total: 0, destroyed: 0 };
                    chainGroups[group].total++;
                    if (sys.destroyed) chainGroups[group].destroyed++;
                }
            }

            // 3. Chain checked: if a chain group has all its segments destroyed, the colossus falls.
            if (!context.isDefeated) {
                for (const group of Object.values(chainGroups)) {
                    if (group.total > 0 && group.total === group.destroyed) {
                        context.isDefeated = true;
                        break;
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
