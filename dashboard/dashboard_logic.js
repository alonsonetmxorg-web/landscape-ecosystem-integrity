// =====================================================================
// Landscape Ecosystem Health Index -- national dashboard (proposal v2)
// Builds on the earlier South-Bohemia prototype: keeps neighbor-median
// diverging coloring, YoY tooltips, click-through raster pane, and the
// side-panel line chart, while adding: full national coverage (206 ORPs),
// bilingual CZ/EN, a default health-index map layer, a Change-over-time
// mode with a notable-changes leaderboard, a composition pie chart, and
// the 4-bucket + Unclassified scheme confirmed against the AOPK document.
// =====================================================================

const YEARS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
const BUCKET_KEYS = ["F", "A", "G", "U"]; // the four buckets that count toward the composite index
const ALL_KEYS = ["F", "A", "G", "U", "X"]; // X = Unclassified (wetland/aquatic/bare-rock), shown but excluded from the index

const LABELS = {
  F: { cz: "Les", en: "Forest" },
  A: { cz: "Zemědělská půda", en: "Agricultural Land" },
  G: { cz: "Travní porosty", en: "Grassland" },
  U: { cz: "Zastavěné území", en: "Urban Areas" },
  X: { cz: "Neklasifikováno", en: "Unclassified" },
  // Short label for chart legends/tags; the full indicator name
  // (T("health_index")) is stated once per card (brief G3).
  I: { cz: "IEI", en: "IEI" },
};

// Diverging colours for CHANGE (brief G8 + colleagues' colour spec): red =
// decrease, white = zero, blue = increase. Seven fixed stops, interpolated in
// sRGB, with zero exactly in the middle. Position t = (v / M + 1) / 2, clamped
// to 0-1, where M is the (symmetric) data range for that quantity.
const CHG_STOPS = [
  [0, "#B54836"], [1 / 6, "#CE8579"], [2 / 6, "#E6C2BC"], [0.5, "#FFFFFF"],
  [4 / 6, "#BBCFE2"], [5 / 6, "#769EC5"], [1, "#326EA8"],
];
const CHG_GRADIENT_CSS = CHG_STOPS.map((st) => st[1] + " " + (st[0] * 100).toFixed(2) + "%").join(", ");
const NO_DATA_COLOR = "#E2E7E4"; // separate from the scale: no data is not zero
function changeRgb(t) {
  t = Math.max(0, Math.min(1, t));
  for (let i = 1; i < CHG_STOPS.length; i++) {
    if (t <= CHG_STOPS[i][0]) {
      const a = CHG_STOPS[i - 1], b = CHG_STOPS[i];
      const k = (t - a[0]) / (b[0] - a[0]);
      const ca = parseInt(a[1].slice(1), 16), cb = parseInt(b[1].slice(1), 16);
      const ch = (sh) => Math.round(((ca >> sh) & 255) + ((((cb >> sh) & 255) - ((ca >> sh) & 255)) * k));
      return [ch(16), ch(8), ch(0)];
    }
  }
  return [0x32, 0x6E, 0xA8];
}
// The published trend tiles were baked with a 3-stop colormap (see
// pipeline/08_rebuild_trend_tiles.ipynb): orange (229,137,84) at -0.01694,
// white (253,253,253) at 0, dark green (0,68,27) at +0.01694 (about +/-2 SD of
// the real slopes), with anything beyond clipped to the end colour. Colour
// distance from white therefore maps linearly back to the slope, so the
// recolour below is an exact inversion of that ramp, symmetric in both signs.
const TREND_M = 0.01694; // slope per year, 0-1 index scale (= 1.7 p. b. / year)

// Palette redesigned for contrast (colleague feedback: the old grays and
// beiges were too close together). Distinct hue AND lightness per class.
const BUCKET_COLORS = {
  F: "#1b5e20", // dark green
  A: "#c9962c", // warm gold/ochre
  G: "#7cb342", // yellow-green
  U: "#757575", // medium-dark gray
  X: "#e0e0e0", // near-white gray -- clearly lighter than U
};

// Color for the "Untapped potential" slice of the contribution-to-index pie
// (1 - sum of weighted contributions) -- a distinct navy, since none of the
// bucket colors above are blue.
const UNTAPPED_COLOR = "#3a5a78";

// Fine-grained land-cover classes (raster_id -> bilingual name) that make
// up each bucket, e.g. Forest = "Natural beech forest", "Non-natural spruce
// forest", etc. Sourced from KVES_KOD_lookup_MASTER_with_buckets.csv, same
// lookup table used for the area_ha computation. Static reference data --
// classification doesn't vary by year, so this is not per-ORP.
const SUBCAT_LABELS = {"1": {"cz": "Souvislá zástavba", "en": "Continuous built-up area"}, "2": {"cz": "Nesouvislá zástavba", "en": "Discontinuous built-up area"}, "3": {"cz": "Průmyslové a obchodní jednotky", "en": "Industrial and commercial units"}, "4": {"cz": "Dopravní síť", "en": "Transport network"}, "5": {"cz": "Skládky a staveniště", "en": "Landfills and construction sites"}, "6": {"cz": "Městská zeleň", "en": "Urban green space"}, "7": {"cz": "Sportovní a rekreační plochy", "en": "Sports and recreational areas"}, "8": {"cz": "Orná půda", "en": "Arable land"}, "9": {"cz": "Ovocný sad, zahrada", "en": "Orchard, garden"}, "10": {"cz": "Chmelnice", "en": "Hop field"}, "11": {"cz": "Vinice", "en": "Vineyard"}, "12": {"cz": "Degradovaný travní porost", "en": "Degraded grassland"}, "13": {"cz": "Rozptýlená zeleň", "en": "Scattered vegetation"}, "14": {"cz": "Aluviální a vlhké louky", "en": "Alluvial and wet meadows"}, "15": {"cz": "Suché trávníky", "en": "Dry grasslands"}, "16": {"cz": "Mezofilní louky", "en": "Mesic meadows"}, "17": {"cz": "Alpínské louky", "en": "Alpine meadows"}, "18": {"cz": "Vřesoviště", "en": "Heathland"}, "19": {"cz": "Bory nepřírodní", "en": "Non-natural pine forest"}, "20": {"cz": "Bučiny nepřírodní", "en": "Non-natural beech forest"}, "21": {"cz": "Doubravy a dubohabřiny nepřírodní", "en": "Non-natural oak and oak-hornbeam forest"}, "22": {"cz": "Lužní a mokřadní lesy nepřírodní", "en": "Non-natural floodplain and wetland forest"}, "23": {"cz": "Porosty exotických dřevin", "en": "Exotic tree species stands"}, "24": {"cz": "Smrčiny nepřírodní", "en": "Non-natural spruce forest"}, "25": {"cz": "Les nepřírodní - neurčeno", "en": "Non-natural forest - unspecified"}, "26": {"cz": "Lužní a mokřadní lesy přírodní", "en": "Natural floodplain and wetland forest"}, "27": {"cz": "Doubravy a dubohabřiny přírodní", "en": "Natural oak and oak-hornbeam forest"}, "28": {"cz": "Suťové lesy přírodní", "en": "Natural ravine (scree) forest"}, "29": {"cz": "Bučiny přírodní", "en": "Natural beech forest"}, "30": {"cz": "Suché bory přírodní", "en": "Natural dry pine forest"}, "31": {"cz": "Smrčiny přírodní", "en": "Natural spruce forest"}, "32": {"cz": "Rašelinné lesy přírodní", "en": "Natural peat/bog forest"}, "33": {"cz": "Kosodřevina přírodní", "en": "Natural dwarf pine (krummholz)"}, "34": {"cz": "Křoviny přírodní", "en": "Natural scrub/shrubland"}, "35": {"cz": "Kosodřevina nepůvodní", "en": "Non-native dwarf pine"}, "36": {"cz": "Křoviny nepůvodní", "en": "Non-native scrub/shrubland"}};

function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return [h * 360, s * 100, l * 100];
}

// Subcategory slice colors are shades of the parent bucket's own color --
// forest breakdown stays in greens, agricultural in golds/yellows, grassland
// in yellow-green, urban in grays -- instead of an arbitrary rainbow, so the
// chart reads as "part of the same category" rather than unrelated classes.
function subcatColor(bucketKey, i, n) {
  const [h, s] = hexToHsl(BUCKET_COLORS[bucketKey] || "#888888");
  const lo = 26, hi = 70;
  const l = n > 1 ? lo + ((hi - lo) * i) / (n - 1) : (lo + hi) / 2;
  const satAdj = s < 5 ? 0 : Math.max(30, Math.min(70, s));
  return "hsl(" + Math.round(h) + ", " + Math.round(satAdj) + "%, " + Math.round(l) + "%)";
}

const I18N = {
  cz: {
    title: "Portál zdraví krajiny – indikátory regionální ekosystémové integrity",
    mode_current: "Roční přehled",
    mode_change: "Změna v čase (2017–2025)",
    display_label: "Zobrazit:",
    year_label: "Rok",
    from_label: "Od:",
    to_label: "Do:",
    raster_label: "Rastrové vrstvy",
    raster_none: "Žádná",
    raster_health: "Index ekosystémové integrity (IEI)",
    raster_photo: "Fotosyntetický potenciál",
    raster_cooling: "Chladicí schopnost vegetace",
    raster_hetero: "Krajinná pestrost",
    raster_trend: "Změna v čase (2017–2025)",
    panel_placeholder: "Klikněte na ORP (obec s rozšířenou působností) na mapě pro zobrazení detailu.",
    dominant_class: "Dominantní třída",
    health_index: "Index ekosystémové integrity (IEI)",
    orp_code: "Kód ORP",
    value_in_year: "Hodnota v roce",
    neighbor_median: "Medián sousedů",
    vs_neighbors: "Vs. sousedé",
    pp_unit: "p. b.",
    above_by: "nad o",
    below_by: "pod o",
    yoy: "Meziroční změna",
    since: "od",
    na: "n/a",
    compare_years_title: "Časový rozsah",
    composition_title: "Třídy krajinného povrchu",
    history_title: "{PARAM} 2017–2025 — {ORP}",
    trend_title: "Lineární trend 2017–2025",
    trend_slope: "Sklon (za rok)",
    trend_significance: "Statistická významnost",
    significant: "významný",
    not_significant: "nevýznamný",
    trend_note: "OLS regrese + Theil-Sen (odolný vůči odlehlým hodnotám)",
    leaderboard_title: "ORP s největší změnou {PARAM} během {FROM}–{TO}",
    biggest_decline: "Největší pokles",
    biggest_improvement: "Největší nárůst",
    ranking_title: "{PARAM} v roce {YEAR} – pořadí ORP",
    lowest_values: "Nejnižší hodnoty",
    highest_values: "Nejvyšší hodnoty",
    change_note: "Rozdíl hodnot IEI mezi rokem {TO} a {FROM} v procentních bodech ({TO} − {FROM}). Červená = pokles, modrá = nárůst.",
    values_note: "IEI za rok {YEAR} (0–100 %), průměr hodnot v ORP{FILTER}.",
    click_hint: "(klikněte pro detail)",
    no_data: "Chybí data",
    legend_dominant: "Dominantní třída",
    legend_health: "IEI (0–100 %)",
    legend_class: "vs. medián sousedů",
    legend_change: "Změna {PARAM}, {FROM}–{TO}",
    below_neighbors: "Pod sousedy",
    near_neighbors: "Blízko sousedům",
    above_neighbors: "Nad sousedy",
    decline: "Pokles",
    no_change: "Beze změny",
    improvement: "Nárůst",
    share_of_area: "podíl plochy",
    raster_legend_low: "Nižší hodnoty",
    raster_legend_high: "Vyšší hodnoty",
    contribution_title: "Příspěvek tříd krajinného povrchu k IEI",
    untapped_potential: "Nevyužitý potenciál",
    subcategory_title: "Složení třídy krajinného povrchu: {LABEL}",
    subcategory_other: "Ostatní",
    legend_class_info: "Porovnání s mediánem přímo sousedících ORP; sytost barvy odpovídá velikosti odchylky od tohoto mediánu.",
    back_to_national: "Zpět na Českou republiku",
    transparency_label: "Průhlednost",
    region_median: "Krajský medián",
    vs_region: "vůči krajskému mediánu",
    national_sub: "Celostátní přehled",
    region_too_small: "V tomto kraji není dostatek dalších ORP pro srovnání.",
    trend_summary: "Za posledních 9 let (2017–2025): {LABEL} — změna o",
    trend_summary_suffix: "ročně.",
    trend_summary_national: "Za posledních 9 let (2017–2025) se celostátní ekosystémová integrita měnila o",
    comparison_desc: "Srovnání níže vychází z mediánu ostatních ORP ve stejném kraji",
    index_in_year: "IEI v roce",
    viewing_label: "Zobrazeno:",
    area_of: "Plocha:",
    total_area_label: "Celková plocha ORP",
    ha_unit: "ha",
    tour_button: "Prohlídka rastrů",
    tour_prev: "Předchozí",
    tour_next: "Další",
    tour_1_title: "Ukazatel: Index ekosystémové integrity (IEI)",
    tour_1_desc: "Kompozitní ukazatel celkového zdraví vegetace, její produktivity, schopnosti čerpat vodu z půdy a chladit a její pestrosti. Vytvořili jsme ho vypočtením průměrné hodnoty z tří dále uvedených ukazatelů. V mapě červené hodnoty představují místa s nízkými hodnotami a modré místa s vysokými.",
    tour_2_title: "Ukazatel: Fotosyntetický potenciál",
    tour_2_desc: "Schopnost rostlin zachytávat sluneční záření během fotosyntézy. Je přímo úměrné množství potravin, krmiv, sena a dřeva, které na daném místě v průběhu roku vyroste. V mapě zelená barva představuje vysokou hodnotu fotosyntetického potenciálu a červená hodnotu nízkou.",
    tour_3_title: "Ukazatel: Chladicí schopnost vegetace",
    tour_3_desc: "Celkový roční počet stupňů Celsia, o které rostliny snížily povrchovou teplotu díky evapotranspiraci ve srovnání s povrchem bez vegetace. Během horkého dne může zdravý les snížit povrchovou teplotu o 20 a více stupňů Celsia. V mapě teplé barvy signalizují nízkou schopnost rostlin chladit a studené barvy hodnoty vysoké.",
    tour_4_title: "Ukazatel: Krajinná pestrost",
    tour_4_desc: "Druhová, věková a prostorová pestrost vegetace. Je opakem jednotvárných typů využití jako jsou například pole nebo souvislá zástavba. V mapě světlé barvy značí vysokou krajinnou pestrost a tmavé barvy hodnoty nízké.",
    tour_5_title: "Příklad: Zeleň ve městě",
    tour_5_desc: "Městská zeleň, zejména parky a vzájemně propojená zelená infrastruktura poskytuje nejenom místo pro oddych a kousek přírody ve městě, ale také ochlazuje a zvlhčuje prostředí, zadržuje vodu, stíní, čistí vzduch, poutá CO2 a podporuje biodiverzitu. Povšimněte si rozdílu hodnot všech ukazatelů mezi zástavbou a parkovými plochami.",
    tour_6_title: "Příklad: Povrchový uhelný důl",
    tour_6_desc: "Povrchové uhelné doly pokrývají významnou plochu naší země. Na snímcích ze satelitu tyto plochy výrazně vyčnívají. Povrchové doly neplní žádnou z ekosystémových funkcí krajiny, jsou bez života a zatížené škodlivými látkami. Způsobují ohřívání krajiny, znečištění ovzduší a vod a mají silný negativní dopad na lidi, rostliny i živočichy.",
    tour_7_title: "Příklad: Pestrá krajina",
    tour_7_desc: "Kokořínsko je příkladem pestré a zdravé krajiny, která díky svému členitému reliéfu unikla intenzivnímu využívání člověkem. Přírodně cenné ekosystémy jsou rovnoměrně kombinované s maloplošným hospodařením, což vytváří jedinečnou identitu tohoto kulturního kraje a odráží se i ve vysokých hodnotách ukazatele Krajinné pestrosti.",
    tour_8_title: "Příklad: Příměstský les",
    tour_8_desc: "Praha je jedna velká výheň. Nachází uprostřed silně zastavěné a zemědělsky využívané plochy. Přírodní celky jako je Klánovický les proto představují obrovské bohatství. Jedná se o největší lesní celek na území hl. m. Prahy a pro velkou část Pražanů představuje útočiště před nepříjemným městským prostředím.",
    tour_9_title: "Příklad: Krajina širých lánů",
    tour_9_desc: "V létě roku 2021 byla oblast mezi jihomoravskými městy Hodonín a Břeclav zasažena nejsilnějším tornádem v novodobé české historii. Jen pár dní před tím vyplavila nedalekou obec Dolní Bojanovice blesková povodeň. Oblast dlouhodobě trpí suchem a silným větrem. Zdejší krajina je jednolitá a téměř bez krajinných prvků jako jsou remízky, mokřady a lesíky a což je dobře patrné z měření fotosyntetického potenciálu.",
    tour_10_title: "Příklad: Rybniční krajina",
    tour_10_desc: "Krajina Třeboňska je příkladem symbiózy přírody s člověkem. Původně bažinatá krajina byla člověkem během středověku přeměněna v produktivní a druhově pestrou rybniční krajinu. Lesy, mokřady, vesničky a rybníčky tvoří malebnou a pestrou mozaiku různorodých ekosystémů, které tvoří jedinečný charakter Třeboňska.",
    tour_11_title: "Příklad: Umírající les",
    tour_11_desc: "Těžko tomu věřit, ale národní park Česko Švýcarsko je téměř zcela pokryt smrkovými monokulturami. Správně by tu měly růst listnaté stromy, nepůvodním smrkům se zde již nedaří. Patří k místům nejvíce zasaženým kůrovcem v republice. Lesy NP jsou ve srovnání s okolními prokvetlé souškami a jako celek rostou jen velmi málo, což je patrné z měření ročního fotosyntetického potenciálu.",
    tour_trend_title: "Ukazatel: Změna v čase (2017–2025)",
    tour_trend_desc: "Namísto stavu v jediném roce ukazuje tato vrstva směr vývoje: pro každý pixel spočítáme sklon přímky proložené devíti ročními hodnotami Indexu ekosystémové integrity (2017–2025) a zobrazíme ho jako jedno číslo -- kladné (modré), pokud se stav dlouhodobě zlepšuje, záporné (červené), pokud se zhoršuje. Je to stejná metoda (OLS regrese), jakou dashboard používá pro trend jednotlivých ORP v postranním panelu, jen aplikovaná pixel po pixelu napříč celou republikou.",
    tour_decline1_title: "Příklad: Odumírající smrčiny na Šumavě a v Krušných horách",
    tour_decline1_desc: "Šumavské a krušnohorské pohraniční ORP (Vimperk, Prachatice, Sušice, Kaplice, Český Krumlov, Kraslice) patří k oblastem s vůbec nejstrmějším měřeným poklesem ekosystémové integrity v celém datasetu 2017–2025. Roli zde hraje kombinace sucha a kůrovcové kalamity, která postupně mění hospodářské smrkové porosty na uschlé nebo právě vytěžené plochy -- ubývá fotosyntetického potenciálu i chladicí schopnosti vegetace.",
    tour_decline2_title: "Příklad: Sokolovská hnědouhelná pánev",
    tour_decline2_desc: "Karlovarský kraj (Sokolov, Karlovy Vary, Cheb, Aš, Stříbro, Tachov) tvoří druhé, zcela odlišné ohnisko poklesu: namísto přírodní kalamity zde dlouhodobě působí těžba a úprava hnědého uhlí, rekultivace výsypek a rozšiřování zástavby. Zotavení vegetace po těžbě je pomalé, takže i zde patří naměřené hodnoty k nejstrměji klesajícím v republice.",
    hide_panel: "Skrýt panel",
    show_panel: "Zobrazit panel",
    about_button: "O datech",
    intro_eyebrow: "Index ekosystémové integrity (IEI)",
    intro_title: "O datech",
    intro_body1: "Dashboard zobrazuje Index ekosystémové integrity (IEI) pro každou obec s rozšířenou působností (ORP) v České republice, každoročně od roku 2017 do 2025. Index vychází ze tří nezávislých družicových ukazatelů -- fotosyntetického potenciálu, chladicí schopnosti vegetace a krajinné pestrosti -- které se kombinují do jedné souhrnné hodnoty.",
    intro_body2: "Nástroj je určený zemědělcům, lesníkům, poradcům, samosprávám i ochraně přírody jako podklad pro sledování stavu krajiny v čase a rozhodování o jejím lepším hospodaření.",
    intro_continue: "Pokračovat na dashboard",
    intro_reference: "Metodika: Zelený, J., Mercado-Bettín, D., & Müller, F. (2021). Towards the evaluation of regional ecosystem integrity using NDVI, brightness temperature and surface heterogeneity. Science of the Total Environment, 796, Article 148994.",
    intro_credits: "Vytvořilo Člověk v tísni -- Jakub Zelený (vedení metodiky, jakub.zeleny@peopleinneed.net), Alonso Gonzalez (vývoj), Vojtěch Andrš (GIS), Natálie Marsh (geokódování), Marcela Vorlíčková (UI), Klára Petrásková (koordinace projektu).",
    contact_button: "Kontakt",
    contact_eyebrow: "Kontakt",
    contact_title: "Máte otázku?",
    contact_body: "Pro dotazy k metodice, datům nebo spolupráci kontaktujte:",
    contact_name: "Jakub Zelený",
    contact_role: "vedení metodiky",
    contact_close: "Zavřít",
    search_placeholder: "Hledej ORP nebo kraj",
    search_no_results: "Nic nenalezeno",
    raster_clear_title: "Vypnout rastr",
    pp_unit_long: "p. b.",
    smallest_decrease: "Nejmenší pokles",
    smallest_increase: "Nejmenší nárůst",
    values_filter: " pro vybraný parametr a typ krajinného povrchu",
    cmp_above: "O {X} vyšší ve srovnání s krajským mediánem",
    cmp_below: "O {X} nižší ve srovnání s krajským mediánem",
    cmp_same: "Shodně s krajským mediánem",
    national_median: "Medián ČR",
    change_title: "Změna Indexu ekosystémové integrity mezi roky {FROM}–{TO}",
    change_title_param: "Změna IEI ({LABEL}) mezi roky {FROM}–{TO}",
    significance_note: "Statistická významnost sklonu závisí na použitém testu; podrobnosti jsou v informaci „i“.",
    help_button: "Nápověda",
    info_label: "Informace",
    info_what: "Co to je",
    info_how: "Jak to číst",
    info_source: "Zdroj a období",
    info_expert: "Pro odborníky",
    info_source_base: "Člověk v tísni; družicová data zpracovaná podle metodiky Zelený et al. (2021).",
    title_main: "Portál zdraví krajiny",
    title_sub: "indikátory regionální ekosystémové integrity",
    nav_map: "Mapa",
    nav_about: "O datech",
    nav_method: "Metodika",
    nav_data: "Data ke stažení",
    display_mode_label: "Režim zobrazení",
    parameter_label: "Parametr",
    reset_button: "Obnovit",
    apply_button: "Zobrazit",
    orp_word: "ORP",
    row_total_change: "Celková změna",
    row_vs_region: "Oproti krajskému mediánu",
    row_rank_change: "Pořadí podle změny",
    row_rank_level: "Pořadí podle hodnoty",
    rank_in_region: "{R}. z {N} v kraji",
    rank_in_country: "{R}. z {N}",
    section_change_title: "Změna {FROM}–{TO}",
    section_level_title: "{PARAM} v roce {YEAR}",
    chart_trend_title: "Lineární trend 2017–2025",
    chart_history_title: "Vývoj v čase 2017–2025",
    collapse_label: "Sbalit / rozbalit",
    method_eyebrow: "Metodika",
    method_title: "Jak se Index ekosystémové integrity počítá",
    method_h1: "Tři družicové ukazatele",
    method_p1: "Index ekosystémové integrity (IEI) kombinuje fotosyntetický potenciál, chladicí schopnost vegetace a krajinnou pestrost do jedné hodnoty na škále 0–100 %. Vyšší hodnota znamená vyšší ekosystémovou integritu. Metodika vychází z práce Zelený et al. (2021).",
    method_h2: "Od pixelů k ORP",
    method_p2: "Hodnoty ukazatelů se pro každý rok 2017–2025 zprůměrují v rámci čtyř tříd krajinného povrchu (les, zemědělská půda, travní porosty, zastavěné území). Celkové IEI obce s rozšířenou působností (ORP) je plošně vážený průměr těchto čtyř tříd. Neklasifikované plochy (voda, mokřady, holé skály) se do indexu nezapočítávají.",
    method_h3: "Změna a trend",
    method_p3: "Změna IEI je rozdíl IEI v koncovém a počátečním roce, vyjádřený v procentních bodech (p. b.). Lineární trend je sklon přímky proložené metodou nejmenších čtverců (OLS) devíti ročními hodnotami 2017–2025, v p. b. za rok. Popis statistického testu významnosti trendu bude doplněn.",
    method_h4: "Jak číst barvy",
    method_p4: "Mapa změny používá jednu škálu pro všechny změny: červená = pokles, bílá = beze změny, modrá = nárůst, symetricky kolem nuly. Mapa roční úrovně IEI má vlastní škálu odpovídající reálnému rozsahu hodnot v České republice a se škálou změny se nezaměňuje.",
    method_h5: "Zdroje",
    data_eyebrow: "Data ke stažení",
    data_title: "Stáhněte si data z portálu",
    data_intro: "Hodnoty, které portál zobrazuje, ve formátu CSV. Nic se nepřepočítává, soubory vznikají přímo ve vašem prohlížeči z dat zobrazených v portálu.",
    dl_levels_title: "Hodnoty IEI podle ORP a roku",
    dl_levels_desc: "Celkové IEI a čtyři třídy krajinného povrchu, 2017–2025, v % (škála 0–100).",
    dl_change_title: "Změna IEI podle ORP",
    dl_change_desc: "Rozdíl v procentních bodech (koncový rok − počáteční rok), nyní {FROM}–{TO}.",
    dl_trend_title: "Lineární trend podle ORP",
    dl_trend_desc: "Sklon lineárního trendu 2017–2025 v procentních bodech za rok.",
    dl_button: "Stáhnout CSV",
    data_note: "Soubory jsou v kódování UTF-8, oddělovač je čárka, desetinná tečka.",
    row_value: "Hodnota",
    per_year: "/rok",
    row_slope: "Roční sklon trendu",
    row_signif: "Statistická významnost",
    signif_yes: "významný (p = {P})",
    signif_no: "nevýznamný (p = {P})",
    slope_note: "Roční sklon není celková změna za období.",
  },
  en: {
    title: "Landscape Health Portal – Regional Ecosystem Integrity Indicators",
    mode_current: "Annual overview",
    mode_change: "Change over time (2017–2025)",
    display_label: "Display:",
    year_label: "Year",
    from_label: "From:",
    to_label: "To:",
    raster_label: "Raster layers",
    raster_none: "None",
    raster_health: "Index of Ecosystem Integrity (IEI)",
    raster_photo: "Photosynthetic potential",
    raster_cooling: "Vegetation cooling capacity",
    raster_hetero: "Landscape heterogeneity",
    raster_trend: "Change over time (2017–2025)",
    panel_placeholder: "Click an ORP (municipality with extended powers) on the map to see its detail.",
    dominant_class: "Dominant class",
    health_index: "Index of Ecosystem Integrity (IEI)",
    orp_code: "ORP code",
    value_in_year: "Value in",
    neighbor_median: "Neighbor median",
    vs_neighbors: "Vs. neighbors",
    pp_unit: "p.p.",
    above_by: "above by",
    below_by: "below by",
    yoy: "Year-over-year",
    since: "since",
    na: "n/a",
    compare_years_title: "Temporal range",
    composition_title: "Land cover classes",
    history_title: "{PARAM} 2017–2025 — {ORP}",
    trend_title: "Linear trend 2017–2025",
    trend_slope: "Slope (per year)",
    trend_significance: "Statistical significance",
    significant: "significant",
    not_significant: "not significant",
    trend_note: "OLS regression + Theil-Sen (robust to outliers)",
    leaderboard_title: "ORPs with the largest change in {PARAM} between {FROM} and {TO}",
    biggest_decline: "Largest decrease",
    biggest_improvement: "Largest increase",
    ranking_title: "{PARAM} in {YEAR} – ranking of ORPs",
    lowest_values: "Lowest values",
    highest_values: "Highest values",
    change_note: "Difference in IEI between {TO} and {FROM} in percentage points ({TO} − {FROM}). Red = decrease, blue = increase.",
    values_note: "IEI in {YEAR} (0–100%), mean value per ORP{FILTER}.",
    click_hint: "(click for detail)",
    no_data: "Missing data",
    legend_dominant: "Dominant class",
    legend_health: "IEI (0–100%)",
    legend_class: "vs. neighbor median",
    legend_change: "Change in {PARAM}, {FROM}–{TO}",
    below_neighbors: "Below neighbors",
    near_neighbors: "Near neighbors",
    above_neighbors: "Above neighbors",
    decline: "Decrease",
    no_change: "No change",
    improvement: "Increase",
    share_of_area: "share of area",
    raster_legend_low: "Lower values",
    raster_legend_high: "Higher values",
    contribution_title: "Contribution of land cover classes to IEI",
    untapped_potential: "Unused potential",
    subcategory_title: "Composition of land cover class: {LABEL}",
    subcategory_other: "Other",
    legend_class_info: "Compared to the median of directly bordering ORPs; color intensity reflects the size of the difference from that median.",
    back_to_national: "Back to Czech Republic",
    transparency_label: "Transparency",
    region_median: "Regional median",
    vs_region: "vs. regional median",
    national_sub: "National overview",
    region_too_small: "Not enough other ORPs in this region for a ranking.",
    trend_summary: "Over the last 9 years (2017–2025), {LABEL} has changed by",
    trend_summary_suffix: "per year.",
    trend_summary_national: "Over the last 9 years (2017–2025), national Ecosystem Integrity has changed by",
    comparison_desc: "The comparison below is based on the median of other ORPs within the same kraj",
    index_in_year: "IEI in",
    viewing_label: "Viewing:",
    area_of: "Area:",
    total_area_label: "Total ORP area",
    ha_unit: "ha",
    tour_button: "Raster tour",
    tour_prev: "Previous",
    tour_next: "Next",
    tour_1_title: "Indicator: Index of Ecosystem Integrity (IEI)",
    tour_1_desc: "A composite indicator of vegetation's overall health, its productivity, its ability to draw water from the soil and cool its surroundings, and its diversity. We created it by averaging the three indicators listed below. On the map, red values represent low scores and blue values represent high scores.",
    tour_2_title: "Indicator: Photosynthetic Potential",
    tour_2_desc: "Plants' ability to capture solar radiation during photosynthesis. It is directly proportional to the amount of food, feed, hay, and wood that grows in a given place over the year. On the map, green represents high photosynthetic potential and red represents low.",
    tour_3_title: "Indicator: Vegetation Cooling Capacity",
    tour_3_desc: "The total annual number of degrees Celsius by which plants lowered surface temperature through evapotranspiration, compared to a surface without vegetation. On a hot day, a healthy forest can lower the surface temperature by 20 degrees Celsius or more. On the map, warm colors signal a low cooling capacity and cool colors signal a high one.",
    tour_4_title: "Indicator: Landscape Heterogeneity",
    tour_4_desc: "The species, age, and spatial diversity of vegetation. It is the opposite of monotonous land uses such as fields or continuous built-up areas. On the map, light colors indicate high landscape heterogeneity and dark colors indicate low.",
    tour_5_title: "Example: Urban Greenery",
    tour_5_desc: "Urban greenery, especially parks and interconnected green infrastructure, provides not only a place to relax and a bit of nature in the city, but also cools and humidifies the environment, retains water, provides shade, cleans the air, captures CO2, and supports biodiversity. Notice the difference in indicator values between built-up areas and park areas.",
    tour_6_title: "Example: Open-Pit Coal Mine",
    tour_6_desc: "Open-pit coal mines cover a significant area of our country. In satellite imagery these areas stand out clearly. Open-pit mines fulfill none of the landscape's ecosystem functions -- they are lifeless and burdened with harmful substances. They cause the landscape to heat up, pollute air and water, and have a strong negative impact on people, plants, and animals.",
    tour_7_title: "Example: A Diverse Landscape",
    tour_7_desc: "The Kokořínsko region is an example of a diverse and healthy landscape that, thanks to its rugged terrain, has escaped intensive human use. Ecologically valuable ecosystems are evenly combined with small-scale farming, giving this cultural landscape its unique identity -- reflected in high Landscape Heterogeneity values.",
    tour_8_title: "Example: A Suburban Forest",
    tour_8_desc: "Prague is one big heat trap, sitting amid heavily built-up and agriculturally used land. Natural areas like Klánovice Forest are therefore an enormous asset. It is the largest forested area within Prague, and for a great many Praguers it is a refuge from an unpleasant urban environment.",
    tour_9_title: "Example: A Landscape of Vast Fields",
    tour_9_desc: "In the summer of 2021, the area between the South Moravian towns of Hodonín and Břeclav was hit by the strongest tornado in modern Czech history. Just a few days earlier, a flash flood had struck the nearby village of Dolní Bojanovice. The region has long suffered from drought and strong winds. Its landscape is uniform and nearly devoid of landscape features such as field margins, wetlands, and small woodlands -- clearly visible in photosynthetic potential measurements.",
    tour_10_title: "Example: A Fishpond Landscape",
    tour_10_desc: "The Třeboň region is an example of a symbiosis between nature and people. Originally a marshy landscape, it was transformed by humans during the Middle Ages into a productive, species-rich fishpond landscape. Forests, wetlands, villages, and ponds form a picturesque, diverse mosaic of ecosystems that gives the Třeboň region its unique character.",
    tour_11_title: "Example: A Dying Forest",
    tour_11_desc: "Hard as it is to believe, Bohemian Switzerland National Park is almost entirely covered by spruce monocultures. Deciduous trees should rightfully grow here -- the non-native spruce no longer thrives. It is among the areas most affected by bark beetle in the country. Compared to surrounding areas, the park's forests are riddled with dead standing trees and, as a whole, show very little growth, which is evident in annual photosynthetic potential measurements.",
    tour_trend_title: "Indicator: Change over time (2017–2025)",
    tour_trend_desc: "Instead of a single year's snapshot, this layer shows the direction of change: for every pixel we fit a line through nine years of Index of Ecosystem Integrity values (2017–2025) and reduce it to one number -- positive (blue) where conditions have been improving over time, negative (red) where they've been declining. It's the same method (OLS regression) the dashboard already uses for each ORP's own trend in the side panel, just applied pixel by pixel across the whole country.",
    tour_decline1_title: "Example: Dying Spruce Stands in Šumava and the Krušné Hory",
    tour_decline1_desc: "The Šumava and Krušné hory border ORPs (Vimperk, Prachatice, Sušice, Kaplice, Český Krumlov, Kraslice) are among the areas with the steepest measured Ecosystem Integrity decline in the entire 2017–2025 dataset. A combination of drought and bark-beetle outbreaks is gradually turning managed spruce stands into dead or freshly logged clearings -- both photosynthetic potential and vegetation cooling capacity are dropping as a result.",
    tour_decline2_title: "Example: The Sokolov Brown-Coal Basin",
    tour_decline2_desc: "Karlovy Vary Region (Sokolov, Karlovy Vary, Cheb, Aš, Stříbro, Tachov) is a second, very different pocket of decline: instead of a natural calamity, this one is driven by long-running lignite mining and processing, slow spoil-heap reclamation, and expanding built-up land. Vegetation recovery after mining is slow, so measured values here are also among the steepest-declining in the country.",
    hide_panel: "Hide panel",
    show_panel: "Show panel",
    about_button: "About data",
    intro_eyebrow: "Index of Ecosystem Integrity (IEI)",
    intro_title: "About data",
    intro_body1: "This dashboard shows the Index of Ecosystem Integrity (IEI) for every municipality with extended powers (ORP) in the Czech Republic, year by year from 2017 to 2025. The index is built from three independent satellite-derived indicators -- photosynthetic potential, vegetation cooling capacity, and landscape heterogeneity -- combined into a single composite value.",
    intro_body2: "It's intended for farmers, foresters, agricultural advisors, local government, and conservation groups as a way to track landscape condition over time and inform better land management.",
    intro_continue: "Continue to dashboard",
    intro_reference: "Methodology: Zelený, J., Mercado-Bettín, D., & Müller, F. (2021). Towards the evaluation of regional ecosystem integrity using NDVI, brightness temperature and surface heterogeneity. Science of the Total Environment, 796, Article 148994.",
    intro_credits: "Built by People in Need -- Jakub Zelený (methodology lead, jakub.zeleny@peopleinneed.net), Alonso Gonzalez (development), Vojtěch Andrš (GIS), Natálie Marsh (geocoding), Marcela Vorlíčková (UI), Klára Petrásková (project coordination).",
    contact_button: "Contact",
    contact_eyebrow: "Contact",
    contact_title: "Have a question?",
    contact_body: "For questions about the methodology, the data, or collaboration, reach out to:",
    contact_name: "Jakub Zelený",
    contact_role: "methodology lead",
    contact_close: "Close",
    search_placeholder: "Search ORP or region",
    search_no_results: "No matches",
    raster_clear_title: "Turn off raster",
    pp_unit_long: "percentage points",
    smallest_decrease: "Smallest decrease",
    smallest_increase: "Smallest increase",
    values_filter: " for the selected parameter and land cover type",
    cmp_above: "{X} above the regional median",
    cmp_below: "{X} below the regional median",
    cmp_same: "Same as the regional median",
    national_median: "National median",
    change_title: "Change in the Index of Ecosystem Integrity between {FROM} and {TO}",
    change_title_param: "Change in IEI ({LABEL}) between {FROM} and {TO}",
    significance_note: "The statistical significance of the slope depends on the test used; see the “i” information for details.",
    help_button: "Help",
    info_label: "Information",
    info_what: "What it is",
    info_how: "How to read it",
    info_source: "Data source and period",
    info_expert: "For experts",
    info_source_base: "People in Need; satellite data processed following Zelený et al. (2021).",
    title_main: "Landscape Health Portal",
    title_sub: "Regional Ecosystem Integrity Indicators",
    nav_map: "Map",
    nav_about: "About data",
    nav_method: "Methodology",
    nav_data: "Data downloads",
    display_mode_label: "View mode",
    parameter_label: "Parameter",
    reset_button: "Reset",
    apply_button: "Show",
    orp_word: "ORP",
    row_total_change: "Total change",
    row_vs_region: "Versus the regional median",
    row_rank_change: "Rank by change",
    row_rank_level: "Rank by value",
    rank_in_region: "{R} of {N} in region",
    rank_in_country: "{R} of {N}",
    section_change_title: "Change {FROM}–{TO}",
    section_level_title: "{PARAM} in {YEAR}",
    chart_trend_title: "Linear trend 2017–2025",
    chart_history_title: "Values over time 2017–2025",
    collapse_label: "Collapse / expand",
    method_eyebrow: "Methodology",
    method_title: "How the Index of Ecosystem Integrity is calculated",
    method_h1: "Three satellite-derived indicators",
    method_p1: "The Index of Ecosystem Integrity (IEI) combines photosynthetic potential, vegetation cooling capacity and landscape heterogeneity into a single value on a 0–100% scale. A higher value means higher ecosystem integrity. The method follows Zelený et al. (2021).",
    method_h2: "From pixels to ORPs",
    method_p2: "For each year 2017–2025, indicator values are averaged within four land cover classes (forest, agricultural land, grassland, urban areas). The overall IEI of a municipality with extended powers (ORP) is the area-weighted average of these four classes. Unclassified land (water, wetland, bare rock) is not counted in the index.",
    method_h3: "Change and trend",
    method_p3: "The change in IEI is the IEI in the end year minus the IEI in the start year, expressed in percentage points (p.p.). The linear trend is the slope of an ordinary least squares (OLS) line through the nine yearly values 2017–2025, in p.p. per year. A description of the statistical significance test will be added.",
    method_h4: "How to read the colours",
    method_p4: "The change map uses one scale for all change: red = decrease, white = no change, blue = increase, symmetric around zero. The annual IEI map has its own scale matching the real range of values in Czechia and must not be confused with the change scale.",
    method_h5: "Sources",
    data_eyebrow: "Data downloads",
    data_title: "Download the portal's data",
    data_intro: "The values shown in the portal, as CSV files. Nothing is recalculated: the files are built in your browser from the data displayed in the portal.",
    dl_levels_title: "IEI values by ORP and year",
    dl_levels_desc: "Overall IEI and the four land cover classes, 2017–2025, in % (0–100 scale).",
    dl_change_title: "Change in IEI by ORP",
    dl_change_desc: "Difference in percentage points (end year − start year), currently {FROM}–{TO}.",
    dl_trend_title: "Linear trend by ORP",
    dl_trend_desc: "Slope of the linear trend 2017–2025 in percentage points per year.",
    dl_button: "Download CSV",
    data_note: "Files are UTF-8 encoded, comma-separated, with a decimal point.",
    row_value: "Value",
    per_year: "/yr",
    row_slope: "Annual trend slope",
    row_signif: "Statistical significance",
    signif_yes: "significant (p = {P})",
    signif_no: "not significant (p = {P})",
    slope_note: "The annual slope is not the total change over the period.",
  },
};

// Real symbology pulled directly from the client's own ArcGIS Pro .lyrx layer
// files (CIMRasterStretchColorizer color ramps) for each service, so these
// gradients are an exact match to how the layers are actually rendered --
// not a guess.
//
// Legend labels are 0%/100% for all four snapshot rasters (health, photo,
// cooling, hetero) instead of each one's own native units (some of which
// were raw model units like "46 591", others qualitative "Lower/Higher"
// text with no number at all) -- per client feedback that the mismatched
// units read as inconsistent against the rest of the platform, which is
// percentage-based throughout. This is a label-only change, not a
// recoloring: the low end of a color ramp is *by definition* 0% of that
// ramp's own range and the high end is 100%, true whether the underlying
// ArcGIS stretch uses fixed constants (photo, hetero) or a live stats-based
// minimum (health, cooling) -- so this holds regardless of which case a
// given layer is, and needs no reprocessing of the source rasters. It does
// mean the number shown is this layer's own relative range, not a
// cross-layer-comparable absolute figure -- same caveat that already
// applies to the dashboard's own Ecosystem Integrity legend (0%/100% there
// isn't the theoretical bound either, see HEALTH_DOMAIN).
const RASTER_LEGENDS = {
  health: {
    stops: ["rgb(165,0,38)", "rgb(215,48,39)", "rgb(244,109,67)", "rgb(254,224,144)", "rgb(255,255,190)", "rgb(224,243,248)", "rgb(116,173,209)", "rgb(69,117,180)", "rgb(49,54,149)"],
    lowText: "0%", highText: "100%",
  },
  photo: {
    stops: ["rgb(255,0,0)", "rgb(255,211,127)", "rgb(255,255,115)", "rgb(112,168,0)", "rgb(0,104,55)"],
    lowText: "0%", highText: "100%",
  },
  cooling: {
    stops: ["rgb(0,77,168)", "rgb(0,112,255)", "rgb(115,178,255)", "rgb(0,255,197)", "rgb(255,255,115)", "rgb(255,211,127)", "rgb(255,170,0)", "rgb(230,76,0)", "rgb(168,56,0)"],
    lowText: "0%", highText: "100%",
  },
  hetero: {
    stops: ["#440154", "#414487", "#2a788e", "#22a884", "#7ad151", "#fde725"],
    lowText: "0%", highText: "100%",
  },
  trend: {
    // Display-only softened version: same orange -> white -> green logic,
    // zero still landing at 57.14% (its true position within the labeled
    // -0.072/+0.054 range), but with a much wider, gradual blend instead
    // of sharp bands -- purely cosmetic on the legend swatch.
    // Change-over-time legend (brief C5/C6): continuous red-white-blue,
    // zero still at 57.14% of the ramp; no numeric range, only the
    // end labels "Decrease" / "Increase".
    stopsCss: CHG_GRADIENT_CSS,
    lowKey: "decline", midText: "0", highKey: "improvement", mValue: TREND_M,
    infoKey: "change_map",
  },
};

let lang = "cz";
function T(key) { return (I18N[lang] && I18N[lang][key]) || key; }
function label(key) { return LABELS[key] ? LABELS[key][lang] : key; }

// ---------------------------------------------------------------------
// Information popovers (brief G4). One lowercase "i" in a circle
// everywhere; opens on click/tap or keyboard (Enter/Space), never on hover
// alone. Every popover has the same structure: what it is / how to read it /
// data source and period / for experts (collapsible, only where the method
// is documented -- nothing here is invented).
// ---------------------------------------------------------------------
const INFO = {
  iei: {
    what: { cz: "Index ekosystémové integrity (IEI) je plošně vážený průměr hodnot za les, zemědělskou půdu, travní porosty a zastavěné území v dané ORP.", en: "The Index of Ecosystem Integrity (IEI) is an area-weighted average over forest, agricultural land, grassland and urban areas within the ORP." },
    how: { cz: "Vyšší hodnoty znamenají vyšší ekosystémovou integritu (škála 0–100 %).", en: "Higher values mean higher ecosystem integrity (0–100% scale)." },
    period: { cz: "Vybraný rok (2017–2025).", en: "The selected year (2017–2025)." },
    expert: { cz: "IEI kombinuje tři družicové ukazatele: fotosyntetický potenciál, chladicí schopnost vegetace a krajinnou pestrost (Zelený et al., 2021).", en: "The IEI combines three satellite-derived indicators: photosynthetic potential, vegetation cooling capacity and landscape heterogeneity (Zelený et al., 2021)." },
  },
  health_legend: {
    what: { cz: "Barevná škála IEI na mapě ORP.", en: "The colour scale of the IEI on the ORP map." },
    how: { cz: "Škála odpovídá reálnému rozsahu hodnot napříč ORP v Česku, nikoli celému teoretickému rozsahu 0–100 %; žádná ORP nedosahuje krajních hodnot. Červená = nižší, zelená = vyšší integrita.", en: "The scale reflects the real range of values across Czech ORPs, not the full theoretical 0–100% range; no ORP reaches either extreme. Red = lower, green = higher integrity." },
    period: { cz: "Vybraný rok (2017–2025).", en: "The selected year (2017–2025)." },
  },
  dominant: {
    what: { cz: "Třída krajinného povrchu zabírající největší podíl plochy dané ORP.", en: "The land cover class covering the largest share of the ORP's area." },
    how: { cz: "Barva odpovídá třídě (les, zemědělská půda, travní porosty, zastavěné území).", en: "The colour corresponds to the class (forest, agricultural land, grassland, urban areas)." },
    period: { cz: "Vybraný rok (2017–2025).", en: "The selected year (2017–2025)." },
  },
  composition: {
    what: { cz: "Podíl plochy ORP zabraný jednotlivými třídami krajinného povrchu (les, zemědělská půda, travní porosty, zastavěné území).", en: "The share of the ORP's area covered by each land cover class (forest, agricultural land, grassland, urban areas)." },
    how: { cz: "Neklasifikované plochy (vodní, mokřadní, skalní) nejsou zahrnuty, proto součet nemusí činit přesně 100 %.", en: "Unclassified land (water, wetland, bare rock) is not included, so the segments may not add up to exactly 100%." },
    period: { cz: "Vybraný rok (2017–2025).", en: "The selected year (2017–2025)." },
  },
  contribution: {
    what: { cz: "Příspěvek každé třídy krajinného povrchu k IEI dané ORP.", en: "The contribution of each land cover class to the ORP's IEI." },
    how: { cz: "Součet příspěvků odpovídá IEI uvedenému výše; zbytek do 100 % je „nevyužitý potenciál“ (šrafovaná část).", en: "The segments sum to the IEI shown above; the remainder up to 100% is “unused potential” (hatched segment)." },
    period: { cz: "Vybraný rok (2017–2025).", en: "The selected year (2017–2025)." },
    expert: { cz: "Vážený příspěvek = IEI dané třídy × její podíl na ploše ORP.", en: "Weighted contribution = the class's IEI × its share of the ORP area." },
  },
  subcategory: {
    what: { cz: "Jemnější rozdělení vybrané třídy krajinného povrchu podle typu porostu nebo využití (např. u lesa přírodní vs. nepřírodní, smrčiny, bučiny).", en: "A finer breakdown of the selected land cover class by stand or land-use type (for forest, e.g. natural vs. non-natural, spruce, beech)." },
    how: { cz: "Zobrazeno je 6 nejvýznamnějších tříd, zbytek je sloučen do „Ostatní“.", en: "The 6 largest types are shown; the rest are grouped as “Other”." },
    period: { cz: "Klasifikace krajinného povrchu; neliší se podle roku.", en: "Land cover classification; it does not vary by year." },
  },
  history_current: {
    what: { cz: "Vývoj IEI v čase pro každou třídu krajinného povrchu a pro celé ORP.", en: "The IEI over time for each land cover class and for the whole ORP." },
    how: { cz: "Zvýrazněná třída je vykreslena silněji a vyplněna, ostatní jsou zeslabené. Přerušovaná čára je celkové IEI.", en: "The featured class is drawn bolder and filled in; the others are dimmed. The dashed line is the overall IEI." },
    period: { cz: "2017–2025, hodnoty po rocích.", en: "2017–2025, yearly values." },
  },
  history_change: {
    what: { cz: "Vývoj vybrané hodnoty IEI po rocích spolu s lineárním trendem.", en: "The selected IEI value year by year, with its linear trend." },
    how: { cz: "Přerušovaná červená čára je lineární trend; strmější sklon znamená rychlejší změnu. Karta výše ukazuje rozdíl jen mezi zvolenými roky, graf celý průběh.", en: "The dashed red line is the linear trend; a steeper slope means faster change. The card above shows the difference between the chosen years only, the chart shows the whole path." },
    period: { cz: "2017–2025, hodnoty po rocích.", en: "2017–2025, yearly values." },
    expert: { cz: "Lineární trend je proložen metodou nejmenších čtverců (OLS) devíti ročními hodnotami. Významnost sklonu: dvoustranný t-test (n = 9, 7 stupňů volnosti), významný při p < 0,05. Kontrola odolnosti: Theilův–Senův sklon.", en: "The linear trend is an ordinary least squares (OLS) fit through the nine yearly values. Significance of the slope: a two-sided t-test (n = 9, 7 degrees of freedom), significant at p < 0.05. Robustness check: Theil–Sen slope." },
  },
  delta: {
    what: { cz: "Rozdíl IEI mezi počátečním a koncovým rokem zvoleného časového rozsahu.", en: "The difference in IEI between the start and end year of the selected temporal range." },
    how: { cz: "Vyjádřeno v procentních bodech (p. b.). Kladná hodnota (modrá) = nárůst, záporná (červená) = pokles.", en: "Expressed in percentage points (p.p.). A positive value (blue) = increase, a negative value (red) = decrease." },
    period: { cz: "Roky zvolené v části „Časový rozsah“.", en: "The years chosen under “Temporal range”." },
    expert: { cz: "Roční sklon trendu je sklon lineární regrese (OLS) devíti ročních hodnot 2017–2025. Významnost: dvoustranný t-test sklonu (p-hodnota z regrese, n = 9, 7 stupňů volnosti); „významný“ znamená p < 0,05. R² udává, jak dobře přímka odpovídá hodnotám. Pro kontrolu odolnosti vůči odlehlým hodnotám se u ORP počítá i Theilův–Senův sklon.", en: "The annual trend slope is the slope of a linear regression (OLS) through the nine yearly values 2017–2025. Significance: a two-sided t-test of the slope (p-value from the regression, n = 9, 7 degrees of freedom); “significant” means p < 0.05. R² shows how well the line fits the values. As a check against outliers, a Theil–Sen slope is also computed for ORPs." },
  },
  compare: {
    what: { cz: "Volba počátečního a koncového roku pro statistiky změny.", en: "The choice of start and end year for the change statistics." },
    how: { cz: "Ovlivňuje pouze režim „Změna v čase“ (kartu změny, graf a žebříčky). Neovlivňuje režim „Roční přehled“.", en: "It only affects the “Change over time” mode (change card, chart and ranking lists), not the “Annual overview” mode." },
    period: { cz: "2017–2025.", en: "2017–2025." },
  },
  leaderboard_levels: {
    what: { cz: "ORP seřazené podle hodnoty IEI ve vybraném roce, nejlepší nahoře.", en: "ORPs ordered by their IEI value in the selected year, best first." },
    how: { cz: "Nejedná se o hodnotící žebříček, jde o seřazení naměřených hodnot. Po výběru ORP se řadí ORP ve stejném kraji.", en: "This is an ordering of measured values, not a performance ranking. Once an ORP is selected, the list covers the ORPs of the same region." },
    period: { cz: "Vybraný rok (2017–2025).", en: "The selected year (2017–2025)." },
  },
  leaderboard_change: {
    what: { cz: "ORP seřazené podle změny IEI mezi zvolenými roky, nejpříznivější vývoj nahoře.", en: "ORPs ordered by their change in IEI between the chosen years, most favourable first." },
    how: { cz: "Hodnota je IEI v koncovém roce minus IEI v počátečním roce, v procentních bodech. Modrá = nárůst, červená = pokles, bez ohledu na pořadí v seznamu.", en: "The value is the IEI in the end year minus the IEI in the start year, in percentage points. Blue = increase, red = decrease, regardless of the position in the list." },
    period: { cz: "Roky zvolené v části „Časový rozsah“.", en: "The years chosen under “Temporal range”." },
  },
  change_map: {
    what: { cz: "Změna IEI mezi lety 2017 a 2025 v každém pixelu mapy.", en: "The change in the IEI between 2017 and 2025 in each map pixel." },
    how: { cz: "Červená = pokles, bílá = beze změny, modrá = nárůst. Čím sytější barva, tím silnější změna.", en: "Red = decrease, white = no change, blue = increase. The more saturated the colour, the stronger the change." },
    period: { cz: "2017–2025.", en: "2017–2025." },
    expert: { cz: "Pro každý pixel je počítán sklon lineární regrese (OLS) devíti ročních hodnot IEI.", en: "For each pixel, the slope of a linear regression (OLS) through the nine yearly IEI values is computed." },
  },
};

function infoIcon(key) {
  return '<button type="button" class="info-icon" data-info="' + key + '" aria-label="' + T("info_label") + '" aria-haspopup="dialog">i</button>';
}

let infoPopoverEl = null;
let infoPopoverOwner = null;
function closeInfoPopover() {
  if (infoPopoverEl) { infoPopoverEl.remove(); infoPopoverEl = null; }
  if (infoPopoverOwner) { infoPopoverOwner.setAttribute("aria-expanded", "false"); infoPopoverOwner = null; }
}
function openInfoPopover(btn) {
  const key = btn.getAttribute("data-info");
  const d = INFO[key];
  if (!d) return;
  closeInfoPopover();
  const el = document.createElement("div");
  el.id = "info-popover";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", T("info_label"));
  let html = '<h4>' + T("info_what") + "</h4><p>" + d.what[lang] + "</p>" +
    "<h4>" + T("info_how") + "</h4><p>" + d.how[lang] + "</p>" +
    "<h4>" + T("info_source") + "</h4><p>" + T("info_source_base") + " " + d.period[lang] + "</p>";
  if (d.expert) html += "<details><summary>" + T("info_expert") + "</summary><p>" + d.expert[lang] + "</p></details>";
  html += '<button type="button" class="info-popover-close" aria-label="' + (lang === "cz" ? "Zavřít" : "Close") + '">&times;</button>';
  el.innerHTML = html;
  document.body.appendChild(el);
  const r = btn.getBoundingClientRect();
  const w = el.offsetWidth, h = el.offsetHeight;
  let left = Math.min(Math.max(8, r.left - 20), window.innerWidth - w - 8);
  let top = r.bottom + 8;
  if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 8);
  el.style.left = left + "px";
  el.style.top = top + "px";
  btn.setAttribute("aria-expanded", "true");
  infoPopoverEl = el;
  infoPopoverOwner = btn;
  el.querySelector(".info-popover-close").addEventListener("click", function () { closeInfoPopover(); btn.focus(); });
}
// Capture phase so it still works inside Leaflet controls, which stop click
// propagation to the document.
document.addEventListener("click", function (e) {
  const icon = e.target.closest ? e.target.closest(".info-icon[data-info]") : null;
  if (icon) {
    e.preventDefault();
    if (infoPopoverOwner === icon) closeInfoPopover();
    else openInfoPopover(icon);
    return;
  }
  if (infoPopoverEl && !(e.target.closest && e.target.closest("#info-popover"))) closeInfoPopover();
}, true);
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape" && infoPopoverEl) { const o = infoPopoverOwner; closeInfoPopover(); if (o) o.focus(); }
});

let mode = "current"; // "current" | "change"
let displayKey = "I"; // "I" | "dominant" | "F" | "A" | "G" | "U"
window.__displayKey = () => displayKey;
let currentYearIdx = YEARS.length - 1;
let currentYear = YEARS[currentYearIdx];
let fromYear = YEARS[0];
let toYear = YEARS[YEARS.length - 1];
// Two-level view (national / per-ORP), per client request: the dashboard
// opens on a synthetic "NATIONAL" pseudo-ORP (area-weighted aggregate of all
// 206 ORPs, computed the same way each ORP's own composite index is, just
// rolled up one level) rendered through the exact same panel/chart/pie code
// as a real ORP. The map keeps showing the full ORP-level choropleth at all
// times either way -- only the side panel content and the selection outline
// change between the two levels.
const NATIONAL_KOD = "NATIONAL";
let selectedKod = NATIONAL_KOD;
// Recomputed at the top of renderLayer() whenever the selection changes --
// the set of ORP codes sharing the selected ORP's kraj, so styleFeature can
// highlight them on the map. Kept in sync with regionPeers(), the same
// function that already drives the kraj-median comparisons in the side
// panel, so "who counts as a neighbor" means one consistent thing
// everywhere in the dashboard.
let currentKrajMates = new Set();

let geoLayer = null;
let activeRasterLayer = null;
let activeRasterKey = "none";
let chartInstance = null;
let pieInstance = null;
let contribPieInstance = null;
let subPieInstance = null;
// Pie animation is off by default (see below) so switching between ORPs
// shows the real before/after change instantly instead of re-sweeping
// clockwise every click. Set to true for exactly one render when returning
// to the national view via the close button, then reset -- that transition
// is a deliberate "zooming back out" moment worth animating.
let animatePieOnNextRender = false;

// ---------------------------------------------------------------------
// Data access helpers
// ---------------------------------------------------------------------
function orpYear(kod, year) {
  const rec = ORP_DATA[kod];
  if (!rec) return null;
  return rec.y[String(year)] || null;
}
function orpName(kod) {
  const rec = ORP_DATA[kod];
  if (!rec) return kod;
  // The synthetic "NATIONAL" pseudo-ORP stores a bilingual {cz,en} name
  // object instead of a plain string, since "Czech Republic" genuinely
  // needs translating (unlike real ORP names, which stay as-is in both
  // languages).
  return typeof rec.n === "object" ? rec.n[lang] : rec.n;
}
function orpTrend(kod, key) {
  const rec = ORP_DATA[kod];
  if (!rec || !rec.t) return null;
  return rec.t[key] || null;
}
function median(values) {
  const v = values.filter((x) => x !== null && x !== undefined).slice().sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}
function neighborMedian(kod, year, key) {
  const nbrs = NEIGHBORS[kod] || [];
  const vals = nbrs.map((nk) => {
    const p = orpYear(nk, year);
    return p ? p[key] : null;
  });
  return median(vals);
}

function regionName(kod) {
  const info = REGION_INFO[kod];
  return info ? info.name : null;
}

// Other ORPs sharing the same kraj (region), excluding this ORP itself and
// the synthetic NATIONAL entry. Computed on the fly from REGION_INFO rather
// than a precomputed peer list, since it's cheap and keeps the region
// lookup as a simple KOD -> {kod,name} map.
function regionPeers(kod) {
  const rName = regionName(kod);
  if (!rName) return [];
  return Object.keys(REGION_INFO).filter((k) => k !== kod && REGION_INFO[k] && REGION_INFO[k].name === rName);
}

// Dissolved kraj boundary polygons -- one real merged outline per kraj
// (via turf.union across all its member ORP polygons), instead of
// approximating a kraj's shape by outlining every one of its ORPs
// individually. Computed once at load from the same ORP geometry already
// embedded in this dashboard (~14 krajs, cheap) and reused for the black
// kraj-outline layer shown over raster views (see renderKrajBoundary).
// turf.dissolve keeps genuinely separate lobes apart (fixing the original
// "bowtie" artifact -- see buildKrajBoundaries below), but at the exact same
// ORP-ORP vertex-touch points it now emits a degenerate interior ring (a
// 3-4 vertex sliver "hole", confirmed up to ~0.07 km2) instead. Leaflet/SVG
// strokes every ring of a polygon, holes included, so those slivers were
// still rendering as the same spurious thin black shapes. Czech krajs have
// no real interior holes/enclaves, so it's safe to drop any ring whose area
// is small relative to a real administrative void -- 2 km2 is >25x larger
// than every observed sliver, with plenty of headroom.
const MIN_KRAJ_HOLE_AREA_M2 = 2000000;
function stripSliverHoles(geometry) {
  if (!geometry || geometry.type !== "Polygon" || geometry.coordinates.length <= 1) return geometry;
  const rings = geometry.coordinates;
  const kept = [rings[0]];
  for (let i = 1; i < rings.length; i++) {
    let area = Infinity; // if area calc itself fails, keep the ring rather than risk dropping something real
    try {
      area = turf.area({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [rings[i]] } });
    } catch (e) {}
    if (area >= MIN_KRAJ_HOLE_AREA_M2) kept.push(rings[i]);
  }
  return { type: "Polygon", coordinates: kept };
}

function buildKrajBoundaries() {
  const groups = {};
  GEOM.features.forEach((f) => {
    const info = REGION_INFO[f.properties.KOD];
    const name = info ? info.name : "?";
    (groups[name] = groups[name] || []).push(f);
  });
  const features = [];
  Object.keys(groups).forEach((name) => {
    const feats = groups[name];
    // turf.dissolve (purpose-built for merging a whole set of adjacent
    // polygons at once) instead of a manual pairwise turf.union loop.
    // The pairwise loop was the actual cause of the stray black
    // triangle/spike artifacts reported on the map: whenever two ORPs in
    // the same kraj touch at only a single shared vertex, union-ing them
    // one pair at a time can produce a "bowtie" -- a technically-valid
    // but self-touching polygon ring that visits two separate lobes of
    // area without ever properly splitting them into a MultiPolygon.
    // Leaflet's SVG renderer draws that as a straight line jumping
    // between the two lobes, which is exactly the odd black wedge shapes
    // showing up over otherwise-unrelated parts of the raster. dissolve
    // keeps genuinely separate lobes as separate polygons instead of
    // forcing them into one self-intersecting ring.
    //
    // dissolve only accepts Polygon (not MultiPolygon) features, so the
    // handful of multi-part ORPs (border exclaves etc.) are exploded into
    // individual Polygon features with turf.flatten first. Feature
    // objects are always freshly built here (never a reference to the
    // original GEOM features), so this can't repeat the earlier bug where
    // writing .properties on a reused object corrupted the shared GEOM
    // data (that was Prague's root cause, fixed separately).
    let dissolved = null;
    try {
      const flat = turf.flatten({
        type: "FeatureCollection",
        features: feats.map((f) => ({ type: "Feature", properties: {}, geometry: f.geometry })),
      });
      dissolved = turf.dissolve(flat);
    } catch (e) {
      dissolved = null;
    }
    if (dissolved && dissolved.features && dissolved.features.length) {
      // The same ORP-touch-point artifact that produced sliver interior
      // holes (stripped above) also produces sliver *separate* output
      // features -- tiny stray "islands" a couple hundred to ~10,000 m2 in
      // area, entirely inside the kraj's own bounds. Drop any output
      // feature under the same 2 km2 threshold, unless that would remove
      // every feature for this kraj (shouldn't happen -- a kraj's real
      // area is always far larger -- but this is a top-level script that
      // must never leave a kraj with zero geometry).
      const sized = dissolved.features.map((feat) => {
        let area = 0;
        try { area = turf.area(feat); } catch (e) {}
        return { feat: feat, area: area };
      });
      const bigEnough = sized.filter((s) => s.area >= MIN_KRAJ_HOLE_AREA_M2);
      const kept = bigEnough.length ? bigEnough : [sized.reduce((a, b) => (b.area > a.area ? b : a))];
      kept.forEach((s) => {
        features.push({ type: "Feature", geometry: stripSliverHoles(s.feat.geometry), properties: { kraj: name } });
      });
    } else {
      // dissolve failed outright (shouldn't happen, but this runs at
      // module load and must never leave the whole dashboard broken) --
      // fall back to each member ORP's own outline for this kraj, so
      // there's still *some* geographic context rather than nothing.
      feats.forEach((f) => {
        features.push({ type: "Feature", geometry: f.geometry, properties: { kraj: name } });
      });
    }
  });
  return { type: "FeatureCollection", features: features };
}
const KRAJ_GEOM = buildKrajBoundaries();

function regionMedian(kod, year, key) {
  const peers = regionPeers(kod);
  const vals = peers.map((pk) => {
    const p = orpYear(pk, year);
    return p ? p[key] : null;
  });
  return median(vals);
}
// data-driven N/A check (not hardcoded to any specific year -- if a future
// year ever has a gap like the old 2021 issue, this will surface it
// automatically instead of silently looking broken)
function yearHasNoData(year) {
  return Object.keys(ORP_DATA).every((kod) => {
    const p = orpYear(kod, year);
    return !p || p.I == null;
  });
}

// "Dominant" means the land-cover category occupying the largest SHARE of
// the ORP's area (props.s), not the one with the highest ecosystem
// integrity index value -- using the index value here was the bug: it let
// a category with a tiny area share (e.g. Grassland at 4%) but a high EI
// score "win," producing results that looked flatly wrong on the map.
// Restricted to the four counted buckets (F/A/G/U), same scope already
// used everywhere else area shares are shown (composition/contribution
// pies) -- Unclassified/X has no comparable area-share figure here.
function dominantClass(props) {
  let best = null, bestVal = -Infinity;
  BUCKET_KEYS.forEach((k) => {
    const v = props.s ? props.s[k] : null;
    if (v !== null && v !== undefined && v > bestVal) { bestVal = v; best = k; }
  });
  return best;
}

// ---------------------------------------------------------------------
// Color scales
// ---------------------------------------------------------------------
function hexToRgb(hex) {
  hex = hex.replace("#", "");
  return [parseInt(hex.substr(0, 2), 16), parseInt(hex.substr(2, 2), 16), parseInt(hex.substr(4, 2), 16)];
}
function hexToRgba(hex, alpha) {
  const [r, g, b] = hexToRgb(hex);
  return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
}
function lerpColor(hexA, hexB, t) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return "rgb(" + r + "," + g + "," + bl + ")";
}
// absolute red -> yellow -> green scale, domain fitted to the real data range
function absoluteColor(value, lo, hi) {
  if (value === null || value === undefined) return "#cccccc";
  const t = Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
  if (t < 0.5) return lerpColor("#b23a2e", "#e8c547", t / 0.5);
  return lerpColor("#e8c547", "#1f7a3d", (t - 0.5) / 0.5);
}
// diverging scale for deltas / neighbor comparisons
function diffColor(diff, maxAbs) {
  const c = changeRgb((diff / maxAbs + 1) / 2);
  return "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")";
}

const HEALTH_DOMAIN = [0.35, 0.75]; // fitted to observed RIEI/bucket range so colors actually spread out

// Per-bucket color domains (Forest/Agricultural/Grassland/Urban), computed
// from the real observed range across all ORPs and years (excluding the
// synthetic NATIONAL aggregate), so each bucket's own map coloring is an
// absolute red-yellow-green scale -- same idea as HEALTH_DOMAIN -- instead
// of a neighbor-relative comparison. The data to do this was already there
// (props[key] is the same raw per-bucket EI value used in the side panel,
// trend charts, and contribution pie); this just applies it to the map fill
// too, so "Forest" reads the same way "Ecosystem Integrity" already does.
function computeBucketDomain(key) {
  let lo = Infinity, hi = -Infinity;
  Object.keys(ORP_DATA).forEach((kod) => {
    if (kod === NATIONAL_KOD) return;
    const rec = ORP_DATA[kod];
    YEARS.forEach((y) => {
      const p = rec.y[String(y)];
      const v = p ? p[key] : null;
      if (v !== null && v !== undefined) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    });
  });
  if (!isFinite(lo) || !isFinite(hi) || lo === hi) return [0, 1];
  const pad = (hi - lo) * 0.08;
  return [Math.max(0, lo - pad), Math.min(1, hi + pad)];
}
const BUCKET_DOMAINS = {};
BUCKET_KEYS.forEach((k) => { BUCKET_DOMAINS[k] = computeBucketDomain(k); });

const YOY_MAX_DELTA = 0.15;
const RANGE_MAX_DELTA = 0.22;
// Symmetric range M for the change scale, per parameter: the largest change
// any ORP shows between any two years, rounded up to the next 5 p. b. The same
// M is used for every period, so maps of the same quantity stay comparable.
const CHANGE_M = {};
["I", "F", "A", "G", "U"].forEach((key) => {
  let worst = 0;
  Object.keys(ORP_DATA).forEach((kod) => {
    if (kod === NATIONAL_KOD) return;
    const vals = YEARS.map((y) => { const p = ORP_DATA[kod].y[String(y)]; return p ? p[key] : null; }).filter((v) => v != null);
    if (vals.length) worst = Math.max(worst, Math.max.apply(null, vals) - Math.min.apply(null, vals));
  });
  CHANGE_M[key] = Math.max(0.05, Math.ceil(worst * 20) / 20);
});
// To set the change-scale range M by hand (e.g. if the team prefers other
// values), fill this in. Values are on the 0-1 index scale, so 0.25 = 25 p. b.
// Example: const CHANGE_M_OVERRIDE = { I: 0.25, F: 0.25 };
const CHANGE_M_OVERRIDE = {};
Object.keys(CHANGE_M_OVERRIDE).forEach((k) => { CHANGE_M[k] = CHANGE_M_OVERRIDE[k]; });

// ---------------------------------------------------------------------
// Map setup
// ---------------------------------------------------------------------
const map = L.map("map", { zoomControl: false }).setView([49.75, 15.4], 8);
L.control.zoom({ position: "topright" }).addTo(map);

// Single fixed basemap -- Esri World Imagery (satellite) with a reference
// layer of place names/boundaries drawn on top. Per client feedback the
// Light Gray / Dark Gray canvas options were just noise next to the
// satellite view, and with only one real option left there's no reason to
// keep a basemap selector in the UI at all -- this is just always on.
// Satellite basemap (Esri World Imagery + place names), always on.
const basemapGroup = L.layerGroup([
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    attribution: "&copy; Esri &mdash; Esri, Maxar, Earthstar Geographics",
    maxZoom: 19,
  }),
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19,
  }),
]).addTo(map); // satellite basemap is always on

map.createPane("rasterPane");
map.getPane("rasterPane").style.zIndex = 450;
map.getPane("rasterPane").style.pointerEvents = "none";

// The ORP layer (and the dissolved kraj-outline layer below) render in this
// pane instead of Leaflet's default overlayPane, so their borders draw on
// top of the raster tiles instead of being hidden underneath them --
// otherwise a raster with fillOpacity:0 ORPs would still bury the ORP/kraj
// outlines that are supposed to give the raster geographic context.
map.createPane("boundaryPane");
map.getPane("boundaryPane").style.zIndex = 460;

// Raster overlays, switched via the "Raster layer" dropdown so they never
// stack on top of each other. All render in the same click-through pane so
// the ORP polygons underneath stay clickable/hoverable.
//
// Four of these (health, photo, cooling, hetero) are standard cached
// MapServer tile layers -- same pattern, all confirmed via the Links_
// toRasters.xlsx list from the ArcGIS org, Spatial Reference 102100 (Web
// Mercator), Format MIXED (PNG/JPEG) per krajinna_pestrost's metadata.
const RASTER_TILE_URLS = {
  health: "https://tiles.arcgis.com/tiles/E30nMIuUoea7pBjP/arcgis/rest/services/celkove_ekosystemove_zdravi/MapServer/tile/{z}/{y}/{x}",
  photo: "https://tiles.arcgis.com/tiles/E30nMIuUoea7pBjP/arcgis/rest/services/fotosynteticky_potencial/MapServer/tile/{z}/{y}/{x}",
  cooling: "https://tiles.arcgis.com/tiles/E30nMIuUoea7pBjP/arcgis/rest/services/chladici_schopnost_vegetace/MapServer/tile/{z}/{y}/{x}",
  hetero: "https://tiles.arcgis.com/tiles/E30nMIuUoea7pBjP/arcgis/rest/services/krajinna_pestrost/MapServer/tile/{z}/{y}/{x}",
  // Self-hosted static XYZ tile pyramid (gdal2tiles.py --xyz -p mercator),
  // replacing the old ArcGIS Trend_Raster_EI exportImage approach entirely --
  // that service's LERC2D format + UTM33 CRS + 3 non-standard LODs could
  // never be addressed with a normal {z}/{x}/{y} tile request. This layer is
  // just static PNG files, so it uses the exact same L.tileLayer path as the
  // four ArcGIS layers above once the URL below is filled in.
  trend: "https://alonsonetmxorg-web.github.io/tiles/{z}/{x}/{y}.png",
};

// Confirmed from krajinna_pestrost's service metadata: cache only goes to
// LOD 15, not the 19 assumed before -- past that, every tile request 404s
// since nothing was ever cached there. maxNativeZoom stops the layer from
// requesting tiles beyond what's actually cached; Leaflet just upscales the
// last real tile if the user zooms in further, which is the standard,
// expected behavior for a capped tile cache rather than an error state.
const RASTER_MAX_NATIVE_ZOOM = 15;

// The self-hosted trend tiles were only generated up to zoom 12 (matching
// the ~30-40m/pixel export resolution -- going further would just upscale
// blur). Every other raster layer stays capped at 15.
const RASTER_MAX_NATIVE_ZOOM_BY_KEY = { trend: 12 };

// Czech Republic bounding box (with a little padding), from the same ORP
// geometry already embedded in this dashboard -- restricts tile requests to
// roughly the country's extent instead of the whole world, cutting down on
// edge-tile 404s for areas these CZ-only layers were never cached for.
const CZ_RASTER_BOUNDS = [[48.2, 11.6], [51.3, 19.3]];

// The self-hosted "trend" tile pyramid was exported (gdal2tiles) without an
// alpha channel for its no-data/unclassified pixels (water, wetland, bare
// rock -- the same classes excluded from the index everywhere else in this
// dashboard), so those pixels came out as solid opaque black instead of
// transparent. On screen that showed up as a scatter of small black
// speckles across the whole country -- easy to mistake for ORP boundary
// artifacts (an issue this dashboard did have and already fixed earlier),
// but actually unrelated: those are real pixels baked into the trend tiles
// themselves, not vector strokes. This tile layer fixes it on the display
// side (no access to the original export pipeline / GDAL step needed): it
// draws each PNG tile to a canvas and makes any near-black pixel fully
// transparent, while faithfully reproducing the normal maxNativeZoom
// "overzoom" behavior (crop + upscale the deepest cached tile) so zooming
// in past the trend layer's native zoom 12 still works the same as before.
const ChromaKeyTileLayer = L.GridLayer.extend({
  // L.GridLayer's own constructor only takes an options object -- unlike
  // L.TileLayer (which extends GridLayer and adds exactly this), it never
  // stores a URL template. Extending GridLayer directly without this
  // override meant `this._url` was always undefined, so every tile request
  // silently failed to load at all -- not a chroma-key bug, the layer just
  // never rendered anything.
  initialize: function (url, options) {
    this._url = url;
    L.GridLayer.prototype.initialize.call(this, options);
  },
  createTile: function (coords, done) {
    const tile = document.createElement("canvas");
    const size = this.getTileSize();
    tile.width = size.x;
    tile.height = size.y;
    const ctx = tile.getContext("2d");
    const maxNative = this.options.maxNativeZoom || coords.z;
    let z = coords.z, x = coords.x, y = coords.y, subX = 0, subY = 0, factor = 1;
    if (z > maxNative) {
      factor = Math.pow(2, z - maxNative);
      subX = x % factor;
      subY = y % factor;
      x = Math.floor(x / factor);
      y = Math.floor(y / factor);
      z = maxNative;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const sw = img.width / factor, sh = img.height / factor;
        ctx.drawImage(img, subX * sw, subY * sh, sw, sh, 0, 0, size.x, size.y);
        const imgData = ctx.getImageData(0, 0, size.x, size.y);
        const d = imgData.data;
        // Soft luminance ramp instead of a hard cutoff -- a hard "black
        // below threshold X" test left a thin, fully-opaque outline of
        // anti-aliased gray edge pixels wherever a solid-black no-data
        // blob met real color data (those edge pixels are gray, not pure
        // black, so they cleared a low threshold but stayed opaque),
        // which showed up as stray dark line segments tracing where the
        // no-data shapes used to be. Fading alpha smoothly between lo and
        // hi removes that visible edge entirely.
        const lo = this.options.chromaLo != null ? this.options.chromaLo : 15;
        const hi = this.options.chromaHi != null ? this.options.chromaHi : 95;
        const recolor = !!this.options.recolorDiverging;
        for (let i = 0; i < d.length; i += 4) {
          const lum = Math.max(d[i], d[i + 1], d[i + 2]);
          // Display-side recolor of the published tiles (orange-white-green)
          // to the spec's red-white-blue change ramp: sign from which hue
          // dominates, size from distance to white, scaled to the symmetric
          // range M so zero sits in the middle of the scale.
          if (recolor && lum > lo) {
            const r = d[i], g = d[i + 1], b = d[i + 2];
            let sgn = 0;
            if (g > r + 2) sgn = Math.min(1, (253 - r) / 253);
            else if (r > g + 2) sgn = -Math.min(1, (253 - b) / 169);
            const c = changeRgb((sgn + 1) / 2);
            d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
          }
          if (lum <= lo) {
            d[i + 3] = 0;
          } else if (lum < hi) {
            d[i + 3] = Math.round(d[i + 3] * ((lum - lo) / (hi - lo)));
          }
        }
        ctx.putImageData(imgData, 0, 0);
      } catch (e) {
        // Canvas tainted by a CORS-restricted response -- shouldn't happen
        // on GitHub Pages' public static hosting, but fail safe and just
        // show the tile as-is rather than breaking the whole raster.
      }
      done(null, tile);
    };
    img.onerror = () => done(null, tile);
    img.src = L.Util.template(this._url, { x: x, y: y, z: z });
    return tile;
  },
});

// Layer menu depends on the mode (brief A5/C1): the trend layer belongs
// only to "Change over time"; "Annual overview" offers the four snapshot
// rasters.
function buildRasterSelect() {
  const sel = document.getElementById("raster-select");
  const options = mode === "change"
    ? [["none", T("raster_none")], ["trend", T("raster_trend")]]
    : [
        ["none", T("raster_none")],
        ["health", T("raster_health")],
        ["photo", T("raster_photo")],
        ["cooling", T("raster_cooling")],
        ["hetero", T("raster_hetero")],
      ];
  sel.innerHTML = options.map((o) => '<option value="' + o[0] + '"' + (o[0] === activeRasterKey ? " selected" : "") + ">" + o[1] + "</option>").join("");
}

function setRasterLayer(key) {
  if (activeRasterLayer) { map.removeLayer(activeRasterLayer); activeRasterLayer = null; }
  activeRasterKey = key;
  document.getElementById("raster-opacity-group").style.display = key === "none" ? "none" : "flex";
  if (RASTER_TILE_URLS[key]) {
    const tileOptions = {
      attribution: "Člověk v tísni",
      opacity: parseFloat(document.getElementById("raster-opacity").value),
      maxZoom: 19,
      maxNativeZoom: RASTER_MAX_NATIVE_ZOOM_BY_KEY[key] || RASTER_MAX_NATIVE_ZOOM,
      bounds: CZ_RASTER_BOUNDS,
      pane: "rasterPane",
    };
    // Only the self-hosted trend layer needs the black-speckle fix above --
    // the four ArcGIS-hosted layers already handle no-data via real alpha.
    if (key === "trend") tileOptions.recolorDiverging = true;
    activeRasterLayer = key === "trend"
      ? new ChromaKeyTileLayer(RASTER_TILE_URLS[key], tileOptions)
      : L.tileLayer(RASTER_TILE_URLS[key], tileOptions);
    activeRasterLayer.addTo(map);
  }
  // Restyle the ORP polygons too -- when a raster turns on/off, the
  // choropleth fill needs to fade out/back in and the legend needs to
  // switch between "table world" and raster-only (see styleFeature and
  // renderLegend for the actual logic).
  if (geoLayer) geoLayer.setStyle(styleFeature);
  renderKrajBoundary();
  renderLegend();
}

// Black dissolved kraj outline, shown only while a raster is active (per
// client request: give the raster geographic context -- ORP grid in gray,
// kraj outline in black -- without it competing with the choropleth, which
// stays off in raster mode). Not tied to which ORP is selected -- every
// kraj outline shows, all the time, while any raster is on.
let krajBoundaryLayer = null;
function renderKrajBoundary() {
  if (krajBoundaryLayer) { map.removeLayer(krajBoundaryLayer); krajBoundaryLayer = null; }
  if (activeRasterKey === "none") return;
  krajBoundaryLayer = L.geoJSON(KRAJ_GEOM, {
    pane: "boundaryPane",
    interactive: false,
    style: { color: "#000000", weight: 2.5, fill: false },
  }).addTo(map);
}

document.getElementById("raster-select").addEventListener("change", function (e) {
  setRasterLayer(e.target.value);
});
document.getElementById("raster-opacity").addEventListener("input", function (e) {
  const v = parseFloat(e.target.value);
  if (activeRasterLayer) activeRasterLayer.setOpacity(v);
});

// Turns any active raster off and returns to the normal choropleth
// ("vector world") map -- shared by the small "x" clear button in the
// header and by switching mode tabs (see setMode below).
function clearRaster() {
  document.getElementById("raster-select").value = "none";
  setRasterLayer("none");
}

// ---------------------------------------------------------------------
// Raster tour -- a guided sequence of cards (4 country-wide indicator
// explainers + 7 zoomed real-location examples), modeled on the
// colleague's ArcGIS Experience Builder "map tour" widget. Each card
// drives the raster-layer selection and the map view; content (photo,
// title, description) comes from the reference app, translated to EN.
// coords is null for the 4 indicator cards (country-wide extent) and a
// [lat, lon] pair for the 7 example cards (real locations supplied by
// the client).
// ---------------------------------------------------------------------
const ALL_TOUR_CARDS = [
  { img: "tour_images/1.jpg", raster: "health", coords: null, titleKey: "tour_1_title", descKey: "tour_1_desc" },
  { img: "tour_images/2.jpg", raster: "photo", coords: null, titleKey: "tour_2_title", descKey: "tour_2_desc" },
  { img: "tour_images/3.jpg", raster: "cooling", coords: null, titleKey: "tour_3_title", descKey: "tour_3_desc" },
  { img: "tour_images/4.jpg", raster: "hetero", coords: null, titleKey: "tour_4_title", descKey: "tour_4_desc" },
  // 5th raster: the long-term trend layer, condensing the 9 annual
  // health-index rasters (2017-2025) into a single rate-of-change map.
  // Sits right after the other 4 country-wide indicator cards.
  { img: "tour_images/trend.jpg", raster: "trend", coords: null, titleKey: "tour_trend_title", descKey: "tour_trend_desc" },
  { img: "tour_images/5.jpg", raster: "health", coords: [50.21028047525929, 15.825216003944668], titleKey: "tour_5_title", descKey: "tour_5_desc" },
  { img: "tour_images/6.jpg", raster: "health", coords: [50.56884353852118, 13.72022879146167], titleKey: "tour_6_title", descKey: "tour_6_desc" },
  { img: "tour_images/7.jpg", raster: "hetero", coords: [50.48280295587729, 14.558138936969106], titleKey: "tour_7_title", descKey: "tour_7_desc" },
  { img: "tour_images/8.jpg", raster: "cooling", coords: [50.08669559415599, 14.681752901434985], titleKey: "tour_8_title", descKey: "tour_8_desc" },
  { img: "tour_images/9.jpg", raster: "photo", coords: [48.867905707937524, 17.12369007789502], titleKey: "tour_9_title", descKey: "tour_9_desc" },
  { img: "tour_images/10.jpg", raster: "hetero", coords: [49.09517578389606, 14.784737621169171], titleKey: "tour_10_title", descKey: "tour_10_desc" },
  { img: "tour_images/11.jpg", raster: "photo", coords: [50.89959373264084, 14.38515229597439], titleKey: "tour_11_title", descKey: "tour_11_desc" },
];
// The trend layer belongs only to "Change over time" (brief A5/C1), so the
// tour shows only its card in that mode and the snapshot cards otherwise.
function tourCards() {
  return ALL_TOUR_CARDS.filter((c) => (mode === "change") === (c.raster === "trend"));
}
const TOUR_ZOOM = 13;
let tourIndex = 0;
let tourOpen = false;

function buildTourJump() {
  const sel = document.getElementById("tour-jump");
  if (!sel) return;
  sel.innerHTML = tourCards().map((c, i) => '<option value="' + i + '">' + (i + 1) + ". " + T(c.titleKey) + "</option>").join("");
  sel.value = String(tourIndex);
}

function renderTourCard(idx) {
  tourIndex = Math.max(0, Math.min(tourCards().length - 1, idx));
  const card = tourCards()[tourIndex];
  document.getElementById("tour-img").src = card.img;
  document.getElementById("tour-card-title").textContent = T(card.titleKey);
  document.getElementById("tour-card-desc").textContent = T(card.descKey);
  document.getElementById("tour-counter").textContent = (tourIndex + 1) + " / " + tourCards().length;
  const jumpSel = document.getElementById("tour-jump");
  if (jumpSel) jumpSel.value = String(tourIndex);
  document.getElementById("tour-prev-btn").disabled = tourIndex === 0;
  document.getElementById("tour-next-btn").disabled = tourIndex === tourCards().length - 1;

  // Drive the raster layer (and keep the existing dropdown in sync) to
  // match this card.
  document.getElementById("raster-select").value = card.raster; // may be blank if this mode's menu lacks it; the layer is still driven below
  setRasterLayer(card.raster);

  // Drive the map view: fly to a real location for example cards, or
  // back out to the full national extent for the 4 country-wide
  // indicator cards.
  if (card.coords) {
    map.flyTo(card.coords, TOUR_ZOOM, { duration: 1.1 });
  } else if (geoLayer) {
    try { map.flyToBounds(geoLayer.getBounds(), Object.assign(fitOpts(), { duration: 1.1 })); } catch (e) {}
  }
}

function openTour() {
  tourOpen = true;
  // Docked as a real left column (flex child of #main, same idea as the
  // right-hand #panel) rather than a floating overlay -- "flex" not
  // "block" so it lays out correctly, and the map needs to be told its
  // container just shrank or its tiles stay sized for the old width.
  document.getElementById("tour-overlay").style.display = "flex";
  positionOverlays();
  buildTourJump();
  renderTourCard(tourIndex);
  setTimeout(() => map.invalidateSize(), 260);
}

function closeTour() {
  tourOpen = false;
  document.getElementById("tour-overlay").style.display = "none";
  // Leave the raster picked back to "none" so closing the tour returns
  // the map to normal choropleth browsing instead of leaving whichever
  // raster the last card used stuck on.
  document.getElementById("raster-select").value = "none";
  setRasterLayer("none");
  setTimeout(() => map.invalidateSize(), 260);
}

function tourNext() { if (tourIndex < tourCards().length - 1) renderTourCard(tourIndex + 1); }
function tourPrev() { if (tourIndex > 0) renderTourCard(tourIndex - 1); }

document.getElementById("tour-jump").addEventListener("change", function (e) {
  renderTourCard(parseInt(e.target.value, 10));
});

// ---------------------------------------------------------------------
// Intro banner -- one-time background/credits banner at the top of the
// page. Dismissible, and remembered across visits via localStorage (this
// is a standalone file the client hosts themselves, not a Claude-rendered
// preview, so real browser storage is fine here). The "About" button in
// the header brings it back any time.
// ---------------------------------------------------------------------
function closeIntro() {
  document.getElementById("intro-banner").style.display = "none";
  try { localStorage.setItem("eih_intro_dismissed", "1"); } catch (e) {}
}
function openIntro() {
  document.getElementById("intro-banner").style.display = "flex";
  try { localStorage.removeItem("eih_intro_dismissed"); } catch (e) {}
}
// Contact modal -- purely manual open/close (no first-visit auto-show, no
// localStorage), reached from the "?" header icon.
function openContact() {
  document.getElementById("contact-banner").style.display = "flex";
}
function closeContact() {
  document.getElementById("contact-banner").style.display = "none";
}

// ---------------------------------------------------------------------
// Panel collapse -- lets the user hide the right-hand info panel
// entirely so the map (and any active raster) fills the full width for
// unguided exploring, then bring it back with the same button.
// ---------------------------------------------------------------------
let panelCollapsed = false;
// Set when the tour auto-collapses the panel on open (see openTour) so
// closeTour knows whether to bring it back -- vs. the user having already
// hidden it themselves before opening the tour, which should be left alone.
let panelAutoCollapsedByTour = false;
function togglePanel() {
  setTimeout(() => map.invalidateSize(), 0);
}

// Distance scale bar (brief A7), separate from the colour legend.
L.control.scale({ position: "bottomleft", imperial: false, maxWidth: 140 }).addTo(map);

const legend = L.control({ position: "bottomright" });
legend.onAdd = function () {
  const div = L.DomUtil.create("div", "legend");
  div.id = "legend-box";
  renderLegend(div);
  return div;
};
legend.addTo(map);

// End labels of the change legends: the word plus the range M in p. b. (the
// team asked to show the numbers once M is confirmed from the real data).
// `clip` marks layers whose values beyond M are shown at full colour.
// Jakub's comment (S11 #5 / brief C6): legends show the words only. Set to
// true to show the range numbers under "Pokles" / "Nárůst" once the team
// agrees to them.
const SHOW_LEGEND_NUMBERS = false;
function legendEndLabel(word, sign, m, opts) {
  if (!SHOW_LEGEND_NUMBERS) return word;
  opts = opts || {};
  const v = m * 100;
  const dec = Math.abs(v - Math.round(v)) < 1e-9 ? 0 : 1;
  const num = (opts.clip ? (sign < 0 ? "≤ " : "≥ ") : "") + (sign < 0 ? "−" : "+") + fmtNum(v, dec) + "\u00a0" + T("pp_unit") + (opts.perYear ? T("per_year") : "");
  return word + "<small>" + num + "</small>";
}

function renderLegend(div) {
  div = div || document.getElementById("legend-box");
  if (!div) return;
  let html = "";
  // The choropleth legend is table-world content -- skipped entirely while
  // a raster is active so the raster's own legend (below) has the full
  // legend box to itself instead of two unrelated color scales stacked on
  // top of each other.
  const rasterActive = activeRasterKey !== "none";
  if (!rasterActive) {
    if (mode === "current") {
      if (displayKey === "dominant") {
        html += "<strong>" + T("legend_dominant") + ' ' + infoIcon("dominant") + '</strong>';
        BUCKET_KEYS.forEach((k) => {
          html += '<span class="swatch" style="background:' + BUCKET_COLORS[k] + '"></span>' + label(k) + "<br>";
        });
      } else if (displayKey === "I") {
        html += "<strong>" + T("legend_health") + ' ' + infoIcon("health_legend") + '</strong>';
        html += '<div class="gradient-bar" style="background:linear-gradient(90deg,#b23a2e,#e8c547,#1f7a3d)"></div>';
        html += '<div class="gradient-labels"><span>' + pctLevel(HEALTH_DOMAIN[0] * 100) + "</span><span>" + pctLevel(HEALTH_DOMAIN[1] * 100) + "</span></div>";
      } else {
        // Same absolute red-yellow-green legend style as Ecosystem Integrity,
        // just with this bucket's own observed-range domain.
        const dom = BUCKET_DOMAINS[displayKey] || [0, 1];
        html += "<strong>" + label(displayKey) + " " + T("legend_health") + ' ' + infoIcon("health_legend") + '</strong>';
        html += '<div class="gradient-bar" style="background:linear-gradient(90deg,#b23a2e,#e8c547,#1f7a3d)"></div>';
        html += '<div class="gradient-labels"><span>' + pctLevel(dom[0] * 100) + "</span><span>" + pctLevel(dom[1] * 100) + "</span></div>";
      }
    } else {
      html += "<strong>" + T("legend_change").replace("{PARAM}", paramName(displayKey)).replace("{FROM}", fromYear).replace("{TO}", toYear) + "</strong>";
      html += '<div class="gradient-bar" style="background:linear-gradient(90deg,' + CHG_GRADIENT_CSS + ')"></div>';
      const mm = CHANGE_M[displayKey === "dominant" ? "I" : displayKey] || RANGE_MAX_DELTA;
      html += '<div class="gradient-labels"><span>' + legendEndLabel(T("decline"), -1, mm) + "</span><span>0</span><span>" + legendEndLabel(T("improvement"), 1, mm) + "</span></div>";
    }
    if (mode === "current" && yearHasNoData(currentYear)) {
      html += '<div class="na-note">' + currentYear + ": " + T("no_data") + "</div>";
    }
  }

  // Raster overlay legend. Its own standalone block now -- the choropleth
  // legend above is entirely skipped while a raster is active, so this is
  // the only thing in the legend box rather than two stacked scales.
  const rl = RASTER_LEGENDS[activeRasterKey];
  if (rl) {
    const gradientStops = rl.stopsCss || rl.stops.join(",");
    html += '<div style="margin-top:8px;padding-top:8px;border-top:1px solid #ddd;">';
    html += "<strong>" + T("raster_" + activeRasterKey) + (rl.infoKey ? " " + infoIcon(rl.infoKey) : "") + "</strong>";
    html += '<div class="gradient-bar" style="background:linear-gradient(90deg,' + gradientStops + ')"></div>';
    const fmtLegendEnd = (s) => String(s).replace(/(\d)%$/, (m, d) => d + (lang === "cz" ? "\u00a0%" : "%"));
    const lowLabel = rl.lowKey ? (rl.mValue ? legendEndLabel(T(rl.lowKey), -1, rl.mValue, { clip: true, perYear: true }) : T(rl.lowKey)) : fmtLegendEnd(rl.lowText || T("raster_legend_low"));
    const highLabel = rl.highKey ? (rl.mValue ? legendEndLabel(T(rl.highKey), 1, rl.mValue, { clip: true, perYear: true }) : T(rl.highKey)) : fmtLegendEnd(rl.highText || T("raster_legend_high"));
    html += '<div class="gradient-labels"><span>' + lowLabel + "</span>" + (rl.midText ? "<span>" + rl.midText + "</span>" : "") + "<span>" + highLabel + "</span></div>";
    html += "</div>";
  }

  div.innerHTML = html;
}

// ---------------------------------------------------------------------
// Feature styling
// ---------------------------------------------------------------------
function styleFeature(feature) {
  const kod = feature.properties.KOD;
  const isSelected = kod === selectedKod;
  // Kraj-mates get a light gray outline so a reader can see at a glance
  // which ORPs the side panel's "kraj median" comparison is actually drawn
  // from, instead of having to guess or cross-reference a name list.
  const isKrajMate = !isSelected && currentKrajMates.has(kod);
  let fillColor = NO_DATA_COLOR;

  if (mode === "current") {
    const props = orpYear(kod, currentYear);
    if (props) {
      if (displayKey === "dominant") {
        const cls = dominantClass(props);
        fillColor = cls ? BUCKET_COLORS[cls] : NO_DATA_COLOR;
      } else if (displayKey === "I") {
        fillColor = absoluteColor(props.I, HEALTH_DOMAIN[0], HEALTH_DOMAIN[1]);
      } else {
        // Absolute per-bucket coloring (same red-yellow-green scale as
        // Ecosystem Integrity), not a neighbor-relative comparison -- the
        // neighbor/region numbers are still available in the side panel.
        const val = props[displayKey];
        const dom = BUCKET_DOMAINS[displayKey];
        fillColor = (val === null || val === undefined) ? NO_DATA_COLOR : absoluteColor(val, dom[0], dom[1]);
      }
    }
  } else {
    const fromP = orpYear(kod, fromYear);
    const toP = orpYear(kod, toYear);
    if (fromP && toP) {
      const key = displayKey === "I" ? "I" : displayKey;
      const a = fromP[key], b = toP[key];
      if (a !== null && a !== undefined && b !== null && b !== undefined) {
        fillColor = diffColor(b - a, CHANGE_M[key] || RANGE_MAX_DELTA);
      }
    }
  }

  // Administrative hierarchy conveyed by outline weight/color, darkest and
  // thickest for the most specific level: selected ORP (black, thick) ->
  // its kraj-mates (light gray, thin) -> everything else (white, thinnest).
  //
  // When a raster overlay is active, the choropleth fill is hidden entirely
  // (fillOpacity 0) rather than blended with it -- per client feedback, the
  // raster should get its own uncontested space instead of two different
  // color scales fighting on the same polygons. The boundary lines stay so
  // the raster still has ORP/kraj context to orient by; side-panel charts
  // and stats are unaffected, this only touches map symbology.
  //
  // In raster mode the ORP grid line is dropped entirely -- per client
  // feedback it turned into visual noise (breaking up into scattered dots
  // at low zoom, a common issue with thin strokes on ~200 small polygons).
  // Only the black kraj-level outline remains as geographic context (see
  // renderKrajBoundary); the selection-based hierarchy (selected/kraj-mate)
  // doesn't apply here either, since there's no single "selected ORP" story
  // to tell while a raster's on.
  const rasterActive = activeRasterKey !== "none";
  if (rasterActive) {
    return { fillColor: fillColor, weight: 0, fillOpacity: 0 };
  }
  return {
    fillColor: fillColor,
    weight: isSelected ? 3 : (isKrajMate ? 1.5 : 1),
    color: isSelected ? "#000000" : (isKrajMate ? "#8a8a8a" : "#ffffff"),
    // Near-opaque (was 0.82) -- at 0.82, the basemap's place-label layer
    // (Reference/World_Boundaries_and_Places) can bleed through the fill
    // wherever it draws a city-name halo, which is most visible over
    // Prague since it gets the most prominent capital-city label marker
    // of anywhere in the country -- that bleed-through, not a data or
    // geometry issue (verified: Prague's own record is complete and
    // in-range for every bucket/year), is what was reading as a gray
    // blob. 0.97 keeps a faint hint of satellite texture without
    // leaving enough transparency for that halo to show through.
    fillOpacity: 0.97,
  };
}

// Index/bucket values are normalized 0-1, so displaying them as percentages
// just means x*100 -- clamped to +/-100% in case any derived value (deltas,
// neighbor comparisons) ever lands slightly outside that range.
function pctNum(value) {
  return Math.max(-100, Math.min(100, value * 100));
}

// Dynamic Y-axis ceiling for the history charts: keeps 0 as the true, honest
// baseline (never truncates the bottom -- that's the misleading kind of
// axis-zooming), but caps the top just above the actual highest value ever
// reached across all shown series/years, instead of always running to 100%.
// Removes dead space above the data without hiding how big the real changes
// are relative to zero.
function computeNiceAxisMax(valueArrays) {
  let max = 0;
  valueArrays.forEach((arr) => arr.forEach((v) => { if (v !== null && v !== undefined && v > max) max = v; }));
  if (max <= 0) return 10;
  return Math.ceil((max * 1.15) / 5) * 5; // ~15% headroom, rounded up to a clean multiple of 5
}

// Mirrors computeNiceAxisMax on the bottom end -- trims the dead space below
// the lowest actual value too, rather than always anchoring at a literal 0.
// Note: unlike the top-only trim, this crosses into "truncated axis"
// territory (equal gridline gaps no longer span the full possible range).
// Kept honest by always showing the real axis labels (ticks below), and
// computed dynamically per chart/ORP rather than a fixed floor, since a
// hardcoded number would clip lower-scoring ORPs or buckets.
function computeNiceAxisMin(valueArrays) {
  let min = Infinity;
  valueArrays.forEach((arr) => arr.forEach((v) => { if (v !== null && v !== undefined && v < min) min = v; }));
  if (!isFinite(min) || min <= 0) return 0;
  return Math.max(0, Math.floor((min * 0.85) / 5) * 5); // ~15% headroom below the lowest actual value
}

// Differences between two index values are percentage POINTS (p. b. in
// Czech, p.p. in English), never "%". Plain "%" is reserved for index
// levels (0-100 %). Non-breaking space keeps number and unit together.
// Number formatting per language: Czech uses a decimal comma and a space
// before "%" ("52 %", "-6,1 p. b."), English uses a dot and no space
// ("52%", "-6.1 p.p."). Negatives use a true minus sign (U+2212).
function fmtNum(x, dec) {
  let s = Number(x).toFixed(dec);
  if (lang === "cz") s = s.replace(".", ",");
  return s.replace("-", "−");
}
// Index LEVEL (0-100 scale), e.g. "52 %" / "52%". Only levels use %.
function pctLevel(x, dec) {
  return fmtNum(x, dec || 0) + (lang === "cz" ? " %" : "%");
}
// Index DIFFERENCE in percentage points; signed=true adds an explicit "+".
function ppText(delta, signed) {
  const v = pctNum(delta);
  const sign = signed && Number(v.toFixed(1)) > 0 ? "+" : "";
  return sign + fmtNum(v, 1) + " " + T("pp_unit");
}

// Short parameter name used in titles: "IEI" or "IEI (Les)". Built so that
// further parameters (NDVI, LST) can be added later (brief C3/C9).
function paramName(key) {
  return (!key || key === "I" || key === "dominant") ? "IEI" : "IEI (" + label(key) + ")";
}
function fillT(str, vars) {
  return Object.keys(vars).reduce((acc, k) => acc.split("{" + k + "}").join(vars[k]), str);
}

// Comparison with the regional median, in percentage points (brief A16).
function regionCompareHtml(diff) {
  const v = pctNum(diff);
  const r = Number(Math.abs(v).toFixed(1));
  if (r === 0) return '<span class="trend-flat">' + T("cmp_same") + "</span>";
  const x = fmtNum(r, 1) + "\u00a0" + T("pp_unit_long");
  return '<span class="' + (v > 0 ? "trend-up" : "trend-down") + '">' + T(v > 0 ? "cmp_above" : "cmp_below").replace("{X}", x) + "</span>";
}

// Hatched fill for the "Unused potential" doughnut segment (brief A8), so
// it reads as potential that is missing rather than a solid category.
function hatchPattern(color) {
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 8;
    const x = c.getContext("2d");
    x.fillStyle = "#ffffff";
    x.fillRect(0, 0, 8, 8);
    x.strokeStyle = color;
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(-1, 9); x.lineTo(9, -1);
    x.moveTo(-3, 5); x.lineTo(5, -3);
    x.moveTo(3, 11); x.lineTo(11, 3);
    x.stroke();
    return x.createPattern(c, "repeat") || color;
  } catch (e) { return color; }
}

// Shared options for the time-series charts: slightly stronger gridlines
// (G9), level values shown without decimals in tooltips (C16), and a
// generous hit area so users need not hover exactly on a small point (C17).
function timeSeriesOptions(niceMin, niceMax) {
  return {
    responsive: true,
    animation: false,
    interaction: { mode: "nearest", intersect: false },
    elements: { point: { hitRadius: 16, hoverRadius: 5 } },
    scales: {
      y: { min: niceMin, max: niceMax, ticks: { callback: (v) => pctLevel(v) }, grid: { color: "rgba(0,0,0,0.16)" } },
      x: { grid: { color: "rgba(0,0,0,0.12)" } },
    },
    plugins: {
      legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 10 } } },
      tooltip: { callbacks: { label: (c) => c.dataset.label + ": " + (c.parsed.y != null ? pctLevel(c.parsed.y) : T("na")) } },
    },
  };
}
// Keyboard access to chart values (C17): focus the chart, then use the
// left/right arrow keys to step through the years.
function enableChartKeyboard(chart, canvas) {
  if (!canvas) return;
  canvas.setAttribute("tabindex", "0");
  let idx = -1;
  canvas.addEventListener("keydown", function (e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const n = chart.data.labels.length;
    idx = idx < 0 ? (e.key === "ArrowRight" ? 0 : n - 1) : Math.max(0, Math.min(n - 1, idx + (e.key === "ArrowRight" ? 1 : -1)));
    const els = [];
    chart.data.datasets.forEach((d, di) => { if (d.data[idx] != null && !d.hidden) els.push({ datasetIndex: di, index: idx }); });
    if (!els.length) return;
    const pt = chart.getDatasetMeta(els[0].datasetIndex).data[idx];
    chart.setActiveElements(els);
    chart.tooltip.setActiveElements(els, { x: pt.x, y: pt.y });
    chart.update();
  });
}

function trendArrow(delta, threshold) {
  threshold = threshold || 0.005;
  if (delta === null || delta === undefined) return '<span class="trend-flat">' + T("na") + "</span>";
  const p = ppText(delta, true);
  if (Math.abs(delta) < threshold) return '<span class="trend-flat">&#8594; ' + p + "</span>";
  if (delta > 0) return '<span class="trend-up">&#9650; ' + p + "</span>";
  return '<span class="trend-down">&#9660; ' + p + "</span>";
}

function tooltipHtml(feature) {
  // While a raster is on, the map shows overall IEI, so the tooltip is
  // locked to overall IEI too instead of following the Display dropdown.
  const displayKey = activeRasterKey !== "none" ? "I" : window.__displayKey();
  const kod = feature.properties.KOD;
  const name = orpName(kod);
  let html = "<strong>" + name + "</strong><br>";

  if (mode === "current") {
    const props = orpYear(kod, currentYear);
    if (!props) { html += T("no_data"); return html; }
    if (displayKey === "dominant") {
      const cls = dominantClass(props);
      const clsShare = cls && props.s ? props.s[cls] : null;
      html += T("dominant_class") + ": " + label(cls) + " (" + (clsShare != null ? pctLevel(clsShare * 100) + " " + T("share_of_area") : T("na")) + ")";
    } else if (displayKey === "I") {
      html += "IEI " + currentYear + ": " + (props.I != null ? pctLevel(props.I * 100) : T("na"));
    } else {
      const val = props[displayKey];
      const rMed = kod !== NATIONAL_KOD ? regionMedian(kod, currentYear, displayKey) : null;
      html += paramName(displayKey) + " " + currentYear + ": " + (val != null ? pctLevel(val * 100) : T("na")) + "<br>";
      html += T("region_median") + ": " + (rMed != null ? pctLevel(rMed * 100) : T("na"));
    }
  } else {
    const fromP = orpYear(kod, fromYear);
    const toP = orpYear(kod, toYear);
    const key = displayKey === "I" ? "I" : displayKey;
    const a = fromP ? fromP[key] : null;
    const b = toP ? toP[key] : null;
    const delta = (a != null && b != null) ? b - a : null;
    html += paramName(displayKey) + " " + fromYear + "→" + toYear + ": " + trendArrow(delta, 0.0005);
  }
  return html;
}

function onEachFeature(feature, layer) {
  layer.on("click", function () {
    selectedKod = feature.properties.KOD;
    renderLayer();
    showPanel(selectedKod);
  });
  layer.bindTooltip(function () { return tooltipHtml(feature); }, { sticky: true });
  // Only one tooltip may ever be open. Leaflet can drop a "mouseout" (fast
  // mouse moves over many small polygons, or the layer being re-created
  // while hovered), which left earlier tooltips stuck on screen.
  layer.on("mouseover", function () {
    if (lastTooltipLayer && lastTooltipLayer !== layer) lastTooltipLayer.closeTooltip();
    lastTooltipLayer = layer;
  });
  layer.on("mouseout", function () { layer.closeTooltip(); });
}
let lastTooltipLayer = null;
function closeAllTooltips() {
  if (lastTooltipLayer) { try { lastTooltipLayer.closeTooltip(); } catch (e) {} lastTooltipLayer = null; }
  map.eachLayer(function (l) { if (l instanceof L.Tooltip) map.removeLayer(l); });
}
map.on("mouseout movestart zoomstart", closeAllTooltips);

function renderLayer() {
  closeAllTooltips();
  currentKrajMates = (selectedKod && selectedKod !== NATIONAL_KOD) ? new Set(regionPeers(selectedKod)) : new Set();
  if (geoLayer) map.removeLayer(geoLayer);
  geoLayer = L.geoJSON(GEOM, { style: styleFeature, onEachFeature: onEachFeature, pane: "boundaryPane" }).addTo(map);
  if (!window.__fitted) {
    try { map.fitBounds(geoLayer.getBounds(), fitOpts()); window.__fitted = true; } catch (e) {}
  }
  // Force the selected ORP's outline to draw on top of every neighboring
  // polygon, regardless of feature order in the GeoJSON. Without this, a
  // neighbor's white border can get painted over part of the selected
  // outline wherever they share an edge, making the highlight look broken/
  // partial instead of a clean full outline. Kraj-mates are brought forward
  // too (after the selected ORP, so it still wins) so their gray outline
  // isn't broken up by a plain white neighbor edge on the far side.
  if (selectedKod) {
    geoLayer.eachLayer(function (layer) {
      const k = layer.feature && layer.feature.properties && layer.feature.properties.KOD;
      if (k && currentKrajMates.has(k)) layer.bringToFront();
    });
    geoLayer.eachLayer(function (layer) {
      if (layer.feature && layer.feature.properties && layer.feature.properties.KOD === selectedKod) {
        layer.bringToFront();
      }
    });
  }
  if (selectedLabelMarker) { map.removeLayer(selectedLabelMarker); selectedLabelMarker = null; }
  if (selectedKod && selectedKod !== NATIONAL_KOD) {
    geoLayer.eachLayer(function (layer) {
      if (layer.feature && layer.feature.properties && layer.feature.properties.KOD === selectedKod) {
        try {
          selectedLabelMarker = L.marker(layer.getBounds().getCenter(), {
            icon: L.divIcon({ className: "sel-pill", html: "<i></i>" + orpName(selectedKod), iconSize: null }),
            interactive: false, keyboard: false,
          }).addTo(map);
        } catch (e) {}
      }
    });
  }
  // Re-added after geoLayer so it draws on top -- geoLayer and the kraj
  // outline share boundaryPane, and re-adding geoLayer here (e.g. on every
  // ORP click) would otherwise leave its thin gray/selection lines drawn
  // last, on top of the black kraj outline, at any exact shared edge.
  renderKrajBoundary();
  renderLegend();
}

// ---------------------------------------------------------------------
// Side panel: Current State mode
// ---------------------------------------------------------------------
function healthColor(v) { return absoluteColor(v, HEALTH_DOMAIN[0], HEALTH_DOMAIN[1]); }

// ---------------------------------------------------------------------
// Panel building blocks (colleagues' design): breadcrumb, header with badge,
// key/value rows, collapsible chart section, rank lines.
// ---------------------------------------------------------------------
const CHEV_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>';
let chartCollapsed = false;
function kvRow(labelHtml, valueHtml) {
  return '<div class="kv"><span>' + labelHtml + "</span><span>" + valueHtml + "</span></div>";
}
function signClass(delta) {
  const r = Number(pctNum(delta).toFixed(1));
  return r > 0 ? "trend-up" : (r < 0 ? "trend-down" : "trend-flat");
}
function ppValue(delta) {
  return '<span class="' + signClass(delta) + '">' + ppText(delta, true) + "</span>";
}
function signedPpNumber(delta) {
  const v = pctNum(delta);
  return (Number(v.toFixed(1)) > 0 ? "+" : "") + fmtNum(v, 1);
}
// Full parameter name for sub-titles: the indicator, or "IEI (class)".
function paramFull(key) {
  return (!key || key === "I" || key === "dominant") ? T("health_index") : paramName(key);
}
function breadcrumbsHtml(kod) {
  if (kod === NATIONAL_KOD) return "";
  const rn = regionName(kod);
  return '<div class="p-crumbs"><a onclick="closeToNational()">&larr; ' + orpName(NATIONAL_KOD) + "</a>" +
    (rn ? '<span class="sep">·</span><a data-r="' + rn.replace(/"/g, "&quot;") + '" onclick="zoomToRegion(this.getAttribute(\'data-r\'))">' + rn + "</a>" : "") + "</div>";
}
function panelHeaderHtml(kod, badge, indicatorText) {
  const isNat = kod === NATIONAL_KOD;
  const sub = isNat ? T("national_sub") : T("orp_word") + " " + kod + (regionName(kod) ? " · <b>" + regionName(kod) + "</b>" : "");
  return breadcrumbsHtml(kod) +
    '<div class="p-head"><div><h2>' + orpName(kod) + '</h2><div class="p-sub">' + sub + '</div><span class="p-indicator">' + indicatorText + "</span></div>" +
    '<div class="p-badge ' + (badge.cls || "") + '"><b>' + badge.value + "</b>" + (badge.unit ? "<small>" + badge.unit + "</small>" : "") + "</div></div>";
}
function chartSectionHtml(kod, titleKey, infoKey) {
  const forKey = mode === "change" ? displayKey : "I";
  const who = kod === NATIONAL_KOD ? orpName(kod) : T("orp_word") + " " + orpName(kod);
  const aria = T(titleKey) + " – " + who;
  return '<div class="p-section' + (chartCollapsed ? " collapsed" : "") + '" id="chart-section"><div class="p-section-head"><div><h3>' + T(titleKey) +
    '</h3><div class="p-sub2">' + who + " · " + paramFull(forKey) + '</div></div><div class="head-actions">' + infoIcon(infoKey) +
    '<button type="button" class="chev-btn" onclick="toggleChartSection()" aria-label="' + T("collapse_label") + '">' + CHEV_SVG + "</button></div></div>" +
    '<div class="p-body"><div class="chart-wrap"><canvas id="chart" height="200" aria-label="' + aria + '"></canvas></div></div></div>';
}
function toggleChartSection() {
  chartCollapsed = !chartCollapsed;
  const sec = document.getElementById("chart-section");
  if (sec) sec.classList.toggle("collapsed", chartCollapsed);
  if (!chartCollapsed && chartInstance) setTimeout(() => chartInstance.resize(), 0);
}
// Position of an ORP's value among the ORPs of its region and of the country
// (1 = highest / largest increase). Display only -- no new calculation of the
// underlying data.
function rankText(kod, valFn) {
  const mine = valFn(kod);
  if (mine == null) return T("na");
  const all = Object.keys(ORP_DATA).filter((k) => k !== NATIONAL_KOD);
  const rk = (ids) => {
    let n = 0, better = 0;
    ids.forEach((k) => { const v = valFn(k); if (v == null) return; n++; if (v > mine) better++; });
    return { r: better + 1, n: n };
  };
  const reg = rk([kod].concat(regionPeers(kod)));
  const nat = rk(all);
  return fillT(T("rank_in_region"), { R: reg.r, N: reg.n }) + " · " + fillT(T("rank_in_country"), { R: nat.r, N: nat.n });
}
function changeRowsHtml(kod, key) {
  const delta = computeDelta(kod, key);
  const isNat = kod === NATIONAL_KOD;
  const natMed = median(Object.keys(ORP_DATA).filter((k) => k !== NATIONAL_KOD).map((k) => computeDelta(k, key)));
  let html = kvRow(T("row_total_change"), delta != null ? ppValue(delta) : T("na"));
  if (!isNat) {
    const regMed = median(regionPeers(kod).map((k) => computeDelta(k, key)));
    html += kvRow(T("region_median"), regMed != null ? ppValue(regMed) : T("na"));
    html += kvRow(T("row_vs_region"), delta != null && regMed != null ? ppValue(delta - regMed) : T("na"));
    html += kvRow(T("national_median"), natMed != null ? ppValue(natMed) : T("na"));
    html += kvRow(T("row_rank_change"), rankText(kod, (k) => computeDelta(k, key)));
  } else {
    html += kvRow(T("national_median"), natMed != null ? ppValue(natMed) : T("na"));
  }
  // Slope of the linear trend and its statistical significance (p-value of the
  // regression slope), as stored with each ORP -- display only.
  const tr = orpTrend(kod, key);
  if (tr && tr.slope != null) {
    html += kvRow(T("row_slope"), '<span class="' + signClass(tr.slope) + '">' + ppText(tr.slope, true) + T("per_year") + "</span>");
    if (tr.p != null) {
      const pTxt = tr.p < 0.001 ? "< " + fmtNum(0.001, 3) : fmtNum(tr.p, 2);
      html += kvRow(T("row_signif"), T(tr.p < 0.05 ? "signif_yes" : "signif_no").replace("{P}", pTxt));
    }
  }
  return html;
}

function renderCurrentPanel(kod) {
  const rankingHtml = renderCurrentLeaderboard(kod);
  if (!kod) {
    document.getElementById("panel-content").innerHTML =
      '<div class="placeholder">' + T("panel_placeholder") + "</div>" + rankingHtml;
    return;
  }

  const name = orpName(kod);
  const props = orpYear(kod, currentYear);
  const prevYear = YEARS[YEARS.indexOf(currentYear) - 1];
  const prevProps = prevYear !== undefined ? orpYear(kod, prevYear) : null;

  const featuredBucket = BUCKET_KEYS.includes(displayKey);
  const isNational = kod === NATIONAL_KOD;
  // Per client feedback: the badge now shows whichever metric is actually
  // featured -- overall Ecosystem Integrity by default, or the selected
  // category's own EI once one is picked in the Display dropdown -- rather
  // than always showing the whole-ORP number regardless of what's being
  // explored below. The old separate "{Category} -- {year}" card is folded
  // into this one instead of restating the same numbers twice.
  const badgeKey = featuredBucket ? displayKey : "I";
  const badgeLabel = featuredBucket ? label(displayKey) : T("health_index");

  function bucketColor(key, v) {
    if (v == null) return "#999";
    const dom = key === "I" ? HEALTH_DOMAIN : (BUCKET_DOMAINS[key] || HEALTH_DOMAIN);
    return absoluteColor(v, dom[0], dom[1]);
  }

  const idxVal = props ? props[badgeKey] : null;
  const idxColor = bucketColor(badgeKey, idxVal);
  const idxPct = idxVal != null ? pctLevel(idxVal * 100) : T("na");
  const idxDelta = (props && prevProps) ? props[badgeKey] - prevProps[badgeKey] : null;
  // Region (kraj) comparison only, per client request -- dropped the
  // direct-neighbor (shared-boundary) comparison entirely, since having
  // two different "neighbor" definitions side by side was causing
  // confusion. Kraj is now the one consistent comparison group everywhere.
  const idxRMed = kod !== NATIONAL_KOD ? regionMedian(kod, currentYear, badgeKey) : null;

  const trend = orpTrend(kod, badgeKey);
  let trendSummary = "";
  if (trend && trend.slope !== null) {
    trendSummary = T("trend_summary").replace("{LABEL}", badgeKey === "I" ? "IEI" : badgeLabel) + " " + trendArrow(trend.slope, 0.0005) + " " + T("trend_summary_suffix");
  }

  // Composition + contribution pies are back to always showing (per client
  // feedback -- the two-bar area chart tried before didn't land) -- when a
  // category is featured, its own slice/legend row stays fully colored
  // while the other three (plus "Untapped potential") fade out instead of
  // being replaced by a different chart.
  const isFadedBucket = (k) => featuredBucket && k !== displayKey;

  let pieHtml = "";
  let contribPieHtml = "";
  if (props && props.s) {
    pieHtml = '<div class="card"><h3>' + T("composition_title") + ' ' + infoIcon("composition") + '</h3><div class="pie-wrap">' +
      '<canvas id="pie-chart"></canvas>' +
      '<div class="pie-legend">' +
      BUCKET_KEYS.map((k) => '<div style="opacity:' + (isFadedBucket(k) ? "0.3" : "1") + ';"><span class="swatch" style="background:' + BUCKET_COLORS[k] + '"></span>' + label(k) + ": " + pctLevel((props.s[k] || 0) * 100) + "</div>").join("") +
      "</div></div></div>";

    // Contribution-to-index pie: each bucket's EI value weighted by its
    // share of ORP area. Sums to the same overall RIEI value shown in the
    // badge above (verified against the stored data) -- the remainder up to
    // 100% is shown as "Untapped potential," matching the requested design.
    const contributions = BUCKET_KEYS.map((k) => (props[k] != null ? props[k] * (props.s[k] || 0) : 0));
    const contribSum = contributions.reduce((a, b) => a + b, 0);
    const untapped = Math.max(0, 1 - contribSum);
    contribPieHtml = '<div class="card"><h3>' + T("contribution_title") + ' ' + infoIcon("contribution") + '</h3><div class="pie-wrap">' +
      '<canvas id="pie-chart-contrib"></canvas>' +
      '<div class="pie-legend">' +
      BUCKET_KEYS.map((k, i) => '<div style="opacity:' + (isFadedBucket(k) ? "0.3" : "1") + ';"><span class="swatch" style="background:' + BUCKET_COLORS[k] + '"></span>' + label(k) + ": " + pctLevel(contributions[i] * 100) + "</div>").join("") +
      '<div style="opacity:' + (featuredBucket ? "0.3" : "1") + ';"><span class="swatch" style="background:repeating-linear-gradient(45deg,' + UNTAPPED_COLOR + ' 0,' + UNTAPPED_COLOR + ' 2px,#fff 2px,#fff 4px)"></span>' + T("untapped_potential") + ": " + pctLevel(untapped * 100) + "</div>" +
      "</div></div></div>";
  }

  // Sub-category breakdown: what fine-grained land-cover types (e.g. for
  // Forest: spruce/beech/oak/pine stands, natural vs. non-natural) make up
  // the currently featured bucket. Sourced from the raster classification's
  // pixel counts (same lookup table used for the area_ha figures), grouped
  // to the top 6 classes plus "Other" so a 17-class bucket like Forest
  // still reads as a chart rather than a wall of legend text.
  let subPieHtml = "";
  let subPieData = null;
  if (featuredBucket) {
    const rec = ORP_DATA[kod];
    const subCounts = rec && rec.sub ? rec.sub[displayKey] : null;
    if (subCounts && Object.keys(subCounts).length) {
      const entries = Object.entries(subCounts).sort((a, b) => b[1] - a[1]);
      const total = entries.reduce((sum, e) => sum + e[1], 0);
      const top = entries.slice(0, 6);
      const restSum = entries.slice(6).reduce((sum, e) => sum + e[1], 0);
      const rows = top.map(([rid, c]) => ({ label: SUBCAT_LABELS[rid] ? SUBCAT_LABELS[rid][lang] : rid, value: c }));
      if (restSum > 0) rows.push({ label: T("subcategory_other"), value: restSum });
      const colors = rows.map((_, i) => subcatColor(displayKey, i, rows.length));
      subPieData = { rows, colors, total };
      subPieHtml = '<div class="card"><h3>' + T("subcategory_title").replace("{LABEL}", label(displayKey)) + ' ' + infoIcon("subcategory") + '</h3><div class="pie-wrap">' +
        '<canvas id="pie-chart-sub"></canvas>' +
        '<div class="pie-legend">' +
        rows.map((r, i) => '<div><span class="swatch" style="background:' + colors[i] + '"></span>' + r.label + ": " + pctLevel((r.value / total) * 100) + "</div>").join("") +
        "</div></div></div>";
    }
  }

  const panel = document.getElementById("panel-content");
  const levelOf = (k) => { const pp = orpYear(k, currentYear); return pp ? pp[badgeKey] : null; };
  const natLevels = Object.keys(ORP_DATA).filter((k) => k !== NATIONAL_KOD).map(levelOf).filter((v) => v != null);
  const natMedLevel = median(natLevels);
  let rows = kvRow((featuredBucket ? label(displayKey) + " – " : "") + T("row_value"), idxVal != null ? pctLevel(idxVal * 100, 1) : T("na"));
  if (idxDelta != null && prevYear !== undefined) rows += kvRow(T("yoy") + " (" + T("since") + " " + prevYear + ")", ppValue(idxDelta));
  if (!isNational) {
    rows += kvRow(T("region_median"), idxRMed != null ? pctLevel(idxRMed * 100, 1) : T("na"));
    // Full sentence in percentage points (brief A16): "O 1,1 p. b. vyšší ve srovnání s krajským mediánem"
    rows += '<div class="kv"><span>' + (idxVal != null && idxRMed != null ? regionCompareHtml(idxVal - idxRMed) : T("na")) + "</span></div>";
    rows += kvRow(T("national_median"), natMedLevel != null ? pctLevel(natMedLevel * 100, 1) : T("na"));
    rows += kvRow(T("row_rank_level"), rankText(kod, levelOf));
  } else if (natMedLevel != null) {
    rows += kvRow(T("national_median"), pctLevel(natMedLevel * 100, 1));
  }
  panel.innerHTML =
    panelHeaderHtml(kod, { cls: "", value: idxPct, unit: "IEI " + currentYear }, paramFull(badgeKey) + " · " + currentYear) +
    '<div class="p-section"><div class="p-section-head"><h3>' + fillT(T("section_level_title"), { PARAM: paramName(badgeKey), YEAR: currentYear }) + '</h3><div class="head-actions">' + infoIcon("iei") + "</div></div>" +
    rows +
    (trendSummary ? '<div class="kv-note">' + trendSummary + "</div>" : "") +
    (!isNational ? '<div class="kv-note">' + T("comparison_desc") + " (" + regionName(kod) + ").</div>" : "") +
    "</div>" +
    pieHtml + contribPieHtml + subPieHtml +
    chartSectionHtml(kod, "chart_history_title", "history_current") +
    rankingHtml;

  if (pieInstance) { pieInstance.destroy(); pieInstance = null; }
  if (contribPieInstance) { contribPieInstance.destroy(); contribPieInstance = null; }
  if (subPieInstance) { subPieInstance.destroy(); subPieInstance = null; }
  if (props && props.s) {
    const ctx = document.getElementById("pie-chart").getContext("2d");
    pieInstance = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: BUCKET_KEYS.map(label),
        datasets: [{ data: BUCKET_KEYS.map((k) => props.s[k] || 0), backgroundColor: BUCKET_KEYS.map((k) => isFadedBucket(k) ? hexToRgba(BUCKET_COLORS[k], 0.25) : BUCKET_COLORS[k]) }],
      },
      // animation off by default -- with it on, every ORP click re-sweeps
      // the pie clockwise from scratch, which hides the actual before/after
      // change between two ORPs instead of showing it. Re-enabled only when
      // returning to the national view (animatePieOnNextRender).
      options: { plugins: { legend: { display: false } }, cutout: "55%", animation: animatePieOnNextRender ? {} : false },
    });

    const contributions = BUCKET_KEYS.map((k) => (props[k] != null ? props[k] * (props.s[k] || 0) : 0));
    const contribSum = contributions.reduce((a, b) => a + b, 0);
    const untapped = Math.max(0, 1 - contribSum);
    const ctxContrib = document.getElementById("pie-chart-contrib").getContext("2d");
    contribPieInstance = new Chart(ctxContrib, {
      type: "doughnut",
      data: {
        labels: BUCKET_KEYS.map(label).concat([T("untapped_potential")]),
        datasets: [{
          data: contributions.concat([untapped]),
          backgroundColor: BUCKET_KEYS.map((k) => isFadedBucket(k) ? hexToRgba(BUCKET_COLORS[k], 0.25) : BUCKET_COLORS[k])
            .concat([hatchPattern(featuredBucket ? hexToRgba(UNTAPPED_COLOR, 0.35) : UNTAPPED_COLOR)]),
        }],
      },
      options: { plugins: { legend: { display: false } }, cutout: "55%", animation: animatePieOnNextRender ? {} : false },
    });
    animatePieOnNextRender = false;
  }
  if (subPieData) {
    const ctxSub = document.getElementById("pie-chart-sub").getContext("2d");
    subPieInstance = new Chart(ctxSub, {
      type: "doughnut",
      data: {
        labels: subPieData.rows.map((r) => r.label),
        datasets: [{ data: subPieData.rows.map((r) => r.value), backgroundColor: subPieData.colors }],
      },
      options: { plugins: { legend: { display: false } }, cutout: "55%", animation: false },
    });
  }

  const rec = ORP_DATA[kod];
  const labels = YEARS;
  // when a specific class is picked in the Display dropdown, fade the other
  // lines so the featured environment stands out; when the mode is Health
  // Index or Dominant Class (no single class "selected"), show all lines
  // at their normal weight since none of them is being featured
  // Unclassified (X) dropped from this chart per client feedback -- it's
  // not one of the four buckets that count toward the composite index
  // anyway, just noise here. BUCKET_KEYS (not ALL_KEYS) drives the lines.
  const aClassIsFeatured = BUCKET_KEYS.includes(displayKey);
  // When a bucket is featured, fade the other three bucket lines and dim
  // the EI line. When EI itself is featured (nothing picked in Display),
  // fade all four bucket lines instead and keep EI fully opaque -- either
  // way, exactly one line on the chart reads as "the one you're looking at."
  const datasets = BUCKET_KEYS.map((k) => {
    const isFeatured = displayKey === k;
    const faded = aClassIsFeatured ? !isFeatured : true;
    return {
      label: label(k),
      data: YEARS.map((y) => { const p = rec.y[String(y)]; return p && p[k] != null ? p[k] * 100 : null; }),
      borderColor: faded ? hexToRgba(BUCKET_COLORS[k], 0.25) : BUCKET_COLORS[k],
      backgroundColor: isFeatured ? hexToRgba(BUCKET_COLORS[k], 0.25) : (faded ? hexToRgba(BUCKET_COLORS[k], 0.25) : BUCKET_COLORS[k]),
      borderWidth: isFeatured ? 4 : (faded ? 1 : 2),
      pointRadius: 0,
      // Featured bucket is filled down to the axis -- reads as "the area
      // this category covers" rather than just another line among many.
      fill: isFeatured ? "origin" : false,
      spanGaps: true,
      tension: 0.25,
      order: isFeatured ? 2 : 0, // Chart.js draws lower "order" first -- featured line drawn last, on top
    };
  });
  datasets.push({
    label: label("I"),
    data: YEARS.map((y) => { const p = rec.y[String(y)]; return p && p.I != null ? p.I * 100 : null; }),
    borderColor: aClassIsFeatured ? "rgba(0,114,112,0.55)" : "#007270",
    backgroundColor: aClassIsFeatured ? "rgba(0,114,112,0.55)" : "#007270",
    borderWidth: aClassIsFeatured ? 2 : 4,
    borderDash: [5, 3],
    spanGaps: true,
    tension: 0.25,
    pointRadius: 0,
    order: 1,
  });

  const niceMax = computeNiceAxisMax(datasets.map((d) => d.data));
  const niceMin = computeNiceAxisMin(datasets.map((d) => d.data));
  const ctx2 = document.getElementById("chart").getContext("2d");
  if (chartInstance) chartInstance.destroy();
  // animation is off inside timeSeriesOptions -- this chart redraws on every
  // ORP click, year-slider move and Display change.
  chartInstance = new Chart(ctx2, {
    type: "line",
    data: { labels: labels, datasets: datasets },
    options: timeSeriesOptions(niceMin, niceMax),
  });
  enableChartKeyboard(chartInstance, document.getElementById("chart"));
}

// ---------------------------------------------------------------------
// Side panel: Change over Time mode
// ---------------------------------------------------------------------
function computeDelta(kod, key) {
  const a = orpYear(kod, fromYear);
  const b = orpYear(kod, toYear);
  if (!a || !b || a[key] == null || b[key] == null) return null;
  return b[key] - a[key];
}

// Ranking lists. `rows` is sorted ascending by value. Best values are shown
// FIRST (top list), worst below (brief A11). cfg:
//   kind: "level" (IEI in one year, shown in %) | "change" (difference in
//         percentage points, coloured by sign, never by list position)
//   title, note: ready-made HTML strings
//   kod: selected ORP (or null/NATIONAL), allRows: every ORP's value, used
//        for the national median; rows: the (possibly region-scoped) list
function leaderboardHtml(cfg) {
  const rows = cfg.rows, kind = cfg.kind;
  const infoKey = kind === "level" ? "leaderboard_levels" : "leaderboard_change";
  // Context line so the table stands on its own (selected ORP / country).
  const ctxName = (cfg.kod && cfg.kod !== NATIONAL_KOD) ? T("orp_word") + " " + orpName(cfg.kod) : orpName(NATIONAL_KOD);
  const head = '<div class="card"><h3>' + cfg.title + " " + infoIcon(infoKey) + '</h3><div class="sub" style="margin:-2px 0 10px;">' + ctxName + '</div><div class="leaderboard">';

  if (rows.length < 2) {
    return head + '<div class="sub">' + T("region_too_small") + "</div></div></div>";
  }

  // Cap to 5 per side but never let the two halves overlap when the scoped
  // list (e.g. a single kraj) has fewer than 10 ORPs in it.
  const half = Math.min(5, Math.floor(rows.length / 2));
  const worst = rows.slice(0, half);                // lowest values
  const best = rows.slice(rows.length - half).reverse(); // highest values, best first

  const fmtVal = (v) => kind === "level" ? pctLevel(v * 100, 1) : ppText(v, true);
  const cellClass = (v) => {
    if (kind === "level") return "val-neutral";
    const r = Number(pctNum(v).toFixed(1));
    return r > 0 ? "val-up" : (r < 0 ? "val-down" : "val-flat");
  };
  function rowsHtml(list) {
    return list.map((r, i) => (
      "<tr" + (r.kod === cfg.kod ? ' class="sel-row"' : "") + " onclick=\"selectFromLeaderboard('" + r.kod + "')\"><td>" + (i + 1) + "</td><td>" + orpName(r.kod) +
      '</td><td class="' + cellClass(r.val) + '">' + fmtVal(r.val) + "</td></tr>"
    )).join("");
  }

  // Titles follow the actual signs (brief C12), never the list position.
  let topTitle, bottomTitle;
  if (kind === "level") {
    topTitle = T("highest_values");
    bottomTitle = T("lowest_values");
  } else {
    topTitle = best.some((r) => Number(pctNum(r.val).toFixed(1)) > 0) ? T("biggest_improvement") : T("smallest_decrease");
    bottomTitle = worst.every((r) => Number(pctNum(r.val).toFixed(1)) > 0) ? T("smallest_increase") : T("biggest_decline");
  }

  // Reference values (brief A13/C13): regional median (other ORPs of the
  // same region, same definition as the detail panel) and national median.
  const scoped = cfg.kod && cfg.kod !== NATIONAL_KOD;
  const medianOf = (list) => median(list.map((r) => r.val));
  let refs = [];
  if (scoped) {
    const regMed = medianOf(rows.filter((r) => r.kod !== cfg.kod));
    refs.push(T("region_median") + ": " + (regMed != null ? fmtVal(regMed) : T("na")));
  }
  const natMed = medianOf(cfg.allRows);
  refs.push(T("national_median") + ": " + (natMed != null ? fmtVal(natMed) : T("na")));

  return head +
    '<table><thead><tr><th></th><th>&#9650; ' + topTitle + '</th><th></th></tr></thead><tbody>' + rowsHtml(best) + "</tbody></table>" +
    '<div style="height:8px;"></div>' +
    '<table><thead><tr><th></th><th>&#9660; ' + bottomTitle + '</th><th></th></tr></thead><tbody>' + rowsHtml(worst) + "</tbody></table>" +
    '<div class="sub" style="margin-top:6px;">' + refs.join(" · ") + "</div>" +
    '<div class="sub" style="margin-top:4px;">' + cfg.note + "</div></div></div>";
}

// Change-over-time mode: rank by delta between the two selected years.
// Scoped to the selected ORP's own kraj (VUSC region) once an ORP is picked,
// per client request -- falls back to the full national ranking on the
// national view (no ORP selected yet).
function renderChangeLeaderboard(kod) {
  const key = displayKey === "I" ? "I" : displayKey;
  const scoped = kod && kod !== NATIONAL_KOD;
  const allowed = scoped ? new Set([kod, ...regionPeers(kod)]) : null;
  const allRows = Object.keys(ORP_DATA)
    .filter((k) => k !== NATIONAL_KOD)
    .map((k) => ({ kod: k, val: computeDelta(k, key) }))
    .filter((r) => r.val !== null);
  const rows = allRows.filter((r) => !allowed || allowed.has(r.kod)).sort((a, b) => a.val - b.val);
  const scopeLabel = scoped ? regionName(kod) : null;
  const vars = { PARAM: paramName(displayKey), FROM: fromYear, TO: toYear };
  return leaderboardHtml({
    kind: "change", rows: rows, allRows: allRows, kod: kod,
    title: fillT(T("leaderboard_title"), vars) + (scopeLabel ? " — " + scopeLabel : ""),
    note: fillT(T("change_note"), vars),
  });
}

// Annual overview: rank by the absolute IEI level in the single selected
// year (not a delta). Scoped to the selected ORP's own kraj once picked.
function renderCurrentLeaderboard(kod) {
  const key = displayKey === "dominant" ? "I" : displayKey;
  const scoped = kod && kod !== NATIONAL_KOD;
  const allowed = scoped ? new Set([kod, ...regionPeers(kod)]) : null;
  const allRows = Object.keys(ORP_DATA)
    .filter((k) => k !== NATIONAL_KOD)
    .map((k) => { const p = orpYear(k, currentYear); return { kod: k, val: p ? p[key] : null }; })
    .filter((r) => r.val !== null);
  const rows = allRows.filter((r) => !allowed || allowed.has(r.kod)).sort((a, b) => a.val - b.val);
  const scopeLabel = scoped ? regionName(kod) : null;
  const filterActive = BUCKET_KEYS.includes(displayKey);
  return leaderboardHtml({
    kind: "level", rows: rows, allRows: allRows, kod: kod,
    title: fillT(T("ranking_title"), { PARAM: paramName(key), YEAR: currentYear }) + (scopeLabel ? " — " + scopeLabel : ""),
    note: fillT(T("values_note"), { YEAR: currentYear, FILTER: filterActive ? T("values_filter") : "" }),
  });
}

window.selectFromLeaderboard = function (kod) {
  selectedKod = kod;
  renderLayer();
  showPanel(kod);
};

// "Close" button on an ORP's panel -- returns to the national aggregate view.
window.closeToNational = function () {
  selectedKod = NATIONAL_KOD;
  animatePieOnNextRender = true;
  renderLayer();
  showPanel(selectedKod);
};

function renderChangePanel(kod) {
  const leaderboard = renderChangeLeaderboard(kod);

  if (!kod) {
    document.getElementById("panel-content").innerHTML =
      '<div class="placeholder">' + T("panel_placeholder") + "</div>" + leaderboard;
    return;
  }

  const name = orpName(kod);
  const key = displayKey === "I" ? "I" : displayKey;
  const delta = computeDelta(kod, key);
  // Trend is still computed for the fitted trend-line overlay on the
  // history chart below -- only the standalone stats card was removed
  // (same simplification as the Current State panel).
  const trend = orpTrend(kod, key);

  const isNational = kod === NATIONAL_KOD;
  const panel = document.getElementById("panel-content");
  const badge = delta == null
    ? { cls: "", value: T("na"), unit: "" }
    : { cls: signClass(delta) === "trend-up" ? "pos" : (signClass(delta) === "trend-down" ? "neg" : ""), value: signedPpNumber(delta), unit: T("pp_unit") };
  const changeLong = displayKey === "I"
    ? fillT(T("change_title"), { FROM: fromYear, TO: toYear })
    : fillT(T("change_title_param"), { LABEL: label(displayKey), FROM: fromYear, TO: toYear });
  panel.innerHTML =
    panelHeaderHtml(kod, badge, paramFull(key) + " · " + fromYear + "–" + toYear) +
    '<div class="p-section"><div class="p-section-head"><div><h3>' + fillT(T("section_change_title"), { FROM: fromYear, TO: toYear }) + '</h3><div class="p-sub2">' + changeLong +
    '</div></div><div class="head-actions">' + infoIcon("delta") + "</div></div>" +
    changeRowsHtml(kod, key) +
    '<div class="kv-note">' + T("slope_note") + " " + T("significance_note") + "</div></div>" +
    chartSectionHtml(kod, "chart_trend_title", "history_change") +
    leaderboard;

  const rec = ORP_DATA[kod];
  const labels = YEARS;
  const dataVals = YEARS.map((y) => { const p = rec.y[String(y)]; return p && p[key] != null ? p[key] * 100 : null; });

  // fitted OLS trend line overlay, using the precomputed slope/intercept-equivalent
  // (reconstructed from slope + the series' own mean, since intercept wasn't stored
  // separately at this granularity -- good enough for a visual trend overlay).
  // Computed in the same 0-100 percentage scale as dataVals above.
  let trendLine = null;
  if (trend && trend.slope !== null) {
    const validPairs = YEARS.map((y, i) => [y, dataVals[i]]).filter((p) => p[1] !== null);
    const meanY = validPairs.reduce((s, p) => s + p[1], 0) / validPairs.length;
    const meanX = validPairs.reduce((s, p) => s + p[0], 0) / validPairs.length;
    const slopePct = trend.slope * 100;
    trendLine = YEARS.map((y) => meanY + slopePct * (y - meanX));
  }

  const datasets = [{
    label: displayKey === "I" ? label("I") : label(displayKey),
    data: dataVals,
    borderColor: displayKey === "I" ? "#007270" : BUCKET_COLORS[displayKey],
    backgroundColor: displayKey === "I" ? "#007270" : BUCKET_COLORS[displayKey],
    borderWidth: 3,
    spanGaps: true,
    tension: 0.25,
    pointRadius: 0,
  }];
  if (trendLine) {
    datasets.push({
      label: T("trend_title"),
      data: trendLine,
      borderColor: "#B54836",
      borderDash: [6, 4],
      borderWidth: 2,
      pointRadius: 0,
      fill: false,
    });
  }

  const niceMax = computeNiceAxisMax(datasets.map((d) => d.data));
  const niceMin = computeNiceAxisMin(datasets.map((d) => d.data));
  const ctx = document.getElementById("chart").getContext("2d");
  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, {
    type: "line",
    data: { labels: labels, datasets: datasets },
    options: timeSeriesOptions(niceMin, niceMax),
  });
  enableChartKeyboard(chartInstance, document.getElementById("chart"));
}

function showPanel(kod) {
  if (mode === "current") renderCurrentPanel(kod);
  else renderChangePanel(kod);
  if (window.mobileAfterPanel) window.mobileAfterPanel();
}

// ---------------------------------------------------------------------
// Controls wiring
// ---------------------------------------------------------------------
function buildDisplaySelect() {
  const sel = document.getElementById("display-select");
  // "Dominant class" removed from the dropdown per client feedback -- the
  // dominantClass()/legend_dominant rendering paths are left in place
  // (unreachable now that displayKey can never become "dominant" via the
  // UI) rather than ripped out, to keep this change low-risk.
  const options = [["I", T("health_index")], ["F", label("F")], ["A", label("A")], ["G", label("G")], ["U", label("U")]];
  sel.innerHTML = options.map((o) => '<option value="' + o[0] + '"' + (o[0] === displayKey ? " selected" : "") + ">" + o[1] + "</option>").join("");
  if (!options.find((o) => o[0] === displayKey)) { displayKey = "I"; sel.value = "I"; }
}

function buildYearSelects() {
  const fromSel = document.getElementById("from-year-select");
  const toSel = document.getElementById("to-year-select");
  fromSel.innerHTML = YEARS.map((y) => '<option value="' + y + '"' + (y === fromYear ? " selected" : "") + ">" + y + "</option>").join("");
  toSel.innerHTML = YEARS.map((y) => '<option value="' + y + '"' + (y === toYear ? " selected" : "") + ">" + y + "</option>").join("");
  const ySel = document.getElementById("year-select");
  if (ySel) ySel.innerHTML = YEARS.map((y) => '<option value="' + y + '"' + (y === currentYear ? " selected" : "") + ">" + y + "</option>").join("");
}

document.getElementById("display-select").addEventListener("change", function (e) {
  displayKey = e.target.value;
  renderLayer();
  showPanel(selectedKod);
});

document.getElementById("year-select").addEventListener("change", function (e) {
  currentYear = parseInt(e.target.value, 10);
  currentYearIdx = YEARS.indexOf(currentYear);
  renderLayer();
  showPanel(selectedKod);
});

document.getElementById("from-year-select").addEventListener("change", function (e) {
  fromYear = parseInt(e.target.value, 10);
  if (fromYear >= toYear) { toYear = YEARS[Math.min(YEARS.indexOf(fromYear) + 1, YEARS.length - 1)]; buildYearSelects(); }
  renderLayer();
  showPanel(selectedKod);
});
document.getElementById("to-year-select").addEventListener("change", function (e) {
  toYear = parseInt(e.target.value, 10);
  if (toYear <= fromYear) { fromYear = YEARS[Math.max(YEARS.indexOf(toYear) - 1, 0)]; buildYearSelects(); }
  renderLayer();
  showPanel(selectedKod);
});

function setMode(m) {
  mode = m;
  // Per client feedback: switching between Year Snapshot and Change over
  // Time should always drop back into the normal choropleth ("vector
  // world") map -- a raster left on from a previous view shouldn't
  // follow the user into a mode it doesn't apply to.
  closeInfoPopover();
  if (tourOpen) closeTour();
  tourIndex = 0;
  clearRaster();
  buildRasterSelect();
  document.getElementById("mode-current").classList.toggle("active", m === "current");
  document.getElementById("mode-change").classList.toggle("active", m === "change");
  document.getElementById("current-year-group").style.display = m === "current" ? "flex" : "none";
  // range-year-group now lives in the right-hand panel (a .card), not the
  // dark header row, so it toggles as a block, not flex, per client
  // feedback that the year-range control should sit next to what it
  // actually affects (the change-analysis leaderboard/chart) instead of
  // implying it drives the whole dashboard from the header.
  document.getElementById("range-year-group").style.display = m === "change" ? "flex" : "none";
  document.getElementById("nav-map").classList.add("active");
  buildYearSelects();
  positionOverlays();
  if (m === "change" && displayKey === "dominant") displayKey = "I";
  buildDisplaySelect();
  renderLayer();
  showPanel(selectedKod);
}


// ---------------------------------------------------------------------
// Map overlays layout, view controls
// ---------------------------------------------------------------------
let selectedLabelMarker = null;
function filterCardHeight() {
  const card = document.getElementById("filter-card");
  return card ? card.offsetHeight : 0;
}
// Padding so fitted bounds are not hidden under the floating filter card.
function fitOpts() {
  const wide = window.innerWidth > 900;
  // Narrow screens: the filter chip sits on top of the map and the bottom sheet
  // covers its lower part, so keep fitted bounds clear of both.
  if (!wide) return { paddingTopLeft: [12, 72], paddingBottomRight: [12, (window.mobileSheetPx ? window.mobileSheetPx() : 250) + 12] };
  return { paddingTopLeft: [16, filterCardHeight() + 28], paddingBottomRight: [16, 16] };
}
function positionOverlays() {
  const wide = window.innerWidth > 900;
  const h = filterCardHeight();
  const z = document.querySelector(".leaflet-top.leaflet-right");
  if (z) z.style.marginTop = wide ? (h + 28) + "px" : "";
  const tour = document.getElementById("tour-overlay");
  if (tour) tour.style.top = wide ? (h + 32) + "px" : "16px";
}
window.addEventListener("resize", positionOverlays);

function fitToSelection() {
  if (!geoLayer) return;
  if (!selectedKod || selectedKod === NATIONAL_KOD) {
    try { map.fitBounds(geoLayer.getBounds(), fitOpts()); } catch (e) {}
    return;
  }
  geoLayer.eachLayer(function (layer) {
    if (layer.feature && layer.feature.properties && layer.feature.properties.KOD === selectedKod) {
      try { map.fitBounds(layer.getBounds(), Object.assign(fitOpts(), { maxZoom: 12 })); } catch (e) {}
    }
  });
}
window.zoomToRegion = function (name) {
  if (!geoLayer) return;
  let b = null;
  geoLayer.eachLayer(function (layer) {
    const k = layer.feature && layer.feature.properties && layer.feature.properties.KOD;
    const info = k ? REGION_INFO[k] : null;
    if (info && info.name === name) {
      const lb = layer.getBounds();
      b = b ? b.extend(lb) : L.latLngBounds(lb.getSouthWest(), lb.getNorthEast());
    }
  });
  if (b) { try { map.fitBounds(b, fitOpts()); } catch (e) {} }
};
// "Zobrazit": bring the map to the current selection (the filters themselves
// apply immediately). "Obnovit": back to the default national overview.
function applyView() { fitToSelection(); }
function resetView() {
  displayKey = "I";
  currentYearIdx = YEARS.length - 1;
  currentYear = YEARS[currentYearIdx];
  fromYear = YEARS[0];
  toYear = YEARS[YEARS.length - 1];
  selectedKod = NATIONAL_KOD;
  animatePieOnNextRender = true;
  setMode("current");
  fitToSelection();
}

// ---------------------------------------------------------------------
// Top navigation: Metodika (methodology) and Data ke stažení (downloads)
// ---------------------------------------------------------------------
function showView() {
  ["intro-banner", "contact-banner", "method-banner", "data-banner"].forEach((id) => { document.getElementById(id).style.display = "none"; });
}
function openMethod() {
  const parts = [1, 2, 3, 4].map((i) => '<h3 class="method-h">' + T("method_h" + i) + "</h3><p>" + T("method_p" + i) + "</p>").join("");
  document.getElementById("method-body").innerHTML =
    '<span class="modal-eyebrow">' + T("method_eyebrow") + "</span><h2>" + T("method_title") + "</h2>" + parts +
    '<h3 class="method-h">' + T("method_h5") + "</h3><p>" + T("intro_reference") +
    ' <a href="https://doi.org/10.1016/j.scitotenv.2021.148994" target="_blank" rel="noopener">https://doi.org/10.1016/j.scitotenv.2021.148994</a></p>' +
    '<button class="modal-continue-btn" onclick="closeMethod()">' + T("contact_close") + "</button>";
  document.getElementById("method-banner").style.display = "flex";
}
function closeMethod() { document.getElementById("method-banner").style.display = "none"; }

const DOWNLOADS = [
  { id: "levels", t: "dl_levels_title", d: "dl_levels_desc" },
  { id: "change", t: "dl_change_title", d: "dl_change_desc" },
  { id: "trend", t: "dl_trend_title", d: "dl_trend_desc" },
];
function openData() {
  const items = DOWNLOADS.map((it) =>
    '<div class="dl-item"><div><b>' + T(it.t) + "</b><span>" + fillT(T(it.d), { FROM: fromYear, TO: toYear }) + '</span></div>' +
    '<button type="button" class="btn-primary" onclick="downloadData(\'' + it.id + '\')">' + T("dl_button") + "</button></div>").join("");
  document.getElementById("data-body").innerHTML =
    '<span class="modal-eyebrow">' + T("data_eyebrow") + "</span><h2>" + T("data_title") + "</h2><p>" + T("data_intro") + "</p>" +
    '<div class="dl-list">' + items + '</div><p class="kv-note">' + T("data_note") + "</p>" +
    '<button class="modal-continue-btn" onclick="closeData()">' + T("contact_close") + "</button>";
  document.getElementById("data-banner").style.display = "flex";
}
function closeData() { document.getElementById("data-banner").style.display = "none"; }

// CSV export of the values already shown in the portal (nothing is
// recalculated): built in the browser, UTF-8 with BOM so Excel reads the
// Czech characters correctly.
function csvCell(v) {
  if (v === null || v === undefined) return "";
  const t = String(v);
  return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}
function downloadCsv(filename, rows) {
  const text = "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const CSV_CLASSES = [["I", "iei"], ["F", "les"], ["A", "zemedelska_puda"], ["G", "travni_porosty"], ["U", "zastavene_uzemi"]];
function orpKods() {
  return Object.keys(ORP_DATA).filter((k) => k !== NATIONAL_KOD).sort((a, b) => Number(a) - Number(b));
}
function buildCsv(id) {
  const pct = (v) => (v == null ? "" : (v * 100).toFixed(2));
  const base = (k) => [k, ORP_DATA[k].n, regionName(k) || ""];
  const rows = [];
  if (id === "levels") {
    rows.push(["orp_kod", "orp_nazev", "kraj", "rok"].concat(CSV_CLASSES.map((c) => c[1] + "_pct")));
    orpKods().forEach((k) => YEARS.forEach((y) => {
      const p = orpYear(k, y);
      rows.push(base(k).concat([y], CSV_CLASSES.map((c) => (p ? pct(p[c[0]]) : ""))));
    }));
  } else if (id === "change") {
    rows.push(["orp_kod", "orp_nazev", "kraj", "od", "do"].concat(CSV_CLASSES.map((c) => c[1] + "_zmena_pp")));
    orpKods().forEach((k) => rows.push(base(k).concat([fromYear, toYear], CSV_CLASSES.map((c) => { const d = computeDelta(k, c[0]); return d == null ? "" : (d * 100).toFixed(2); }))));
  } else {
    rows.push(["orp_kod", "orp_nazev", "kraj"].concat(CSV_CLASSES.map((c) => c[1] + "_sklon_pp_za_rok")));
    orpKods().forEach((k) => rows.push(base(k).concat(CSV_CLASSES.map((c) => { const t = orpTrend(k, c[0]); return t && t.slope != null ? (t.slope * 100).toFixed(3) : ""; }))));
  }
  return rows;
}
function downloadData(id) {
  const names = { levels: "iei_hodnoty_orp_2017_2025.csv", change: "iei_zmena_orp_" + fromYear + "_" + toYear + ".csv", trend: "iei_trend_orp_2017_2025.csv" };
  downloadCsv(names[id], buildCsv(id));
}

// ---------------------------------------------------------------------
// ORP search -- deliberately built as a plain HTML <input list> +
// <datalist> (native browser autocomplete) rather than a custom Leaflet
// control with hand-rolled filtering/dropdown UI. The browser owns the
// matching and the dropdown rendering; our code only has to react once a
// name is actually chosen, which is a much smaller, more robust surface.
const ORP_NAME_TO_KOD = {};
const KRAJ_NAMES = new Set();
function buildOrpDatalist() {
  const list = document.getElementById("orp-datalist");
  if (!list) return;
  for (const k in ORP_NAME_TO_KOD) delete ORP_NAME_TO_KOD[k];
  const names = Object.keys(ORP_DATA)
    .filter((k) => k !== NATIONAL_KOD)
    .map((k) => ({ kod: k, name: orpName(k) }))
    .sort((a, b) => a.name.localeCompare(b.name, lang === "cz" ? "cs" : "en"));
  const krajNames = Array.from(new Set(Object.keys(REGION_INFO).map((k) => REGION_INFO[k] && REGION_INFO[k].name).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, lang === "cz" ? "cs" : "en"));
  KRAJ_NAMES.clear();
  krajNames.forEach((n) => KRAJ_NAMES.add(n));
  list.innerHTML = names.map((r) => '<option value="' + r.name.replace(/"/g, "&quot;") + '"></option>').join("") +
    krajNames.map((n) => '<option value="' + n.replace(/"/g, "&quot;") + '"></option>').join("");
  names.forEach((r) => { ORP_NAME_TO_KOD[r.name] = r.kod; });
}

function trySelectOrpByName(rawName) {
  const name = (rawName || "").trim();
  const kod = ORP_NAME_TO_KOD[name];
  if (!kod && KRAJ_NAMES.has(name)) {
    window.zoomToRegion(name);
    const inp = document.getElementById("orp-search-input");
    if (inp) { inp.value = ""; inp.blur(); }
    return true;
  }
  if (!kod) return false; // no exact match yet -- user is still typing/browsing suggestions
  selectedKod = kod;
  renderLayer();
  showPanel(selectedKod);
  if (panelCollapsed) togglePanel();
  if (geoLayer) {
    geoLayer.eachLayer(function (layer) {
      if (layer.feature && layer.feature.properties && layer.feature.properties.KOD === kod) {
        try { map.fitBounds(layer.getBounds(), Object.assign(fitOpts(), { maxZoom: 12 })); } catch (e) {}
      }
    });
  }
  const input = document.getElementById("orp-search-input");
  if (input) { input.value = ""; input.blur(); }
  return true;
}

const orpSearchInput = document.getElementById("orp-search-input");
if (orpSearchInput) {
  // "change" fires when a <datalist> suggestion is clicked/selected, or
  // when the field loses focus after the user typed an exact match --
  // covers both mouse and keyboard use without any custom dropdown code.
  orpSearchInput.addEventListener("change", function (e) { trySelectOrpByName(e.target.value); });
  orpSearchInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") trySelectOrpByName(e.target.value);
  });
}

function setLang(l) {
  lang = l;
  document.getElementById("lang-cz").classList.toggle("active", l === "cz");
  document.getElementById("lang-en").classList.toggle("active", l === "en");
  document.documentElement.lang = l === "cz" ? "cs" : "en";
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = T(el.getAttribute("data-i18n")); });
  // A handful of static (non-regenerated) elements -- like the info-icon on
  // the Compare Years card -- carry their tooltip text as a title attribute
  // instead of visible text, so they need their own pass here.
  document.querySelectorAll("[data-i18n-title]").forEach((el) => { el.title = T(el.getAttribute("data-i18n-title")); });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => { el.placeholder = T(el.getAttribute("data-i18n-placeholder")); });
  document.getElementById("app-title").textContent = T("title_main");
  document.getElementById("app-subtitle").textContent = T("title_sub");
  document.title = T("title");
  closeInfoPopover();
  document.querySelectorAll("[data-info]").forEach((el) => { el.setAttribute("aria-label", T("info_label")); });
  buildDisplaySelect();
  buildYearSelects();
  buildRasterSelect();
  buildOrpDatalist();
  renderLayer();
  showPanel(selectedKod);
  if (document.getElementById("method-banner").style.display === "flex") openMethod();
  if (document.getElementById("data-banner").style.display === "flex") openData();
  positionOverlays();
  // Refresh the tour card's text (title/description aren't data-i18n
  // elements -- they're set directly in renderTourCard) if the tour is
  // currently open.
  if (tourOpen) { buildTourJump(); renderTourCard(tourIndex); }
}

// ---------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------
buildDisplaySelect();
buildYearSelects();
buildRasterSelect();
buildOrpDatalist();
renderLayer();
positionOverlays();
setTimeout(positionOverlays, 300);
showPanel(selectedKod); // opens on the national aggregate view (selectedKod defaults to NATIONAL_KOD)

// ---------------------------------------------------------------------
// Narrow screens (colleagues' mobile mockups): hamburger menu, filter chip
// that expands the filter card, draggable bottom sheet (peek / half / full),
// accordion sections, CSV + share-link buttons, "Pořadí krajů" ranking.
// Everything below is display/layout only -- no data is calculated here.
// ---------------------------------------------------------------------
Object.assign(I18N.cz, {
  download_csv: "Stáhnout data (CSV)", share_link: "Sdílet odkaz", link_copied: "Odkaz zkopírován",
  kraj_rank_title: "Pořadí krajů", kraj_rank_change: "medián ORP (změna)", kraj_rank_level: "medián ORP (hodnota)",
  chip_change: "Změna v čase", menu_label: "Menu", panel_label: "Panel s podrobnostmi",
});
Object.assign(I18N.en, {
  download_csv: "Download data (CSV)", share_link: "Share link", link_copied: "Link copied",
  kraj_rank_title: "Region ranking", kraj_rank_change: "ORP median (change)", kraj_rank_level: "ORP median (value)",
  chip_change: "Change over time", menu_label: "Menu", panel_label: "Details panel",
});

function isNarrow() { return window.innerWidth <= 900; }

// ---- bottom sheet -----------------------------------------------------
let sheetState = "peek"; // peek | half | full
function sheetHeights() {
  const H = document.getElementById("main").clientHeight || window.innerHeight;
  return { peek: Math.min(250, Math.round(H * 0.4)), half: Math.round(H * 0.62), full: H };
}
function applySheet(state, px) {
  const panel = document.getElementById("panel");
  if (!isNarrow()) { panel.style.height = ""; document.documentElement.style.removeProperty("--sheet-h"); document.body.classList.remove("sheet-full"); return; }
  const hs = sheetHeights();
  if (state) sheetState = state;
  const h = px != null ? px : hs[sheetState];
  panel.style.height = h + "px";
  document.documentElement.style.setProperty("--sheet-h", Math.min(h, hs.half) + "px");
  document.body.classList.toggle("sheet-full", sheetState === "full" && px == null);
}
window.mobileSheetPx = function () { return Math.min(sheetHeights()[sheetState], sheetHeights().half); };
function snapSheet(h) {
  const hs = sheetHeights();
  let best = "peek", d = Infinity;
  Object.keys(hs).forEach((k) => { const dd = Math.abs(hs[k] - h); if (dd < d) { d = dd; best = k; } });
  applySheet(best);
  setTimeout(() => map.invalidateSize(), 260);
}
(function initSheet() {
  const handle = document.getElementById("sheet-handle");
  const panel = document.getElementById("panel");
  if (!handle) return;
  let startY = 0, startH = 0, moved = false, drag = false;
  function begin(y) { drag = true; moved = false; startY = y; startH = panel.getBoundingClientRect().height; panel.classList.add("dragging"); }
  function move(y) {
    if (!drag) return;
    const hs = sheetHeights();
    const h = Math.max(hs.peek * 0.6, Math.min(hs.full, startH + (startY - y)));
    if (Math.abs(startY - y) > 4) moved = true;
    panel.style.height = h + "px";
  }
  function end() {
    if (!drag) return;
    drag = false; panel.classList.remove("dragging");
    if (!moved) { const order = ["peek", "half", "full"]; applySheet(order[(order.indexOf(sheetState) + 1) % 3]); }
    else snapSheet(panel.getBoundingClientRect().height);
  }
  handle.addEventListener("touchstart", (e) => begin(e.touches[0].clientY), { passive: true });
  handle.addEventListener("touchmove", (e) => move(e.touches[0].clientY), { passive: true });
  handle.addEventListener("touchend", end);
  handle.addEventListener("mousedown", (e) => { begin(e.clientY); e.preventDefault(); });
  window.addEventListener("mousemove", (e) => move(e.clientY));
  window.addEventListener("mouseup", end);
  handle.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { const o = ["peek", "half", "full"]; applySheet(o[(o.indexOf(sheetState) + 1) % 3]); e.preventDefault(); }
  });
})();

// ---- hamburger menu + filter chip -------------------------------------
(function initMobileChrome() {
  const bar = document.getElementById("topbar"), btn = document.getElementById("menu-btn");
  function setMenu(open) { bar.classList.toggle("menu-open", open); btn.setAttribute("aria-expanded", String(open)); }
  btn.addEventListener("click", () => setMenu(!bar.classList.contains("menu-open")));
  bar.querySelectorAll(".top-right button").forEach((b) => b.addEventListener("click", () => setMenu(false)));
  document.getElementById("map").addEventListener("click", () => setMenu(false));
  const chip = document.getElementById("filter-chip");
  function setFilters(open) {
    document.body.classList.toggle("filters-open", open);
    chip.setAttribute("aria-expanded", String(open));
  }
  chip.addEventListener("click", () => setFilters(!document.body.classList.contains("filters-open")));
  // "Zobrazit" closes the card on narrow screens (filters themselves apply at once)
  document.getElementById("apply-btn").addEventListener("click", () => { if (isNarrow()) setFilters(false); });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") { setFilters(false); setMenu(false); } });
})();

// The search box lives in the left panel on desktop and inside the expanded
// filter card on narrow screens.
function placeSearch() {
  const search = document.querySelector(".panel-search");
  const card = document.getElementById("filter-card");
  const panel = document.getElementById("panel");
  if (!search) return;
  if (isNarrow()) { if (search.parentNode !== card) card.insertBefore(search, card.firstChild); }
  else if (search.parentNode !== panel) panel.insertBefore(search, document.getElementById("panel-content"));
}

function updateFilterChip() {
  const el = document.getElementById("filter-chip-text");
  if (!el) return;
  const who = (selectedKod && selectedKod !== NATIONAL_KOD) ? orpName(selectedKod) : orpName(NATIONAL_KOD);
  const param = displayKey === "I" ? "IEI" : paramName(displayKey);
  const m = mode === "change" ? T("chip_change") : T("mode_current");
  const period = mode === "change" ? fromYear + "–" + toYear : String(currentYear);
  el.textContent = [who, param, m, period].join(" • ");
}

// ---- accordions -------------------------------------------------------
function initAccordions() {
  const root = document.getElementById("panel-content");
  root.querySelectorAll(".card").forEach((c) => {
    if (!c.querySelector(":scope > h3")) return;
    c.classList.add("m-acc");
    if (isNarrow() && !c.dataset.accInit) { c.classList.add("collapsed"); c.dataset.accInit = "1"; }
  });
}
// Per-card open/closed memory across re-renders (panel HTML is rebuilt).
const accOpen = {};
document.getElementById("panel-content").addEventListener("click", function (e) {
  if (!isNarrow()) return;
  if (e.target.closest(".info-icon")) return;
  const h3 = e.target.closest(".card.m-acc > h3");
  if (h3) {
    const card = h3.parentNode;
    card.classList.toggle("collapsed");
    accOpen[h3.textContent.trim()] = !card.classList.contains("collapsed");
    setTimeout(() => { card.querySelectorAll("canvas").forEach((cv) => { const c = Chart.getChart(cv); if (c) c.resize(); }); }, 0);
    return;
  }
  const head = e.target.closest("#chart-section .p-section-head");
  if (head && !e.target.closest(".chev-btn")) toggleChartSection();
});

// ---- region ranking on the national view ------------------------------
function krajRankingHtml() {
  const key = displayKey === "dominant" ? "I" : displayKey;
  const byRegion = {};
  Object.keys(ORP_DATA).filter((k) => k !== NATIONAL_KOD).forEach((k) => {
    const info = REGION_INFO[k]; if (!info || !info.name) return;
    const v = mode === "change" ? computeDelta(k, key) : (orpYear(k, currentYear) || {})[key];
    if (v == null) return;
    (byRegion[info.name] = byRegion[info.name] || []).push(v);
  });
  const rows = Object.keys(byRegion).map((n) => ({ name: n, val: median(byRegion[n]) })).filter((r) => r.val != null).sort((a, b) => b.val - a.val);
  if (!rows.length) return "";
  const maxAbs = Math.max.apply(null, rows.map((r) => Math.abs(r.val))) || 1;
  const M = CHANGE_M[key] || RANGE_MAX_DELTA;
  const body = rows.map((r, i) => {
    const w = Math.max(4, Math.round((Math.abs(r.val) / maxAbs) * 100));
    const col = mode === "change" ? diffColor(r.val, M) : "#007270";
    const txt = mode === "change" ? signedPpNumber(r.val) : fmtNum(pctNum(r.val), 1) + (lang === "cz" ? " %" : "%");
    return '<div class="kr-row"><span class="kr-n">' + (i + 1) + '.</span><span class="kr-name">' + r.name +
      '</span><span class="kr-bar"><i style="width:' + w + "%;background:" + col + '"></i></span><b>' + txt + "</b></div>";
  }).join("");
  return '<div class="card m-acc kr-card" data-acc-init="1"><h3>' + T("kraj_rank_title") + ' <span class="kr-sub">' +
    (mode === "change" ? T("kraj_rank_change") : T("kraj_rank_level")) + "</span></h3><div>" + body + "</div></div>";
}
(function injectKrajCss() {
  const s = document.createElement("style");
  s.textContent =
    ".kr-sub{display:block;margin-top:2px;font-size:12.5px;font-weight:500;color:var(--text-2)}" +
    ".kr-row{display:grid;grid-template-columns:30px minmax(0,1.5fr) minmax(40px,1fr) 52px;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid var(--border);font-size:13px}" +
    ".kr-row:last-child{border-bottom:none}.kr-n{color:var(--text-2);font-weight:600}.kr-name{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    ".kr-bar{height:8px;border-radius:4px;background:#E3E9E6;overflow:hidden}.kr-bar i{display:block;height:100%;border-radius:4px}.kr-row b{text-align:right}";
  document.head.appendChild(s);
})();

// ---- share link (state in the URL hash) -------------------------------
function stateHash() {
  const p = new URLSearchParams();
  p.set("m", mode); p.set("p", displayKey); p.set("y", currentYear);
  p.set("f", fromYear); p.set("t", toYear); p.set("l", lang);
  if (selectedKod && selectedKod !== NATIONAL_KOD) p.set("o", selectedKod);
  return "#" + p.toString();
}
window.shareLink = function () {
  const url = location.href.split("#")[0] + stateHash();
  const label = document.getElementById("share-label");
  const done = () => { if (label) { label.textContent = T("link_copied"); setTimeout(() => { label.textContent = T("share_link"); }, 1800); } };
  if (navigator.share) { navigator.share({ title: T("title"), url: url }).catch(() => {}); return; }
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => window.prompt(T("share_link"), url));
  else window.prompt(T("share_link"), url);
};
function applyHashState() {
  if (!location.hash || location.hash.length < 2) return;
  let p; try { p = new URLSearchParams(location.hash.slice(1)); } catch (e) { return; }
  const yr = (v) => { const n = parseInt(v, 10); return YEARS.indexOf(n) >= 0 ? n : null; };
  if (["I", "F", "A", "G", "U"].indexOf(p.get("p")) >= 0) displayKey = p.get("p");
  if (yr(p.get("y")) != null) { currentYear = yr(p.get("y")); currentYearIdx = YEARS.indexOf(currentYear); }
  if (yr(p.get("f")) != null && yr(p.get("t")) != null && yr(p.get("f")) < yr(p.get("t"))) { fromYear = yr(p.get("f")); toYear = yr(p.get("t")); }
  const o = p.get("o"); if (o && ORP_DATA[o] && o !== NATIONAL_KOD) selectedKod = o;
  if (p.get("l") === "en" || p.get("l") === "cz") { if (p.get("l") !== lang) setLang(p.get("l")); }
  setMode(p.get("m") === "change" ? "change" : "current");
  if (selectedKod && selectedKod !== NATIONAL_KOD) fitToSelection();
}

// ---- hook called after every panel render -----------------------------
window.mobileAfterPanel = function () {
  // Region ranking whenever no single ORP is selected (national view)
  if (!selectedKod || selectedKod === NATIONAL_KOD) {
    const root = document.getElementById("panel-content");
    if (!root.querySelector(".kr-card")) root.insertAdjacentHTML("beforeend", krajRankingHtml());
  }
  initAccordions();
  document.querySelectorAll("#panel-content .card.m-acc").forEach((c) => {
    const h = c.querySelector(":scope > h3");
    if (h && accOpen[h.textContent.trim()] != null && isNarrow()) c.classList.toggle("collapsed", !accOpen[h.textContent.trim()]);
  });
  updateFilterChip();
  document.getElementById("sheet-handle").setAttribute("aria-label", T("panel_label"));
  document.getElementById("menu-btn").setAttribute("aria-label", T("menu_label"));
};

function onResizeMobile() {
  placeSearch();
  applySheet();
  positionOverlays();
  setTimeout(() => map.invalidateSize(), 0);
}
window.addEventListener("resize", onResizeMobile);
window.addEventListener("orientationchange", () => setTimeout(onResizeMobile, 200));
placeSearch();
applySheet("peek");
applyHashState();
window.mobileAfterPanel();
setTimeout(onResizeMobile, 50);
