export const VENUE_GROUPS: Array<{ label: string; emoji: string; types: string[] }> = [
    {
        label: "Coffee & Tea",
        emoji: "☕",
        types: ["cafe", "coffeeshop", "tea_house"],
    },
    {
        label: "Bakery & Desserts",
        emoji: "🍞",
        types: ["bakery", "dessert_shop", "ice_cream"],
    },
    {
        label: "Restaurants",
        emoji: "🍽️",
        types: [
            "restaurant",
            "steakhouse",
            "seafood",
            "sushi",
            "mexican",
            "italian",
            "chinese",
            "indian",
            "thai",
        ],
    },
    {
        label: "Fast & Casual",
        emoji: "🍕",
        types: ["pizza", "fast_food", "deli", "juice_bar"],
    },
    {
        label: "Bars & Nightlife",
        emoji: "🍺",
        types: ["bar", "pub", "wine_bar", "brewery", "nightclub", "lounge", "cocktail_bar", "hookah_lounge"],
    },
    {
        label: "Adventure Activities",
        emoji: "🏹",
        types: [
            "escape_rooms_laser_tag",
            "airsoft_paintball",
            "ropes_courses_ziplines",
            "atv_off_road_tours",
            "bike_segway_tours"
        ],
    },
    {
        label: "Water Activities",
        emoji: "🌊",
        types: [
            "kayaking_paddleboarding",
            "snorkeling_scuba",
            "jet_ski_wakeboarding",
            "surfing",
            "sailing_boat_tours"
        ],
    },
    {
        label: "Adrenaline Experiences",
        emoji: "⚡",
        types: [
            "skydiving_bungee",
            "hot_air_balloon",
            "paragliding_hang_gliding",
            "go_kart_track_racing",
            "vr_simulator"
        ],
    },
    {
        label: "Activities",
        emoji: "🎡",
        types: [
            "aquariums_zoos",
            "museums_cultural_sites",
            "water_parks_pools",
            "arcades_indoor_play",
            "mini_golf_trampoline"
        ],
    },
];

export interface RuleInput {
    venue_types: string[];
    min_rating_per_type: Record<string, number>;
    min_days_per_type: Record<string, number>;
    exclude_chains: boolean;
    exclude_keywords: string;
    custom_notes_per_type: Record<string, string>;
}

export const emptyRule: RuleInput = {
    venue_types: [],
    min_rating_per_type: {},
    min_days_per_type: {},
    exclude_chains: false,
    exclude_keywords: "",
    custom_notes_per_type: {},
};
