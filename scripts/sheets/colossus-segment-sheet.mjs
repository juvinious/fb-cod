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
            position: { width: 650 }
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
            }
        };

        /** @inheritdoc */
        async _prepareContext(options) {
            const context = await super._prepareContext(options);

            // Provide choices for the segment type dropdown
            context.segmentTypeChoices = this.document.system.schema.getField('segmentType').choices;

            return context;
        }
    };
}
