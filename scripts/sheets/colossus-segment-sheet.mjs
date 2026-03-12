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
                createDoc: async function (event, target) {
                    const segmentName = this.document.name;
                    const { type } = target.dataset;

                    if (!this.document.parent) return ui.notifications.warn("fb-cod | Cannot add feature to a segment that is not on an actor.");

                    // Call the original createDoc from DHBaseActorSheet (via FeatureSheet.DEFAULT_OPTIONS)
                    const doc = await FeatureSheet.DEFAULT_OPTIONS.actions.createDoc.call(this, event, target);

                    // Link it to this segment
                    if (doc && type === 'feature') {
                        await doc.update({
                            "system.identifier": segmentName,
                            "system.originItemType": "fb-cod.colossal-segment"
                        });
                    }
                    return doc;
                }
            }
        }, { inplace: false });

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

            // Provide choices for the dropdowns
            context.segmentTypeChoices = this.document.system.schema.getField('segmentType').choices;
            context.chainGroupChoices = this.document.system.schema.getField('chainGroup').choices;

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
    };
}
