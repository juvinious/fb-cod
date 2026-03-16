/**
 * Setup the Colossal Segment Data Model by extending Daggerheart's Feature model.
 * This allows us to use the system's native ActionField, ActionsField, and resource handling.
 * @returns {typeof foundry.abstract.TypeDataModel}
 */
export function setupColossalSegmentModel() {
    console.log("fb-cod | setupColossalSegmentModel called");

    // Use DHFeature as a reference for fields, but extend BaseDataItem for stability
    const FeatureModel = game.system.api?.models?.items?.DHFeature || CONFIG.Item.dataModels.feature;
    const BaseDataItem = game.system.api?.models?.items?.BaseDataItem || Object.getPrototypeOf(FeatureModel);

    console.log("fb-cod | BaseDataItem found:", !!BaseDataItem);

    if (!BaseDataItem) {
        console.error("fb-cod | Could not find BaseDataItem! CONFIG.Item.dataModels keys:", Object.keys(CONFIG.Item.dataModels));
        return null;
    }

    return class ColossalSegmentDataModel extends BaseDataItem {
        /** @type {ItemDataModelMetadata} */
        static get metadata() {
            return foundry.utils.mergeObject(super.metadata, {
                label: 'Colossal Segment',
                type: 'fb-cod.colossal-segment',
                hasDescription: true,
                hasResource: false, // Reverting to custom hitPoints
                hasActions: true    // This triggers BaseDataItem to add ActionsField
            });
        }

        /** @type {ItemDataModelMetadata} */
        get metadata() {
            return this.constructor.metadata;
        }

        static defineSchema() {
            const fields = foundry.data.fields;
            const schema = super.defineSchema();

            // 1. Recapture DHFeature fields explicitly for stability
            schema.originItemType = new fields.StringField({
                choices: CONFIG.DH.ITEM.featureTypes,
                nullable: true,
                initial: null
            });
            schema.multiclassOrigin = new fields.BooleanField({ initial: false });
            schema.identifier = new fields.StringField();
            schema.featureForm = new fields.StringField({
                required: true,
                initial: 'passive',
                choices: CONFIG.DH.ITEM.featureForm,
                label: 'DAGGERHEART.CONFIG.FeatureForm.label'
            });

            // 2. Add Colossal Segment specific fields
            /** The difficulty that attackers must meet or beat to hit this segment. */
            schema.difficulty = new fields.NumberField({ required: true, integer: true, initial: 12 });

            /** Explicit HP and Attack fields as requested by user */
            schema.hitPoints = new fields.SchemaField({
                value: new fields.NumberField({ integer: true, initial: 10 }),
                max: new fields.NumberField({ integer: true, initial: 10 })
            });

            schema.attack = new fields.SchemaField({
                modifier: new fields.NumberField({ integer: true, initial: 0 })
            });


            /** Nullify the system's resource field as requested */
            schema.resource = new fields.ObjectField({ initial: {} });

            /** 
             * The type/location of this segment on the colossus body. 
             * These choices are dynamically populated from the fb-cod.colossal-segments compendium 
             * during module initialization.
             */
            schema.segmentType = new fields.StringField({
                required: true,
                initial: 'carapace'
            });

            // --- Adjacency ---
            /** Array of Document IDs for adjacent segments on the same actor. */
            schema.adjacentSegments = new fields.ArrayField(new fields.StringField({ required: true }), { initial: [] });

            // --- Defeat Conditions ---
            /** If true, destroying this segment defeats the entire colossus. */
            /**
             * Chain group identifier (e.g. 'A', 'B'). When all segments in the
             * same group are Destroyed, the colossus is defeated.
             */
            schema.chainGroup = new fields.StringField({
                required: false,
                initial: '',
                blank: true,
                nullable: true
            });

            /** The specific subgroup identifier (e.g., 'A', 'B') for multiple groups of same type. */
            schema.subgroup = new fields.StringField({ required: false, initial: '', nullable: true });

            /** Whether this segment is fatal (usually determined by the Chain Group). */
            schema.fatal = new fields.BooleanField({ required: true, initial: false });

            // --- Status Flags ---
            /** Whether this segment has been Destroyed (HP reduced to 0). */
            schema.destroyed = new fields.BooleanField({ initial: false });

            /**
             * Whether this segment is currently Broken (a temporary state,
             * often token-based in the tabletop ruleset).
             */
            schema.broken = new fields.BooleanField({ initial: false });

            /**
             * Whether this segment is currently Collapsed (a temporary state,
             * often token-based in the tabletop ruleset).
             */
            schema.collapsed = new fields.BooleanField({ initial: false });

            // --- Metadata ---
            /** The relative position or instance identifier (e.g. "Left", "Right", "1", "Front"). */
            schema.position = new fields.StringField({ required: false, initial: '', nullable: true });

            /** Internal: The original compendium ID of the footprint used to create this segment. */
            schema.footprintId = new fields.StringField({ required: false, initial: '', nullable: true });

            return schema;
        }

        /**
         * Is this segment considered Broken?
         * @type {boolean}
         */
        get isBroken() {
            return this.broken;
        }

        /**
         * Is this segment considered Collapsed?
         * @type {boolean}
         */
        get isCollapsed() {
            return this.collapsed;
        }

        /** @override */
        _getTags() {
            const tags = [];

            // 1. Segment Type & Position
            if (this.segmentType) {
                const field = this.schema.getField('segmentType');
                let choices = field.choices;
                if (typeof choices === 'function') choices = choices();
                const label = (choices || {})[this.segmentType];
                
                let typeLabel = label || this.segmentType.capitalize();
                if (this.position) typeLabel += ` [${this.position}]`;
                tags.push(typeLabel);
            }

            // 2. Difficulty - using safe access with multiple fallbacks
            const diffValue = this.difficulty || this._source?.difficulty || 12;
            tags.push(`Diff: ${diffValue}`);

            // 3. Status Flags
            if (this.fatal) tags.push("FATAL");
            if (this.isBroken) tags.push("BROKEN");
            if (this.isCollapsed) tags.push("COLLAPSED");
            if (this.destroyed) tags.push("DESTROYED");

            return tags;
        }

        /**
         * Check if this segment's actions or features can be used.
         * According to the Daggerheart rules:
         * - Broken segments cannot use Actions or Reactions.
         * - Destroyed segments cannot use ANY features.
         * @param {string} featureForm - 'passive', 'action', or 'reaction'
         * @returns {boolean}
         */
        canUseFeature(featureForm) {
            if (this.destroyed) return false;
            if (this.isBroken && (featureForm === 'action' || featureForm === 'reaction' || featureForm === 'attack')) return false;
            return true;
        }

        /**
         * Prepare total HP for easier display.
         */
        get hp() {
            return this.hitPoints;
        }
    };
}
