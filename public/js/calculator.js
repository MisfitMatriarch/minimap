/* ═══════════════════════════════════════════════
   Position Calculator — ENOUGH · Misfit Architecture

   HOW POSITION IS CALCULATED:

   Position is determined almost entirely by what is COSTING you.
   Skills, reputation, IP, and business assets do NOT change your starting position.
   They change what you can DO from wherever you are, but they don't move the line.

   The ONLY things that can change your starting position are CONDITIONS-based assets
   that directly offset a specific cost:
     - "A work environment that suits me" offsets credibility/carpark hours by 1
     - "I can be myself in my work" offsets credibility/carpark hours by 1.5
     - "Care at home is shared or supported" offsets weight hours by 2
     - "Supportive people around me" offsets weight hours by 0.5
     - "I set my own pace" offsets energy/injuries hours by 0.5
     - "Flexible schedule" offsets energy/injuries hours by 0.5

   Everything else belongs in the picture but does not move the starting line.
   ═══════════════════════════════════════════════ */

const POSITIONS = {
  carpark: {
    emoji: '🚗',
    title: 'Still in the car park',
    desc: 'Your starting line starts a few blocks before even arriving at the field. You are spending capacity just getting to the race everyone else started at. Chronic illness. Housing insecurity. A body that has not been safe. You have not got a head start deficit. You are running a completely different race.',
    cls: 'pos-carpark',
    label: 'Still in the car park'
  },
  injuries: {
    emoji: '🩹',
    title: 'Carrying injuries that never healed',
    desc: 'Old wounds nobody stitched properly. A body still in threat-response. You are at the blocks, but you have been running on a fracture for years. Trauma. Chronic pain. Burnout that became baseline. The race assumes a body that was repaired. Yours was not.',
    cls: 'pos-injuries',
    label: 'Carrying injuries that never healed'
  },
  weight: {
    emoji: '🎒',
    title: 'Carrying the weight',
    desc: 'Baby on your hip. Elderly parent on your back. A business built in the margins of everyone else\u2019s needs. You showed up. You are running. The race pretends everyone starts with two free hands and a full night\u2019s sleep. You do not.',
    cls: 'pos-weight',
    label: 'Carrying the weight'
  },
  coached: {
    emoji: '📣',
    title: 'Coached by accident, not design',
    desc: 'Your coach is the well-meaning expert who built their advice for someone with a completely different life. Not bad faith. The wrong map. The strategies, the models, the rules \u2014 designed for someone without a care load, without your history, without your starting position.',
    cls: 'pos-coached',
    label: 'Coached by accident, not design'
  },
  blocks: {
    emoji: '🏃',
    title: 'At the blocks',
    desc: 'Two free hands. A rested body. Support in place. Good advice that fits. This is the only starting position the race was designed for. If you are here, you are starting from where all the strategies assume you already are.',
    cls: 'pos-blocks',
    label: 'At the blocks'
  },
  ahead: {
    emoji: '⚡',
    title: 'Ahead of the line',
    desc: 'Inherited advantages. Early expert support. A system built around your needs from the start. The race already started before the gun went off. This is not a moral judgement. It is an architecture observation. Some people began accumulating capacity before anyone else was allowed on the track.',
    cls: 'pos-ahead',
    label: 'Ahead of the line'
  }
};

function calculatePosition(D) {
  const costs = D.costs || { items: [], hrs: [], cats: [] };
  const assets = D.assets || { items: [], pts: [] };

  if (costs.items.length === 0 && assets.items.length === 0) return 'blocks';
  if (costs.items.length === 0) return 'blocks';

  // Count hours per category
  const catHrs = { carpark: 0, injuries: 0, weight: 0, coached: 0 };
  costs.cats.forEach((cat, i) => {
    const c = cat || 'coached';
    catHrs[c] = (catHrs[c] || 0) + (costs.hrs[i] || 0);
  });

  // CONDITION OFFSETS — the only assets that move the line
  const assetItems = assets.items || [];
  let carpark_offset = 0;
  let injuries_offset = 0;
  let weight_offset = 0;

  // Coached offsets — structural conditions
  let coached_offset = 0;

  // CARPARK — identity, safety, survival
  if (assetItems.includes('I can be myself in my work'))            carpark_offset  += 1.5;
  if (assetItems.includes('A work environment that suits me'))      carpark_offset  += 1;
  if (assetItems.includes('I am safe at home'))                     carpark_offset  += 3;

  // INJURIES — energy, body, recovery
  if (assetItems.includes('I set my own pace'))                     injuries_offset += 1;
  if (assetItems.includes('Flexible schedule'))                     injuries_offset += 0.5;

  // WEIGHT — care, relational load
  if (assetItems.includes('Care at home is shared or supported'))   weight_offset   += 2;
  if (assetItems.includes('Supportive people around me'))           weight_offset   += 1;
  if (assetItems.includes('Reliable childcare in place'))           weight_offset   += 2;

  // COACHED — wrong map, wrong systems
  if (assetItems.includes('I have help with operations or admin'))  coached_offset  += 1;
  if (assetItems.includes('I have guidance that fits my actual life')) coached_offset += 1.5;
  if (assetItems.includes('A financial safety net exists'))         coached_offset  += 1;

  // Apply offsets — all categories can now be offset by conditions
  const adjHrs = {
    carpark:  Math.max(0, catHrs.carpark  - carpark_offset),
    injuries: Math.max(0, catHrs.injuries - injuries_offset),
    weight:   Math.max(0, catHrs.weight   - weight_offset),
    coached:  Math.max(0, catHrs.coached  - coached_offset)
  };
  const adjTotal = Object.values(adjHrs).reduce((a, b) => a + b, 0);

  // Credibility/belonging is most fundamental
  if (adjHrs.carpark > 0) return 'carpark';
  if (adjTotal === 0) return 'blocks';

  // Find dominant category
  const order = ['injuries', 'weight', 'coached'];
  let dominant = 'coached';
  let maxHrs = 0;
  for (const cat of order) {
    if (adjHrs[cat] > maxHrs + 0.5) {
      maxHrs = adjHrs[cat];
      dominant = cat;
    }
  }

  // Coached with very light costs + real assets = blocks
  const assetCount = (assets.items || []).length;
  if (dominant === 'coached' && adjHrs.coached <= 1 && assetCount >= 3) return 'blocks';
  if (dominant === 'coached' && adjHrs.coached === 0) return 'blocks';

  return dominant;
}
