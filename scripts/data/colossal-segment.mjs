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
        static DEFAULT_ICON = 'systems/daggerheart/assets/icons/documents/actors/dragon-head.svg';

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
                initial: 'body',
                choices: {
                    'head': 'Head',
                    'neck': 'Neck',
                    'torso': 'Torso',
                    'arm-left': 'Left Arm',
                    'arm-right': 'Right Arm',
                    'foreleg-left': 'Left Foreleg',
                    'foreleg-right': 'Right Foreleg',
                    'hindleg-left': 'Left Hindleg',
                    'hindleg-right': 'Right Hindleg',
                    'leg': 'Leg',
                    'leg-left': 'Left Leg',
                    'leg-right': 'Right Leg',
                    'core': 'Core',
                    'body': 'Body',
                    'tail': 'Tail',
                    'wing-left': 'Left Wing',
                    'wing-right': 'Right Wing',
                    'claw-left': 'Left Claw',
                    'claw-right': 'Right Claw',
                    'claw': 'Claw',
                    'other': 'Other'
                }
            });

            // --- Adjacency ---
            /** Comma-separated names of adjacent segments (e.g. "Torso, Head"). */
            schema.adjacentSegments = new fields.StringField({ required: false, initial: '', nullable: true });

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

            /** Number of "Broken" tokens currently on this segment. */
            schema.brokenTokens = new fields.NumberField({ required: false, integer: true, initial: 0, min: 0, nullable: false });

            return schema;
        }

        /** @override */
        _getTags() {
            const tags = super._getTags?.() || [];
            if (this.segmentType) {
                const label = this.schema.getField('segmentType').choices[this.segmentType];
                tags.push(label || this.segmentType.capitalize());
            }
            tags.push(`Diff: ${this.difficulty}`);
            if (this.fatal) tags.push("FATAL");
            if (this.broken) tags.push("BROKEN");
            if (this.destroyed) tags.push("DESTROYED");
            return tags;
        }

        /**
         * Prepare total HP for easier display.
         */
        get hp() {
            return this.resource;
        }
    };
}
