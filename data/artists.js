// Valore Library: artist spotlight rooms.
//
// Same shape as a window.VALORE_COUNTRIES entry (name, tag, blurb, sections,
// photos, accentClass) so it can be dropped straight into country.html's
// existing renderer and into museum-room.js's existing room-building logic
// with no structural changes to either; see js/museum-ui.js's
// ARTIST_SLUGS, which appends these rooms onto the end of the country
// corridor in explore.html.
//
// Unlike a country entry, an artist has no "native language" translation to
// offer, so `sections[].body.native` here just repeats the English text
// rather than leaving it blank, and `noTranslation: true` tells
// country.html to hide the language toggle entirely rather than show a
// toggle that does nothing.
window.VALORE_ARTISTS = {

  bahati: {
    name: "Bahati",
    nativeName: "",
    region: "Artist Spotlight",
    tag: "Artist Spotlight",
    blurb: "A painter reimagining classical portraiture around Black womanhood, and carrying the Democratic Republic of Congo's flag into scenes of family, dance, and quiet resistance.",
    noTranslation: true,
    heroImage: "img/artists/bahati/1.jpg",
    langLabel: "English",
    accentClass: "artist-bahati",
    sections: [
      {
        heading: { en: "A New Room in the Gallery", native: "A New Room in the Gallery" },
        body: {
          en: "Bahati, who signs her canvases BHTart, paints her way into art history rather than around it: her reimagining of Vermeer's Girl with a Pearl Earring keeps the composition's every hallmark, the turned head, the parted lips, the improbable earring catching the light, and recasts its subject as a young Black woman, gold hoop through her nose instead of pearl in her ear. It's less a copy than a claim: the same technical control the old masters are praised for, turned toward a face the canon rarely painted with that much care. This room gathers fourteen of her paintings, spanning that kind of art-historical conversation, scenes of Congolese heritage carried through family and dance, quieter, more interior work about calm, power, and time, and further pieces ranging into regal fantasy portraiture, environmental advocacy, and nature study.",
          native: "Bahati, who signs her canvases BHTart, paints her way into art history rather than around it: her reimagining of Vermeer's Girl with a Pearl Earring keeps the composition's every hallmark, the turned head, the parted lips, the improbable earring catching the light, and recasts its subject as a young Black woman, gold hoop through her nose instead of pearl in her ear. It's less a copy than a claim: the same technical control the old masters are praised for, turned toward a face the canon rarely painted with that much care. This room gathers fourteen of her paintings, spanning that kind of art-historical conversation, scenes of Congolese heritage carried through family and dance, quieter, more interior work about calm, power, and time, and further pieces ranging into regal fantasy portraiture, environmental advocacy, and nature study."
        }
      },
      {
        heading: { en: "Congo, Remembered and Reimagined", native: "Congo, Remembered and Reimagined" },
        body: {
          en: "The flag of the Democratic Republic of Congo, that diagonal red-and-yellow stripe across blue, recurs across several canvases here like a signature the paintings themselves carry. In one, a mother braids her daughter's hair beneath it, an unhurried, everyday scene of care and inheritance rendered in the same register as a family photograph. In another, two dancers in traditional dress move against a burning orange sunset, the flag draped behind them like a backdrop at a homecoming. A third painting, titled Equity, is harder-edged: a woman with a hand clamped over her mouth, the flag stitched into her clothing, sharing the canvas with a mother cradling her child and a set of scales hanging in the sky above the word itself. Read together, the three paintings hold both halves of the same inheritance, the tenderness and the injustice, without letting either one cancel the other out.",
          native: "The flag of the Democratic Republic of Congo, that diagonal red-and-yellow stripe across blue, recurs across several canvases here like a signature the paintings themselves carry. In one, a mother braids her daughter's hair beneath it, an unhurried, everyday scene of care and inheritance rendered in the same register as a family photograph. In another, two dancers in traditional dress move against a burning orange sunset, the flag draped behind them like a backdrop at a homecoming. A third painting, titled Equity, is harder-edged: a woman with a hand clamped over her mouth, the flag stitched into her clothing, sharing the canvas with a mother cradling her child and a set of scales hanging in the sky above the word itself. Read together, the three paintings hold both halves of the same inheritance, the tenderness and the injustice, without letting either one cancel the other out."
        }
      },
      {
        heading: { en: "Inner Worlds", native: "Inner Worlds" },
        body: {
          en: "Not every piece in this room points outward. In one portrait, a woman's headwrap and hair are painted in the exact silhouette of the African continent, filled with a miniature sunset and treeline, as if the shape of home were something she carried on her head rather than a place she'd left behind. Inner Calm shows a young woman crowned mid-meditation, hands not her own settling the tiara into place above closed eyes, the title's promise, find the power within you, doubling as instruction for how to look at the painting. Strings of Time takes a darker turn: a disembodied hand suspends a ringing alarm clock on threads tied to its own fingers, equal parts marionette and warning about who's really setting the pace of your day. And in Sisters, two women dissolve into laughter, one leaning into the other's shoulder, camera-real and unguarded in a way the more formal portraits deliberately aren't.",
          native: "Not every piece in this room points outward. In one portrait, a woman's headwrap and hair are painted in the exact silhouette of the African continent, filled with a miniature sunset and treeline, as if the shape of home were something she carried on her head rather than a place she'd left behind. Inner Calm shows a young woman crowned mid-meditation, hands not her own settling the tiara into place above closed eyes, the title's promise, find the power within you, doubling as instruction for how to look at the painting. Strings of Time takes a darker turn: a disembodied hand suspends a ringing alarm clock on threads tied to its own fingers, equal parts marionette and warning about who's really setting the pace of your day. And in Sisters, two women dissolve into laughter, one leaning into the other's shoulder, camera-real and unguarded in a way the more formal portraits deliberately aren't."
        }
      }
    ],
    photos: [
      { src: "img/artists/bahati/1.jpg", credit: "“Girl with a Pearl Earring, Reimagined” · original painting by Bahati (BHTart)" },
      { src: "img/artists/bahati/2.jpg", credit: "“Braiding Traditions” · original painting by Bahati (BHTart)" },
      { src: "img/artists/bahati/3.jpg", credit: "“Equity” · original painting by Bahati (BHTart)" },
      { src: "img/artists/bahati/4.jpg", credit: "“Dancers of the Congo / Daughter of the Continent” · original painting by Bahati (BHTart)" },
      { src: "img/artists/bahati/5.jpg", credit: "“Sisters” · original painting by Bahati (BHTart)" },
      { src: "img/artists/bahati/6.jpg", credit: "“Inner Calm” · original painting by Bahati (BHTart)" },
      { src: "img/artists/bahati/7.jpg", credit: "“Strings of Time” · original painting by Bahati (BHTart)" },
      { src: "img/artists/bahati/8.jpg", credit: "“Keep Earth's Environment Clean, Safe, and Healthy” · original artwork by Bahati (BHTart)" },
      { src: "img/artists/bahati/9.jpg", credit: "“Shielded” · original painting by Bahati (BHTart)" },
      { src: "img/artists/bahati/10.jpg", credit: "“Just Another Day in Paradise” · original painting by Bahati (BHTart)", large: true },
      { src: "img/artists/bahati/11.jpg", credit: "“Veiled in Red” · original painting by Bahati (BHTart)" },
      { src: "img/artists/bahati/12.jpg", credit: "“Crowned in Kente” · original painting by Bahati (BHTart)", large: true },
      { src: "img/artists/bahati/13.jpg", credit: "“Coronation” · original painting by Bahati (BHTart)" },
      { src: "img/artists/bahati/14.jpg", credit: "“Autumn Watch” · original painting by Bahati (BHTart)" }
    ]
  },

  olgalene: {
    name: "Olgalene",
    nativeName: "",
    region: "Artist Spotlight",
    tag: "Artist Spotlight",
    blurb: "A painter from the Central African Republic working across acrylic still life, symbolic landscape, and ink-brush traditions borrowed from well outside her own, still finding which one is hers.",
    noTranslation: true,
    heroImage: "img/artists/olgalene/2.jpg",
    langLabel: "English",
    accentClass: "artist-olgalene",
    sections: [
      {
        heading: { en: "Finding Her Hand", native: "Finding Her Hand" },
        body: {
          en: "Olgalene came to painting the way a lot of people do, taught the fundamentals by an older sibling and then, within a stretch of months, past needing the lessons at all. This room is less a themed exhibition than a working sketchbook: a pop-art-bright strawberry study sitting a few feet from a wolf's head rendered in loose black ink strokes against a full moon, a green dragon glaring off the edge of a cardboard scrap. Nothing here repeats a formula twice. What holds it together is a hand that is visibly, rapidly getting more confident, painting whatever is in front of it or in her head that week.",
          native: "Olgalene came to painting the way a lot of people do, taught the fundamentals by an older sibling and then, within a stretch of months, past needing the lessons at all. This room is less a themed exhibition than a working sketchbook: a pop-art-bright strawberry study sitting a few feet from a wolf's head rendered in loose black ink strokes against a full moon, a green dragon glaring off the edge of a cardboard scrap. Nothing here repeats a formula twice. What holds it together is a hand that is visibly, rapidly getting more confident, painting whatever is in front of it or in her head that week."
        }
      },
      {
        heading: { en: "Borrowed Brushes", native: "Borrowed Brushes" },
        body: {
          en: "Three pieces here are built around brushwork and lettering rather than a picture in the usual sense. One is a page of practiced calligraphy, bold gray letterforms spelling out a phrase that reads like Sango, the national language of the Central African Republic, signed with her name in a looser cursive underneath. The other two lean into ink-wash brush painting, bamboo stalks and plum blossoms rendered in the same loaded-brush strokes as a classical East Asian scroll, one of them building toward a bold lettered NEW YEAR beside a red painted sun. None of it is her own inherited tradition, exactly, it's a younger sister trying on alphabets and brush techniques that caught her eye and seeing what she can make them do.",
          native: "Three pieces here are built around brushwork and lettering rather than a picture in the usual sense. One is a page of practiced calligraphy, bold gray letterforms spelling out a phrase that reads like Sango, the national language of the Central African Republic, signed with her name in a looser cursive underneath. The other two lean into ink-wash brush painting, bamboo stalks and plum blossoms rendered in the same loaded-brush strokes as a classical East Asian scroll, one of them building toward a bold lettered NEW YEAR beside a red painted sun. None of it is her own inherited tradition, exactly, it's a younger sister trying on alphabets and brush techniques that caught her eye and seeing what she can make them do."
        }
      },
      {
        heading: { en: "Two Skies", native: "Two Skies" },
        body: {
          en: "The strongest pair in the room is a deliberate diptych: the same gold-branched tree painted twice, once against a day of red, orange, and violet quadrants, and once as a night scene, the same branch now growing off a cliff edge under a rock face flecked with red and a sky full of hand-painted stars. Seen side by side they read as a single tree across two different hours rather than two separate ideas, an early sign of an artist starting to think in sets. A third night piece, a moon-lit tree built entirely out of pink, green, and yellow dabs on black canvas, works the same hour from a completely different, almost pointillist technique.",
          native: "The strongest pair in the room is a deliberate diptych: the same gold-branched tree painted twice, once against a day of red, orange, and violet quadrants, and once as a night scene, the same branch now growing off a cliff edge under a rock face flecked with red and a sky full of hand-painted stars. Seen side by side they read as a single tree across two different hours rather than two separate ideas, an early sign of an artist starting to think in sets. A third night piece, a moon-lit tree built entirely out of pink, green, and yellow dabs on black canvas, works the same hour from a completely different, almost pointillist technique."
        }
      }
    ],
    photos: [
      { src: "img/artists/olgalene/2.jpg", credit: "“Moon Wolf” · original painting by Olgalene" },
      { src: "img/artists/olgalene/4.jpg", credit: "“Branch at Sunset” · original painting by Olgalene" },
      { src: "img/artists/olgalene/6.jpg", credit: "“Branch at Night” · original painting by Olgalene" },
      { src: "img/artists/olgalene/1.jpg", credit: "“Strawberry Study” · original painting by Olgalene" },
      { src: "img/artists/olgalene/7.jpg", credit: "“Dragon” · original painting by Olgalene" },
      { src: "img/artists/olgalene/8.jpg", credit: "“Night Bloom” · original painting by Olgalene" },
      { src: "img/artists/olgalene/3.jpg", credit: "“Duti na Nzoni” · calligraphy practice sheet, ink on paper, by Olgalene" },
      { src: "img/artists/olgalene/5.jpg", credit: "“New Year” · ink brush on paper, by Olgalene" },
      { src: "img/artists/olgalene/9.jpg", credit: "“Bamboo” · ink wash on paper, by Olgalene" }
    ]
  }

};
