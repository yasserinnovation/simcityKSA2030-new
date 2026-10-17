# Western clay-country pass

The existing western corridor keeps its project footprints, IDs, road and rail alignments, geography projection and simulation data. Locally authored details add a recognisable illustrative Abraj Al-Bait tower south of the Haram (offset west for visibility), 10 courtyard parasols around the existing Prophet's Mosque, 21 coral-plaster Al-Balad houses with projecting screened roshan, 15 corniche modules and 24 Taif rose plantings. The existing Kaaba, mosque models, Mina tents, Jeddah skyline and Haramain stations remain. This is stylised massing rather than a survey-accurate reconstruction.

54 additional Hijazi neighbourhood plots use the existing decoration-clearance checks. King Fahd's Fountain replaces the static cylinder with animated offshore droplets. Existing national clouds and airships remain; reduced-motion preferences freeze cosmetic motion. Decorative animation does not write to campaign state. The new landmark kit is integrated into normal renderer geometry, retaining its normal picking and shadow handling. The additional neighbourhood/fountain cosmetics are excluded from picking.

Verification: six matching before/after daylight views were captured; eight city/project targets each passed six sampled ID-picking hits. Previewing left local storage and renderer project state unchanged. No browser errors were reported. All seven gameplay suites passed. Both renderer smoke tests passed. Results are in after/results.json. Reproduce with node tools/check-west-clay.js after against the server on port 8016. No hardware performance claim is made.

Reference sources: [Jeddah and its Al-Balad / fountain landmarks](https://www.visitsaudi.com/en/destinations/jeddah), [Madinah and the Prophet's Mosque](https://www.visitsaudi.com/en/see-do/destinations/medina), [Masjid al-Haram](https://www.visitsaudi.com/en/makkah/attractions/al-masjed-al-haram). No images from these sources are copied into the game.

Code: west-clay.js, world-cosmetics.js, engine.js and boot.js. The classic renderer retains its original models.
