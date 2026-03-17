/**
 * Custom sheet for Colossal Segment items.
 * Extends the native Daggerheart FeatureSheet but overrides the header and settings
 * templates to display segment-specific fields from the Colossus of the Drylands format.
 *
 * @returns {typeof DHBaseItemSheet}
 */
export function setupColossalSegmentSheet() {
    // Grab the native FeatureSheet from the Daggerheart system API
    const FeatureSheet = game.system.api?.applications?.sheets?.items?.Feature;
    if (!FeatureSheet) {
        console.error("fb-cod | Cannot find native FeatureSheet for segment sheet inheritance.");
        return null;
    }

    return class ColossalSegmentSheet extends FeatureSheet {
        /** @inheritdoc */
        static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
            classes: ['colossal-segment'],
            position: { width: 650 },
            actions: {
                /**
                 * Override addNewItem to show the 2-button dialog (Create vs Browse)
                 * even if we are not technically a 'character' actor.
                 */
                addNewItem: async function (event, target) {
                    const createChoice = await foundry.applications.api.DialogV2.wait({
                        window: { title: "Add Feature" },
                        classes: ['dh-style', 'two-big-buttons'],
                        buttons: [
                            { action: 'create', label: 'Create Item', icon: 'fa-solid fa-plus' },
                            { action: 'browse', label: 'Browse Compendium', icon: 'fa-solid fa-book' }
                        ]
                    });

                    if (!createChoice) return;
                    if (createChoice === 'browse') return this.constructor.DEFAULT_OPTIONS.actions.browseItem.call(this, event, target);
                    return this.constructor.DEFAULT_OPTIONS.actions.createDoc.call(this, event, target);
                },

                /**
                 * Create a new document on the parent Actor and link it to this segment.
                 */
                createDoc: async function (event, target) {
                    const { type, documentClass } = target.dataset;

                    // Handle ActiveEffect creation
                    if (documentClass === "ActiveEffect" || type === "effect") {
                        const cls = getDocumentClass("ActiveEffect");
                        return await cls.create({
                            name: cls.defaultName({ type: "base", parent: this.document }),
                            icon: "icons/svg/aura.svg",
                            origin: this.document.uuid
                        }, { parent: this.document, renderSheet: !event.shiftKey });
                    }

                    const actor = this.document.parent;
                    if (!actor) return ui.notifications.warn("fb-cod | Cannot add items to a segment not on an actor.");

                    const isAttack = type === 'feature-attack' || target.dataset.featureForm === 'attack';
                    const isSupport = type === 'feature-support';
                    const itemType = type.startsWith('feature') ? 'feature' : type;

                    const cls = getDocumentClass("Item");
                    const data = {
                        name: cls.defaultName({ type: itemType, parent: actor }),
                        type: itemType,
                        system: {
                            identifier: this.document.name,
                            originItemType: "fb-cod.colossal-segment",
                            featureForm: isAttack ? 'attack' : (isSupport ? 'passive' : 'action')
                        }
                    };

                    return await cls.create(data, { parent: actor, renderSheet: !event.shiftKey });
                },

                /**
                 * Open the compendium browser for features/attacks.
                 */
                browseItem: async function (event, target) {
                    const type = target.dataset.type || 'feature';
                    const isAttack = type === 'feature-attack';
                    const isSupport = type === 'feature-support';
                    const presets = {
                        render: {
                            noFolder: true
                        },
                        folder: isAttack ? 'colossalAttacks' : (isSupport ? 'colossalFeatures' : 'features')
                    };

                    if (isAttack) {
                        presets.filter = {
                            "system.featureForm": { key: "system.featureForm", value: "attack" },
                            "pack": { key: "pack", value: "fb-cod.colossal-attacks" }
                        };
                    } else {
                        presets.folder = 'colossalFeatures';
                        presets.filter = {
                            "system.featureForm": { key: "system.featureForm", value: "passive" },
                            "pack": { key: "pack", value: "fb-cod.colossal-features" }
                        };
                    }

                    ui.compendiumBrowser.open(presets);
                }
            },
            contextMenus: [
                {
                    handler: function (target) {
                        return this._getContextMenuCommonOptions({ usable: true, toChat: true, deletable: true });
                    },
                    selector: '[data-item-uuid][data-type^="feature"]',
                    options: {
                        parentClassHooks: false,
                        fixed: true
                    }
                }
            ]
        }, { inplace: false });

        /**
         * Related documents to cause a rerender (e.g. the parent actor).
         * @inheritdoc
         */
        get relatedDocs() {
            return [this.document.parent].filter(d => d);
        }

        /**
         * Override PARTS to replace the header and settings with our custom templates,
         * while keeping Description, Actions, and Effects tabs from the native FeatureSheet.
         * @inheritdoc
         */
        static PARTS = {
            ...super.PARTS,
            // Override the header to show "Colossal Segment" instead of "Passive Feature"
            header: {
                template: 'modules/fb-cod/templates/items/segment/header.hbs'
            },
            // Override settings with our segment-specific fields
            settings: {
                template: 'modules/fb-cod/templates/items/segment/settings.hbs'
            },
            // Segment attacks template
            attacks: {
                template: 'modules/fb-cod/templates/items/segment/attacks.hbs',
                scrollable: ['.attacks']
            },
            // Override actions with our segment-features template
            actions: {
                template: 'modules/fb-cod/templates/items/segment/features.hbs',
                scrollable: ['.actions']

            }
        };

        /**
         * Re-order tabs so Features (Actions) is first and Description is last.
         * @inheritdoc
         */
        static TABS = {
            primary: {
                tabs: [
                    { id: 'settings', label: 'DAGGERHEART.GENERAL.Tabs.settings' },
                    { id: 'attacks', label: 'DAGGERHEART.GENERAL.Tabs.attack' },
                    { id: 'actions', label: 'DAGGERHEART.GENERAL.Tabs.features' },
                    { id: 'effects', label: 'DAGGERHEART.GENERAL.Tabs.effects' },
                    { id: 'description', label: 'DAGGERHEART.GENERAL.Tabs.description' }
                ],
                initial: 'settings',
                labelPrefix: ''
            }
        };

        /** @inheritdoc */
        async _prepareContext(options) {
            const context = await super._prepareContext(options);

            // Provide choices for the dropdowns from the global config (source of truth from compendiums)
            context.segmentTypeChoices = CONFIG.FB_COD.segmentTypes || {};
            context.chainGroupChoices = CONFIG.FB_COD.chainGroups || {};

            // Associate features from the actor by identifier
            if (this.document.parent) {
                const allSegmentItems = this.document.parent.items.filter(i =>
                    i.type === 'feature' && i.system.identifier === this.document.name
                );

                // Helper to create a proxy view for the inventory-items partial
                const buildActionView = (feature) => {
                    const customProperties = {
                        actionType: feature.system.featureForm,
                        _segmentName: this.document.name,
                        _segmentUuid: this.document.uuid,
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

                    return new Proxy(feature, {
                        get(target, prop) {
                            if (prop in customProperties) {
                                return customProperties[prop];
                            }
                            const value = target[prop];
                            return typeof value === 'function' ? value.bind(target) : value;
                        }
                    });
                };

                // Separate attacks from other features (reactions, passives, normal actions)
                context.segmentAttacks = allSegmentItems.filter(i => {
                    const actionsArr = i.system?.actions?.values ? Array.from(i.system.actions.values()) : [];
                    return i.system.featureForm === 'attack' || actionsArr.some(a => a.type === 'attack');
                }).map(buildActionView);

                context.segmentFeatures = allSegmentItems.filter(i => {
                    const actionsArr = i.system?.actions?.values ? Array.from(i.system.actions.values()) : [];
                    const isAttack = i.system.featureForm === 'attack' || actionsArr.some(a => a.type === 'attack');
                    return !isAttack;
                }).map(buildActionView);

                // Adjacency Candidates (all other segments on the actor)
                const currentId = this.document.id;
                context.neighborCandidates = this.document.parent.items
                    .filter(i => i.type === 'fb-cod.colossal-segment' && i.id !== currentId)
                    .map(i => ({
                        id: i.id,
                        name: i.name,
                        checked: (this.document.system.adjacentSegments || []).includes(i.id)
                    }));

                // Keep associatedFeatures for backward compatibility in templates if needed
                context.associatedFeatures = allSegmentItems;
            } else {
                context.segmentAttacks = [];
                context.segmentFeatures = [];
                context.neighborCandidates = [];
                context.associatedFeatures = [];
            }

            // Wrap context.document to masquerade as an 'adversary' so Handlebars partials render featureForm tags
            context.document = new Proxy(this.document, {
                get(target, prop, receiver) {
                    if (prop === 'type') return 'adversary';
                    return Reflect.get(target, prop, receiver);
                }
            });

            return context;
        }

        /** @inheritdoc */
        async _onDrop(event) {
            event.preventDefault();
            event.stopPropagation();

            const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
            if (!data || data.type !== "Item") return super._onDrop(event);

            const actor = this.document.parent;
            if (!actor) return ui.notifications.warn("fb-cod | Cannot drop items onto a segment not on an actor.");

            const item = await fromUuid(data.uuid);
            if (!item || item.type !== "feature") return super._onDrop(event);

            // If it's already on the actor, we might just be re-linking it?
            // Actually, if it's already on the actor, we just update its identifier.
            if (item.parent === actor) {
                return await item.update({
                    "system.identifier": this.document.name,
                    "system.originItemType": "fb-cod.colossal-segment"
                });
            }

            // If it's from a compendium or another actor, create a copy
            const itemData = item.toObject();
            delete itemData._id;
            itemData.system = itemData.system || {};
            itemData.system.identifier = this.document.name;
            itemData.system.originItemType = "fb-cod.colossal-segment";

            return await Item.create(itemData, { parent: actor });
        }
    };
}
