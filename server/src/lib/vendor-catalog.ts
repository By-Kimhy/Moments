// Vendor categories and Cambodia's provinces, with their names. Plain data: the web app imports
// this too (as @api/lib/vendor-catalog) for its filters and labels.

export const VENDOR_CATEGORIES = {
  PHOTOGRAPHY: { km: "ថតរូប", en: "Photography" },
  VIDEO: { km: "ថតវីដេអូ", en: "Video" },
  DECORATION: { km: "តុបតែងលម្អ", en: "Decoration" },
  VENUE: { km: "ទីកន្លែងរៀបចំកម្មវិធី", en: "Venues" },
  MAKEUP: { km: "តុបតែងមុខ និងសក់", en: "Makeup & hair" },
  ATTIRE: { km: "សម្លៀកបំពាក់", en: "Attire" },
  CATERING: { km: "ម្ហូបអាហារ", en: "Catering" },
  MUSIC: { km: "តន្ត្រី", en: "Music" },
  MC: { km: "ពិធីករ", en: "MC" },
  PRINTING: { km: "បោះពុម្ពធៀប", en: "Invitation printing" },
  OTHER: { km: "ផ្សេងៗ", en: "Other" },
} as const;
export type VendorCategory = keyof typeof VENDOR_CATEGORIES;
export const CATEGORY_KEYS = Object.keys(VENDOR_CATEGORIES) as VendorCategory[];

export const PROVINCES = {
  "phnom-penh": { km: "ភ្នំពេញ", en: "Phnom Penh" },
  "banteay-meanchey": { km: "បន្ទាយមានជ័យ", en: "Banteay Meanchey" },
  battambang: { km: "បាត់ដំបង", en: "Battambang" },
  "kampong-cham": { km: "កំពង់ចាម", en: "Kampong Cham" },
  "kampong-chhnang": { km: "កំពង់ឆ្នាំង", en: "Kampong Chhnang" },
  "kampong-speu": { km: "កំពង់ស្ពឺ", en: "Kampong Speu" },
  "kampong-thom": { km: "កំពង់ធំ", en: "Kampong Thom" },
  kampot: { km: "កំពត", en: "Kampot" },
  kandal: { km: "កណ្តាល", en: "Kandal" },
  kep: { km: "កែប", en: "Kep" },
  "koh-kong": { km: "កោះកុង", en: "Koh Kong" },
  kratie: { km: "ក្រចេះ", en: "Kratie" },
  mondulkiri: { km: "មណ្ឌលគិរី", en: "Mondulkiri" },
  "oddar-meanchey": { km: "ឧត្តរមានជ័យ", en: "Oddar Meanchey" },
  pailin: { km: "ប៉ៃលិន", en: "Pailin" },
  "preah-sihanouk": { km: "ព្រះសីហនុ", en: "Preah Sihanouk" },
  "preah-vihear": { km: "ព្រះវិហារ", en: "Preah Vihear" },
  "prey-veng": { km: "ព្រៃវែង", en: "Prey Veng" },
  pursat: { km: "ពោធិ៍សាត់", en: "Pursat" },
  ratanakiri: { km: "រតនគិរី", en: "Ratanakiri" },
  "siem-reap": { km: "សៀមរាប", en: "Siem Reap" },
  "stung-treng": { km: "ស្ទឹងត្រែង", en: "Stung Treng" },
  "svay-rieng": { km: "ស្វាយរៀង", en: "Svay Rieng" },
  takeo: { km: "តាកែវ", en: "Takeo" },
  "tbong-khmum": { km: "ត្បូងឃ្មុំ", en: "Tbong Khmum" },
} as const;
export type Province = keyof typeof PROVINCES;
export const PROVINCE_KEYS = Object.keys(PROVINCES) as Province[];
