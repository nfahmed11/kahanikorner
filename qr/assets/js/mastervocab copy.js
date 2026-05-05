export const vocab = [

  
]















export function buildVariantLookup(words) {
  const lookup = {};

  words.forEach((entry) => {
    lookup[entry.word.baseRomanUrdu] = {
      id: entry.id,
      type: "base",
      matchedRomanUrdu: entry.word.baseRomanUrdu,
      matchedUrdu: entry.word.baseUrdu,
      baseRomanUrdu: entry.word.baseRomanUrdu,
      baseUrdu: entry.word.baseUrdu,
      english: entry.word.english,
      pos: entry.word.pos,
      gender: entry.grammar?.baseGender ?? null,
      number: null,
      image: entry.image,
    };

    entry.variants.forEach((variant) => {
      lookup[variant.romanUrdu] = {
        id: entry.id,
        type: "variant",
        matchedRomanUrdu: variant.romanUrdu,
        matchedUrdu: variant.urdu,
        baseRomanUrdu: entry.word.baseRomanUrdu,
        baseUrdu: entry.word.baseUrdu,
        english: entry.word.english,
        pos: entry.word.pos,
        gender: variant.gender ?? null,
        number: variant.number ?? null,
        image: entry.image,
      };
    });
  });

  return lookup;
}

export const variantLookup = buildVariantLookup(vocab);
