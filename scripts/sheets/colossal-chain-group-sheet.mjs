/**
 * Custom sheet for Colossal Chain Group items.
 * @returns {typeof DHBaseItemSheet}
 */
export function setupColossalChainGroupSheet() {
    const FeatureSheet = game.system.api?.applications?.sheets?.items?.Feature;
    if (!FeatureSheet) {
        console.error("fb-cod | Cannot find native FeatureSheet for chain group sheet inheritance.");
        return null;
    }

    return class ColossalChainGroupSheet extends FeatureSheet {
        /** @inheritdoc */
        static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
            classes: ['colossal-chain-group'],
            position: { width: 500, height: 'auto' }
        }, { inplace: false });

        /** @inheritdoc */
        static PARTS = {
            ...super.PARTS,
            header: {
                template: 'modules/fb-cod/templates/items/chain-group/header.hbs'
            },
            settings: {
                template: 'modules/fb-cod/templates/items/chain-group/settings.hbs'
            }
        };

        /** @inheritdoc */
        static TABS = {
            primary: {
                tabs: [
                    { id: 'settings', label: 'DAGGERHEART.GENERAL.Tabs.settings' },
                    { id: 'description', label: 'DAGGERHEART.GENERAL.Tabs.description' }
                ],
                initial: 'settings'
            }
        };

        /** @inheritdoc */
        async _prepareContext(options) {
            const context = await super._prepareContext(options);
            
            // Available segment types for the segmentTypes selection
            context.segmentTypeChoices = CONFIG.FB_COD.segmentTypes || {};
            
            // Map segmentTypes to useful objects for the template
            context.segmentTypesList = Object.entries(context.segmentTypeChoices).map(([id, name]) => ({
                id,
                name,
                selected: (this.document.system.segmentTypes || []).includes(id)
            }));

            return context;
        }
    };
}
