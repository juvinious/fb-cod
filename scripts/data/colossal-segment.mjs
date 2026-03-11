/**
 * Setup the Colossal Segment Data Model by extending Daggerheart's Feature model.
 * This allows us to use the system's native ActionField, ActionsField, and resource handling.
 * @returns {typeof foundry.abstract.TypeDataModel}
 */
export function setupColossalSegmentModel() {
    console.log("fb-cod | setupColossalSegmentModel called");

    // Get DHFeature from system API or CONFIG
    const FeatureModel = game.system.api?.models?.items?.DHFeature || CONFIG.Item.dataModels.feature;

    if (!FeatureModel) {
        console.error("fb-cod | Could not find Feature base model! CONFIG.Item.dataModels keys:", Object.keys(CONFIG.Item.dataModels));
        // Fallback to basic TypeDataModel if system isn't ready
        return class ColossalSegmentDataModel extends foundry.abstract.TypeDataModel {
            static get metadata() { return { label: "Colossal Segment", type: "fb-cod.colossal-segment" }; }
            static defineSchema() { return {}; }
        };
    }

    return class ColossalSegmentDataModel extends FeatureModel {
        /**@inheritdoc */
        static DEFAULT_ICON = 'icons/creatures/magical/construct-iron-stomping-yellow.webp';

        /** @type {ActorDataModelMetadata} */
        static get metadata() {
            return foundry.utils.mergeObject(super.metadata, {
                label: 'Colossal Segment',
                type: 'fb-cod.colossal-segment',
                hasDescription: true,
                hasResource: true,
                hasActions: true
            });
        }

        /** @type {ActorDataModelMetadata} */
        get metadata() {
            return this.constructor.metadata;
        }

        /** @inheritDoc */
        static defineSchema() {
            const fields = foundry.data.fields;
            const schema = super.defineSchema();

            // --- Core Segment Stats ---
            /** The difficulty that attackers must meet or beat to hit this segment. */
            schema.difficulty = new fields.NumberField({ required: true, integer: true, initial: 12 });

            /** The ATK bonus added to this segment's standard attack roll (e.g. +2). */
            schema.atkModifier = new fields.NumberField({ required: false, integer: true, initial: 0, nullable: true });

            /** The type/location of this segment on the colossus body. */
            schema.segmentType = new fields.StringField({
                required: true,
                initial: 'other',
                choices: {
                    'head': 'Head',
                    'neck': 'Neck',
                    'torso': 'Torso',
                    'thorax': 'Thorax',
                    'abdomen': 'Abdomen',
                    'carapace': 'Carapace',
                    'shell': 'Shell',
                    'arm': 'Arm',
                    'forelimb': 'Forelimb',
                    'leg': 'Leg',
                    'hindlimb': 'Hindlimb',
                    'wing': 'Wing',
                    'claw': 'Claw',
                    'talon': 'Talon',
                    'pincer': 'Pincer',
                    'tentacle': 'Tentacle',
                    'antennae': 'Antennae',
                    'tail': 'Tail',
                    'other': 'Other'
                }
            });

            // --- Adjacency ---
            /** Array of Document IDs for adjacent segments on the same actor. */
            schema.adjacentSegments = new fields.ArrayField(new fields.StringField({ required: true }), { initial: [] });

            // --- Defeat Conditions ---
            /** If true, destroying this segment defeats the entire colossus. */
            schema.fatal = new fields.BooleanField({ initial: false });

            /**
             * Chain group identifier (e.g. 'A', 'B'). When all segments in the
             * same group are Destroyed, the colossus is defeated.
             */
            schema.chainGroup = new fields.StringField({ required: false, initial: '', nullable: true });

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
                const label = this.schema.getField('segmentType').choices[this.segmentType];
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
            return this.resource;
        }
    };
}
