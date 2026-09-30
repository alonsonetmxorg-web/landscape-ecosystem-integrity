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
  I: { cz: "Ekosystémová integrita krajiny", en: "Ecosystem Integrity" },
};

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
    title: "Ekosystémová integrita krajiny — Multi-Year Dashboard",
    mode_current: "Snímek roku",
    mode_change: "Změna v čase",
    display_label: "Zobrazit:",
    year_label: "Rok:",
    from_label: "Od:",
    to_label: "Do:",
    raster_label: "Rastrová vrstva:",
    raster_none: "Žádná",
    raster_health: "Ekosystémová integrita",
    raster_photo: "Fotosyntetický potenciál",
    raster_cooling: "Chladicí schopnost vegetace",
    raster_hetero: "Krajinná pestrost",
    raster_trend: "Trend 2017–2025",
    panel_placeholder: "Klikněte na ORP na mapě pro zobrazení detailu.",
    dominant_class: "Dominantní třída",
    health_index: "Ekosystémová integrita krajiny",
    orp_code: "Kód ORP",
    value_in_year: "Hodnota v roce",
    neighbor_median: "Medián sousedů",
    vs_neighbors: "Vs. sousedé",
    above_by: "nad o",
    below_by: "pod o",
    yoy: "Meziroční změna",
    since: "od",
    na: "n/a",
    compare_years_title: "Porovnání let",
    compare_years_info: "Toto porovnání ovlivňuje pouze tento režim „Změna v čase“ (graf, žebříček, karty níže). Neovlivňuje rastrové vrstvy ani režim „Snímek roku“, které používají svůj vlastní výběr roku.",
    composition_title: "Zastoupení kategorií",
    composition_info: "Podíl plochy ORP, kterou zabírá každá ze čtyř kategorií (les, zemědělská půda, travní porosty, zastavěné území). Nezahrnuje neklasifikované plochy (vodní, mokřadní, skalní), proto součet nemusí činit přesně 100 %.",
    history_title: "Vývoj v čase",
    history_info_current: "Hodnota indexu (0–100 %) pro každou kategorii a pro celkovou ekosystémovou integritu v jednotlivých letech 2017–2025. Zvýrazněná kategorie (viz štítek nahoře) je vykreslena silněji a vyplněna; ostatní jsou zeslabené.",
    history_info_change: "Hodnota vybraného indexu v jednotlivých letech 2017–2025 spolu s proloženým dlouhodobým trendem (přerušovaná čára). Karta výše ukazuje změnu jen mezi zvolenými roky Od/Do, tento graf ukazuje celý průběh.",
    delta_card_info: "Rozdíl hodnoty indexu mezi zvoleným počátečním a koncovým rokem (výběr „Porovnání let“ výše), v procentních bodech škály 0–100 %.",
    trend_title: "Dlouhodobý trend (2017–2025)",
    trend_slope: "Sklon (za rok)",
    trend_significance: "Statistická významnost",
    significant: "významný",
    not_significant: "nevýznamný",
    trend_note: "OLS regrese + Theil-Sen (odolný vůči odlehlým hodnotám)",
    leaderboard_title: "Nejvýraznější změny ({PERIOD})",
    biggest_decline: "Největší pokles",
    biggest_improvement: "Největší zlepšení",
    ranking_title: "Nejlepší a nejhorší hodnoty (vybraný rok)",
    lowest_values: "Nejnižší hodnoty",
    highest_values: "Nejvyšší hodnoty",
    change_note: "Hodnoty představují průměrný rozdíl indexu mezi vybranými roky. Červená = pokles, zelená = zlepšení.",
    values_note: "Hodnoty představují průměrný ekosystémový index (0–1) pro danou kategorii v rámci ORP.",
    click_hint: "(klikněte pro detail)",
    no_data: "Chybí data",
    legend_dominant: "Dominantní třída",
    legend_health: "Ekosystémová integrita (0–100 %)",
    legend_class: "vs. medián sousedů",
    legend_change: "Změna (od–do)",
    below_neighbors: "Pod sousedy",
    near_neighbors: "Blízko sousedům",
    above_neighbors: "Nad sousedy",
    decline: "Pokles",
    no_change: "Beze změny",
    improvement: "Zlepšení",
    tooltip_index_info: "Ekosystémová integrita krajiny (RIEI) je plocho-vážený průměr indexu ekosystémové integrity napříč lesem, zemědělskou půdou, travními porosty a zastavěným územím v dané ORP.",
    share_of_area: "podíl plochy",
    raster_legend_low: "Nižší hodnoty",
    raster_legend_high: "Vyšší hodnoty",
    contribution_title: "Podíl na ekosystémové integritě krajiny",
    untapped_potential: "Nevyužitý potenciál",
    subcategory_title: "Skladba kategorie: {LABEL}",
    subcategory_other: "Ostatní",
    subcategory_info: "Jemnější rozdělení podle typu porostu/využití v rámci této kategorie (např. u lesa: přírodní vs. nepřírodní, smrčiny, bučiny...). Zobrazeno je 6 nejvýznamnějších tříd, zbytek je sloučen do „Ostatní“.",
    legend_health_info: "Barevná škála odpovídá reálnému rozsahu hodnot naměřených mezi ORP v Česku, nikoli celému teoretickému rozsahu 0–100 %. Žádná ORP nedosahuje ani jedné z krajních hodnot.",
    leaderboard_info: "Řazení podle nejnižších/nejvyšších naměřených hodnot ve vybraném období -- nejedná se o hodnotící žebříček.",
    legend_dominant_info: "Kategorie zabírající největší podíl plochy dané ORP (les, zemědělská půda, travní porosty nebo zastavěné území).",
    legend_class_info: "Porovnání s mediánem přímo sousedících ORP; sytost barvy odpovídá velikosti odchylky od tohoto mediánu.",
    trend_info: "„Významný“ znamená p < 0,05 (95% jistota, že trend není náhodný). R² udává, jak dobře přímka odpovídá 9 ročním hodnotám (2017–2025).",
    contribution_info: "Vážený příspěvek = index ekosystémové integrity dané kategorie × její podíl na ploše ORP. Součet odpovídá celkové ekosystémové integritě výše; zbytek do 100 % je „nevyužitý potenciál“.",
    back_to_national: "Zpět na Českou republiku",
    transparency_label: "Průhlednost",
    region_median: "Krajský medián",
    vs_region: "Vs. kraj",
    national_sub: "Celostátní přehled — 206 ORP",
    region_too_small: "V tomto kraji není dostatek dalších ORP pro srovnání.",
    trend_summary: "Za posledních 9 let (2017–2025): {LABEL} — změna o",
    trend_summary_suffix: "ročně.",
    trend_summary_national: "Za posledních 9 let (2017–2025) se celostátní ekosystémová integrita měnila o",
    comparison_desc: "Srovnání níže vychází z mediánu ostatních ORP ve stejném kraji",
    index_in_year: "{LABEL} v roce",
    viewing_label: "Zobrazeno:",
    area_of: "Plocha:",
    total_area_label: "Celková plocha ORP",
    ha_unit: "ha",
    tour_button: "Prohlídka rastrů",
    tour_prev: "Předchozí",
    tour_next: "Další",
    tour_1_title: "Ukazatel: Index krajinného zdraví",
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
    tour_trend_title: "Ukazatel: Dlouhodobý trend (2017–2025)",
    tour_trend_desc: "Namísto stavu v jediném roce ukazuje tato vrstva směr vývoje: pro každý pixel spočítáme sklon přímky proložené devíti ročními hodnotami ekosystémové integrity (2017–2025) a zobrazíme ho jako jedno číslo -- kladné (zelené), pokud se stav dlouhodobě zlepšuje, záporné (oranžové), pokud se zhoršuje. Je to stejná metoda (OLS regrese), jakou dashboard používá pro trend jednotlivých ORP v postranním panelu, jen aplikovaná pixel po pixelu napříč celou republikou.",
    tour_decline1_title: "Příklad: Odumírající smrčiny na Šumavě a v Krušných horách",
    tour_decline1_desc: "Šumavské a krušnohorské pohraniční ORP (Vimperk, Prachatice, Sušice, Kaplice, Český Krumlov, Kraslice) patří k oblastem s vůbec nejstrmějším měřeným poklesem ekosystémové integrity v celém datasetu 2017–2025. Roli zde hraje kombinace sucha a kůrovcové kalamity, která postupně mění hospodářské smrkové porosty na uschlé nebo právě vytěžené plochy -- ubývá fotosyntetického potenciálu i chladicí schopnosti vegetace.",
    tour_decline2_title: "Příklad: Sokolovská hnědouhelná pánev",
    tour_decline2_desc: "Karlovarský kraj (Sokolov, Karlovy Vary, Cheb, Aš, Stříbro, Tachov) tvoří druhé, zcela odlišné ohnisko poklesu: namísto přírodní kalamity zde dlouhodobě působí těžba a úprava hnědého uhlí, rekultivace výsypek a rozšiřování zástavby. Zotavení vegetace po těžbě je pomalé, takže i zde patří naměřené hodnoty k nejstrměji klesajícím v republice.",
    hide_panel: "Skrýt panel",
    show_panel: "Zobrazit panel",
    about_button: "O projektu",
    intro_eyebrow: "Ekosystémová integrita krajiny",
    intro_title: "O tomto nástroji",
    intro_body1: "Dashboard zobrazuje Ekosystémovou integritu krajiny (RIEI) pro každou obec s rozšířenou působností v České republice, každoročně od roku 2017 do 2025. Index vychází ze tří nezávislých družicových ukazatelů -- fotosyntetického potenciálu, chladicí schopnosti vegetace a krajinné pestrosti -- které se kombinují do jedné souhrnné hodnoty.",
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
    search_placeholder: "Hledat ORP…",
    search_no_results: "Nic nenalezeno",
    raster_clear_title: "Vypnout rastr",
  },
  en: {
    title: "Landscape Ecosystem Integrity — Multi-Year Dashboard",
    mode_current: "Year Snapshot",
    mode_change: "Change over Time",
    display_label: "Display:",
    year_label: "Year:",
    from_label: "From:",
    to_label: "To:",
    raster_label: "Raster layer:",
    raster_none: "None",
    raster_health: "Ecosystem Integrity",
    raster_photo: "Photosynthetic potential",
    raster_cooling: "Vegetation cooling capacity",
    raster_hetero: "Landscape heterogeneity",
    raster_trend: "Trend 2017–2025",
    panel_placeholder: "Click a municipality (ORP) on the map to see its detail.",
    dominant_class: "Dominant class",
    health_index: "Ecosystem Integrity",
    orp_code: "ORP code",
    value_in_year: "Value in",
    neighbor_median: "Neighbor median",
    vs_neighbors: "Vs. neighbors",
    above_by: "above by",
    below_by: "below by",
    yoy: "Year-over-year",
    since: "since",
    na: "n/a",
    compare_years_title: "Compare years",
    compare_years_info: "This comparison only affects this Change over Time view (the chart, leaderboard, and cards below). It doesn't affect the raster layers or the Year Snapshot mode, which use their own year selection.",
    composition_title: "Land-use composition",
    composition_info: "The share of the ORP's area covered by each of the four categories (Forest, Agricultural Land, Grassland, Urban Areas). Unclassified land (water, wetland, bare rock) isn't included, so the segments may not add up to exactly 100%.",
    history_title: "Values over time",
    history_info_current: "The index value (0-100%) for each category and for overall Ecosystem Integrity, year by year from 2017-2025. The featured category (see the tag above) is drawn bolder and filled in; the others are dimmed.",
    history_info_change: "The selected index's value year by year from 2017-2025, with the fitted long-term trend overlaid (dashed line). The card above shows the change between just the chosen From/To years; this chart shows the full path.",
    delta_card_info: "The difference in index value between the selected start and end year (the \"Compare years\" control above), in percentage points on the 0-100% scale.",
    trend_title: "Long-term trend (2017–2025)",
    trend_slope: "Slope (per year)",
    trend_significance: "Statistical significance",
    significant: "significant",
    not_significant: "not significant",
    trend_note: "OLS regression + Theil-Sen (robust to outliers)",
    leaderboard_title: "Most notable changes ({PERIOD})",
    biggest_decline: "Biggest decline",
    biggest_improvement: "Biggest improvement",
    ranking_title: "Best and worst values (selected year)",
    lowest_values: "Lowest values",
    highest_values: "Highest values",
    change_note: "Values represent the average index difference between the selected years. Red = decline, green = improvement.",
    values_note: "Values represent the average ecosystem index (0-1) for the category within the ORP.",
    click_hint: "(click for detail)",
    no_data: "Missing data",
    legend_dominant: "Dominant class",
    legend_health: "Ecosystem Integrity (0-100%)",
    legend_class: "vs. neighbor median",
    legend_change: "Change (from-to)",
    below_neighbors: "Below neighbors",
    near_neighbors: "Near neighbors",
    above_neighbors: "Above neighbors",
    decline: "Decline",
    no_change: "No change",
    improvement: "Improvement",
    tooltip_index_info: "Ecosystem Integrity (RIEI) is an area-weighted average of the ecosystem integrity index across forest, agricultural land, grassland, and urban area within the ORP.",
    share_of_area: "share of area",
    raster_legend_low: "Lower values",
    raster_legend_high: "Higher values",
    contribution_title: "Contribution to Ecosystem Integrity",
    untapped_potential: "Untapped potential",
    subcategory_title: "What makes up {LABEL}",
    subcategory_other: "Other",
    subcategory_info: "A finer breakdown of the stand/land-cover types within this category (for Forest, for example: natural vs. non-natural, spruce, beech...). Shows the 6 largest classes; the rest are grouped into \"Other.\"",
    legend_health_info: "The color scale reflects the real range of values observed across Czech ORPs, not the full theoretical 0-100% scale -- no ORP reaches either extreme.",
    leaderboard_info: "Ranked by the lowest/highest measured values for the selected period -- not a performance ranking.",
    legend_dominant_info: "The land-cover category covering the largest share of this ORP's area (forest, agricultural land, grassland, or urban).",
    legend_class_info: "Compared to the median of directly bordering ORPs; color intensity reflects the size of the difference from that median.",
    trend_info: "\"Significant\" means p < 0.05 (95% confidence the trend isn't due to chance). R² shows how well a straight line fits the 9 yearly values (2017-2025).",
    contribution_info: "Weighted contribution = each category's ecosystem integrity index × its share of ORP area. The segments sum to the overall Ecosystem Integrity shown above; the remainder to 100% is \"untapped potential.\"",
    back_to_national: "Back to Czech Republic",
    transparency_label: "Transparency",
    region_median: "Regional median",
    vs_region: "Vs. region",
    national_sub: "National overview -- 206 ORPs",
    region_too_small: "Not enough other ORPs in this region for a ranking.",
    trend_summary: "Over the last 9 years (2017–2025), {LABEL} has changed by",
    trend_summary_suffix: "per year.",
    trend_summary_national: "Over the last 9 years (2017–2025), national Ecosystem Integrity has changed by",
    comparison_desc: "The comparison below is based on the median of other ORPs within the same kraj",
    index_in_year: "{LABEL} in",
    viewing_label: "Viewing:",
    area_of: "Area:",
    total_area_label: "Total ORP area",
    ha_unit: "ha",
    tour_button: "Raster tour",
    tour_prev: "Previous",
    tour_next: "Next",
    tour_1_title: "Indicator: Ecosystem Integrity Index",
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
    tour_trend_title: "Indicator: Long-Term Trend (2017–2025)",
    tour_trend_desc: "Instead of a single year's snapshot, this layer shows the direction of change: for every pixel we fit a line through nine years of Ecosystem Integrity values (2017–2025) and reduce it to one number -- positive (green) where conditions have been improving over time, negative (orange) where they've been declining. It's the same method (OLS regression) the dashboard already uses for each ORP's own trend in the side panel, just applied pixel by pixel across the whole country.",
    tour_decline1_title: "Example: Dying Spruce Stands in Šumava and the Krušné Hory",
    tour_decline1_desc: "The Šumava and Krušné hory border ORPs (Vimperk, Prachatice, Sušice, Kaplice, Český Krumlov, Kraslice) are among the areas with the steepest measured Ecosystem Integrity decline in the entire 2017–2025 dataset. A combination of drought and bark-beetle outbreaks is gradually turning managed spruce stands into dead or freshly logged clearings -- both photosynthetic potential and vegetation cooling capacity are dropping as a result.",
    tour_decline2_title: "Example: The Sokolov Brown-Coal Basin",
    tour_decline2_desc: "Karlovy Vary Region (Sokolov, Karlovy Vary, Cheb, Aš, Stříbro, Tachov) is a second, very different pocket of decline: instead of a natural calamity, this one is driven by long-running lignite mining and processing, slow spoil-heap reclamation, and expanding built-up land. Vegetation recovery after mining is slow, so measured values here are also among the steepest-declining in the country.",
    hide_panel: "Hide panel",
    show_panel: "Show panel",
    about_button: "About",
    intro_eyebrow: "Landscape Ecosystem Integrity",
    intro_title: "About this tool",
    intro_body1: "This dashboard shows Landscape Ecosystem Integrity (RIEI) for every municipality with extended powers (ORP) in the Czech Republic, year by year from 2017 to 2025. The index is built from three independent satellite-derived indicators -- photosynthetic potential, vegetation cooling capacity, and landscape heterogeneity -- combined into a single composite value.",
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
    search_placeholder: "Search ORP…",
    search_no_results: "No matches",
    raster_clear_title: "Turn off raster",
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
    stopsCss: "#e58954 0%, #eca987 20%, #f0c9ac 38%, #f7e3d3 48%, #ffffff 57.14%, #dcebe0 66%, #8fc29e 78%, #3d8259 90%, #00441b 100%",
    lowText: "−0.072", highText: "+0.054",
  },
};

let lang = "cz";
function T(key) { return (I18N[lang] && I18N[lang][key]) || key; }
function label(key) { return LABELS[key] ? LABELS[key][lang] : key; }

let mode = "current"; // "current" | "change"
let displayKey = "I"; // "I" | "dominant" | "F" | "A" | "G" | "U"
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
  const clamped = Math.max(-maxAbs, Math.min(maxAbs, diff));
  const t = clamped / maxAbs;
  if (t >= 0) return lerpColor("#e8e4d8", "#1f7a3d", t);
  return lerpColor("#e8e4d8", "#b23a2e", -t);
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

// ---------------------------------------------------------------------
// Map setup
// ---------------------------------------------------------------------
const map = L.map("map", { zoomControl: true }).setView([49.75, 15.4], 8);

// Single fixed basemap -- Esri World Imagery (satellite) with a reference
// layer of place names/boundaries drawn on top. Per client feedback the
// Light Gray / Dark Gray canvas options were just noise next to the
// satellite view, and with only one real option left there's no reason to
// keep a basemap selector in the UI at all -- this is just always on.
L.layerGroup([
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    attribution: "&copy; Esri &mdash; Esri, Maxar, Earthstar Geographics",
    maxZoom: 19,
  }),
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19,
  }),
]).addTo(map);

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
        for (let i = 0; i < d.length; i += 4) {
          const lum = Math.max(d[i], d[i + 1], d[i + 2]);
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

function buildRasterSelect() {
  const sel = document.getElementById("raster-select");
  const options = [
    ["none", T("raster_none")],
    ["health", T("raster_health")],
    ["photo", T("raster_photo")],
    ["cooling", T("raster_cooling")],
    ["hetero", T("raster_hetero")],
    ["trend", T("raster_trend")],
  ];
  sel.innerHTML = options.map((o) => '<option value="' + o[0] + '"' + (o[0] === activeRasterKey ? " selected" : "") + ">" + o[1] + "</option>").join("");
}

function setRasterLayer(key) {
  if (activeRasterLayer) { map.removeLayer(activeRasterLayer); activeRasterLayer = null; }
  activeRasterKey = key;
  document.getElementById("raster-opacity-group").style.display = key === "none" ? "none" : "flex";
  document.getElementById("raster-clear-btn").style.display = key === "none" ? "none" : "flex";
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
document.getElementById("raster-clear-btn").addEventListener("click", clearRaster);

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
const TOUR_CARDS = [
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
const TOUR_ZOOM = 13;
let tourIndex = 0;
let tourOpen = false;

function buildTourJump() {
  const sel = document.getElementById("tour-jump");
  if (!sel) return;
  sel.innerHTML = TOUR_CARDS.map((c, i) => '<option value="' + i + '">' + (i + 1) + ". " + T(c.titleKey) + "</option>").join("");
  sel.value = String(tourIndex);
}

function renderTourCard(idx) {
  tourIndex = Math.max(0, Math.min(TOUR_CARDS.length - 1, idx));
  const card = TOUR_CARDS[tourIndex];
  document.getElementById("tour-img").src = card.img;
  document.getElementById("tour-card-title").textContent = T(card.titleKey);
  document.getElementById("tour-card-desc").textContent = T(card.descKey);
  document.getElementById("tour-counter").textContent = (tourIndex + 1) + " / " + TOUR_CARDS.length;
  const jumpSel = document.getElementById("tour-jump");
  if (jumpSel) jumpSel.value = String(tourIndex);
  document.getElementById("tour-prev-btn").disabled = tourIndex === 0;
  document.getElementById("tour-next-btn").disabled = tourIndex === TOUR_CARDS.length - 1;

  // Drive the raster layer (and keep the existing dropdown in sync) to
  // match this card.
  document.getElementById("raster-select").value = card.raster;
  setRasterLayer(card.raster);

  // Drive the map view: fly to a real location for example cards, or
  // back out to the full national extent for the 4 country-wide
  // indicator cards.
  if (card.coords) {
    map.flyTo(card.coords, TOUR_ZOOM, { duration: 1.1 });
  } else if (geoLayer) {
    try { map.flyToBounds(geoLayer.getBounds(), { padding: [16, 16], duration: 1.1 }); } catch (e) {}
  }
}

function openTour() {
  tourOpen = true;
  // Docked as a real left column (flex child of #main, same idea as the
  // right-hand #panel) rather than a floating overlay -- "flex" not
  // "block" so it lays out correctly, and the map needs to be told its
  // container just shrank or its tiles stay sized for the old width.
  document.getElementById("tour-overlay").style.display = "flex";
  // Three docked columns (tour + map + info panel) at once is too tight
  // to be usable, especially on narrower screens -- auto-collapse the
  // right-hand info panel while touring so the tour and map have the
  // room. Only if it wasn't already collapsed by the user themselves
  // (don't fight a deliberate choice they made before opening the tour).
  if (!panelCollapsed) {
    panelAutoCollapsedByTour = true;
    togglePanel();
  }
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
  // Bring the info panel back, but only if the tour was the one that
  // hid it -- leave it collapsed if the user had already hidden it
  // themselves beforehand.
  if (panelAutoCollapsedByTour) {
    panelAutoCollapsedByTour = false;
    togglePanel();
  }
  setTimeout(() => map.invalidateSize(), 260);
}

function tourNext() { if (tourIndex < TOUR_CARDS.length - 1) renderTourCard(tourIndex + 1); }
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
  panelCollapsed = !panelCollapsed;
  // If the panel is genuinely open again (whoever called this), the
  // "tour auto-collapsed it" bookkeeping no longer applies -- e.g. the
  // user manually reopens it via the edge tab while the tour is still
  // open, so closing the tour afterward shouldn't re-collapse it on them.
  if (!panelCollapsed) panelAutoCollapsedByTour = false;
  const panel = document.getElementById("panel");
  panel.classList.toggle("collapsed", panelCollapsed);
  // Icon-only close (inside the panel) and reopen (edge tab) buttons --
  // no text to swap, just which one is visible.
  document.getElementById("panel-reopen-btn").style.display = panelCollapsed ? "flex" : "none";
  // Let the CSS transition finish, then tell Leaflet its container size
  // changed -- otherwise the map keeps rendering at its old width and
  // tiles look cut off/blank in the newly-revealed strip until the next
  // manual pan or zoom.
  setTimeout(() => map.invalidateSize(), 260);
}

const legend = L.control({ position: "bottomright" });
legend.onAdd = function () {
  const div = L.DomUtil.create("div", "legend");
  div.id = "legend-box";
  renderLegend(div);
  return div;
};
legend.addTo(map);

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
        html += "<strong>" + T("legend_dominant") + ' <span class="info-icon" title="' + T("legend_dominant_info") + '">i</span></strong>';
        BUCKET_KEYS.forEach((k) => {
          html += '<span class="swatch" style="background:' + BUCKET_COLORS[k] + '"></span>' + label(k) + "<br>";
        });
      } else if (displayKey === "I") {
        html += "<strong>" + T("legend_health") + ' <span class="info-icon" title="' + T("legend_health_info") + '">i</span></strong>';
        html += '<div class="gradient-bar" style="background:linear-gradient(90deg,#b23a2e,#e8c547,#1f7a3d)"></div>';
        html += '<div class="gradient-labels"><span>' + Math.round(HEALTH_DOMAIN[0] * 100) + "%</span><span>" + Math.round(HEALTH_DOMAIN[1] * 100) + "%</span></div>";
      } else {
        // Same absolute red-yellow-green legend style as Ecosystem Integrity,
        // just with this bucket's own observed-range domain.
        const dom = BUCKET_DOMAINS[displayKey] || [0, 1];
        html += "<strong>" + label(displayKey) + " " + T("legend_health") + ' <span class="info-icon" title="' + T("legend_health_info") + '">i</span></strong>';
        html += '<div class="gradient-bar" style="background:linear-gradient(90deg,#b23a2e,#e8c547,#1f7a3d)"></div>';
        html += '<div class="gradient-labels"><span>' + Math.round(dom[0] * 100) + "%</span><span>" + Math.round(dom[1] * 100) + "%</span></div>";
      }
    } else {
      html += "<strong>" + (displayKey === "I" ? T("health_index") : label(displayKey)) + " " + T("legend_change") + "</strong>";
      html += '<div class="gradient-bar" style="background:linear-gradient(90deg,#b23a2e,#e8e4d8,#1f7a3d)"></div>';
      html += '<div class="gradient-labels"><span>' + T("decline") + "</span><span>" + T("improvement") + "</span></div>";
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
    html += "<strong>" + T("raster_" + activeRasterKey) + "</strong>";
    html += '<div class="gradient-bar" style="background:linear-gradient(90deg,' + gradientStops + ')"></div>';
    html += '<div class="gradient-labels"><span>' + (rl.lowText || T("raster_legend_low")) + "</span><span>" + (rl.highText || T("raster_legend_high")) + "</span></div>";
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
  let fillColor = "#cccccc";

  if (mode === "current") {
    const props = orpYear(kod, currentYear);
    if (props) {
      if (displayKey === "dominant") {
        const cls = dominantClass(props);
        fillColor = cls ? BUCKET_COLORS[cls] : "#cccccc";
      } else if (displayKey === "I") {
        fillColor = absoluteColor(props.I, HEALTH_DOMAIN[0], HEALTH_DOMAIN[1]);
      } else {
        // Absolute per-bucket coloring (same red-yellow-green scale as
        // Ecosystem Integrity), not a neighbor-relative comparison -- the
        // neighbor/region numbers are still available in the side panel.
        const val = props[displayKey];
        const dom = BUCKET_DOMAINS[displayKey];
        fillColor = (val === null || val === undefined) ? "#cccccc" : absoluteColor(val, dom[0], dom[1]);
      }
    }
  } else {
    const fromP = orpYear(kod, fromYear);
    const toP = orpYear(kod, toYear);
    if (fromP && toP) {
      const key = displayKey === "I" ? "I" : displayKey;
      const a = fromP[key], b = toP[key];
      if (a !== null && a !== undefined && b !== null && b !== undefined) {
        fillColor = diffColor(b - a, RANGE_MAX_DELTA);
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

function trendArrow(delta, threshold) {
  threshold = threshold || 0.005;
  if (delta === null || delta === undefined) return '<span class="trend-flat">' + T("na") + "</span>";
  const p = pctNum(delta).toFixed(1) + "%";
  if (Math.abs(delta) < threshold) return '<span class="trend-flat">&#8594; ' + p + "</span>";
  if (delta > 0) return '<span class="trend-up">&#9650; +' + p + "</span>";
  return '<span class="trend-down">&#9660; ' + p + "</span>";
}

function tooltipHtml(feature) {
  const kod = feature.properties.KOD;
  const name = orpName(kod);
  let html = "<strong>" + name + "</strong><br>";

  if (mode === "current") {
    const props = orpYear(kod, currentYear);
    if (!props) { html += T("no_data"); return html; }
    if (displayKey === "dominant") {
      const cls = dominantClass(props);
      const clsShare = cls && props.s ? props.s[cls] : null;
      html += T("dominant_class") + ": " + label(cls) + " (" + (clsShare != null ? Math.round(clsShare * 100) + "% " + T("share_of_area") : T("na")) + ")";
    } else if (displayKey === "I") {
      html += T("health_index") + ": " + (props.I != null ? Math.round(props.I * 100) + "%" : T("na"));
    } else {
      const val = props[displayKey];
      const rMed = kod !== NATIONAL_KOD ? regionMedian(kod, currentYear, displayKey) : null;
      html += label(displayKey) + ": " + (val != null ? val.toFixed(3) : T("na")) + "<br>";
      html += T("region_median") + ": " + (rMed != null ? rMed.toFixed(3) : T("na"));
    }
  } else {
    const fromP = orpYear(kod, fromYear);
    const toP = orpYear(kod, toYear);
    const key = displayKey === "I" ? "I" : displayKey;
    const a = fromP ? fromP[key] : null;
    const b = toP ? toP[key] : null;
    const delta = (a != null && b != null) ? b - a : null;
    html += (displayKey === "I" ? T("health_index") : label(displayKey)) + " " + fromYear + "→" + toYear + ": " + trendArrow(delta, 0.01);
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
}

function renderLayer() {
  currentKrajMates = (selectedKod && selectedKod !== NATIONAL_KOD) ? new Set(regionPeers(selectedKod)) : new Set();
  if (geoLayer) map.removeLayer(geoLayer);
  geoLayer = L.geoJSON(GEOM, { style: styleFeature, onEachFeature: onEachFeature, pane: "boundaryPane" }).addTo(map);
  if (!window.__fitted) {
    try { map.fitBounds(geoLayer.getBounds(), { padding: [16, 16] }); window.__fitted = true; } catch (e) {}
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
  const idxPct = idxVal != null ? Math.round(idxVal * 100) + "%" : T("na");
  const idxDelta = (props && prevProps) ? props[badgeKey] - prevProps[badgeKey] : null;
  // Region (kraj) comparison only, per client request -- dropped the
  // direct-neighbor (shared-boundary) comparison entirely, since having
  // two different "neighbor" definitions side by side was causing
  // confusion. Kraj is now the one consistent comparison group everywhere.
  const idxRMed = kod !== NATIONAL_KOD ? regionMedian(kod, currentYear, badgeKey) : null;

  const trend = orpTrend(kod, badgeKey);
  let trendSummary = "";
  if (trend && trend.slope !== null) {
    trendSummary = T("trend_summary").replace("{LABEL}", badgeLabel) + " " + trendArrow(trend.slope, 0.0005) + " " + T("trend_summary_suffix");
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
    pieHtml = '<div class="card"><h3>' + T("composition_title") + ' <span class="info-icon" title="' + T("composition_info") + '">i</span></h3><div class="pie-wrap">' +
      '<canvas id="pie-chart"></canvas>' +
      '<div class="pie-legend">' +
      BUCKET_KEYS.map((k) => '<div style="opacity:' + (isFadedBucket(k) ? "0.3" : "1") + ';"><span class="swatch" style="background:' + BUCKET_COLORS[k] + '"></span>' + label(k) + ": " + Math.round((props.s[k] || 0) * 100) + "%</div>").join("") +
      "</div></div></div>";

    // Contribution-to-index pie: each bucket's EI value weighted by its
    // share of ORP area. Sums to the same overall RIEI value shown in the
    // badge above (verified against the stored data) -- the remainder up to
    // 100% is shown as "Untapped potential," matching the requested design.
    const contributions = BUCKET_KEYS.map((k) => (props[k] != null ? props[k] * (props.s[k] || 0) : 0));
    const contribSum = contributions.reduce((a, b) => a + b, 0);
    const untapped = Math.max(0, 1 - contribSum);
    contribPieHtml = '<div class="card"><h3>' + T("contribution_title") + ' <span class="info-icon" title="' + T("contribution_info") + '">i</span></h3><div class="pie-wrap">' +
      '<canvas id="pie-chart-contrib"></canvas>' +
      '<div class="pie-legend">' +
      BUCKET_KEYS.map((k, i) => '<div style="opacity:' + (isFadedBucket(k) ? "0.3" : "1") + ';"><span class="swatch" style="background:' + BUCKET_COLORS[k] + '"></span>' + label(k) + ": " + Math.round(contributions[i] * 100) + "%</div>").join("") +
      '<div style="opacity:' + (featuredBucket ? "0.3" : "1") + ';"><span class="swatch" style="background:' + UNTAPPED_COLOR + '"></span>' + T("untapped_potential") + ": " + Math.round(untapped * 100) + "%</div>" +
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
      subPieHtml = '<div class="card"><h3>' + T("subcategory_title").replace("{LABEL}", label(displayKey)) + ' <span class="info-icon" title="' + T("subcategory_info") + '">i</span></h3><div class="pie-wrap">' +
        '<canvas id="pie-chart-sub"></canvas>' +
        '<div class="pie-legend">' +
        rows.map((r, i) => '<div><span class="swatch" style="background:' + colors[i] + '"></span>' + r.label + ": " + Math.round((r.value / total) * 100) + "%</div>").join("") +
        "</div></div></div>";
    }
  }

  const closeBtn = isNational ? "" : '<button onclick="closeToNational()" style="float:right;border:none;background:#d4a017;color:#14418b;border-radius:14px;padding:5px 12px 5px 10px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">&larr; ' + T("back_to_national") + "</button>";
  const subLine = isNational ? T("national_sub") : T("orp_code") + ": " + kod + (regionName(kod) ? " · " + regionName(kod) : "");

  const panel = document.getElementById("panel-content");
  panel.innerHTML =
    "<h2>" + closeBtn + name + "</h2>" +
    '<div class="sub">' + subLine + "</div>" +
    // Colored tag naming the featured land-use category, so it stays
    // obvious while scrolling through the composition pie / trend chart
    // below that everything on this page is scoped to that one category.
    (featuredBucket ? '<div style="margin:2px 0 12px;"><span style="display:inline-block;background:' + BUCKET_COLORS[displayKey] + ';color:#fff;font-size:11px;font-weight:700;letter-spacing:.03em;padding:4px 11px;border-radius:12px;">' + T("viewing_label") + " " + label(displayKey) + "</span></div>" : "") +
    '<div class="card"><h3>' + badgeLabel + (badgeKey === "I" ? ' <span class="info-icon" title="' + T("tooltip_index_info") + '">i</span>' : "") + '</h3>' +
    '<div class="sub" style="margin-bottom:4px;">' + T("index_in_year").replace("{LABEL}", badgeLabel) + " " + currentYear + "</div>" +
    '<span class="index-badge" style="background:' + idxColor + '">' + idxPct + "</span>" +
    (idxDelta != null ? ' &nbsp; <span style="font-size:12px;" title="' + T("yoy") + '">' + T("yoy") + ": " + trendArrow(idxDelta) + (prevYear !== undefined ? " " + T("since") + " " + prevYear : "") + "</span>" : "") +
    (trendSummary ? '<div class="sub" style="margin-top:8px;">' + trendSummary + "</div>" : "") +
    (kod !== NATIONAL_KOD ? (
      '<div class="sub" style="margin-top:6px;">' + T("comparison_desc") + " (" + regionName(kod) + ").</div>" +
      '<div class="stat-box" style="margin-top:6px;">' +
      T("region_median") + ": " + (idxRMed != null ? pctNum(idxRMed).toFixed(1) + "%" : T("na")) + "<br>" +
      T("vs_region") + ": " + (idxVal != null && idxRMed != null ? ((idxVal - idxRMed) >= 0 ? '<span class="trend-up">' + T("above_by") + " " + pctNum(idxVal - idxRMed).toFixed(1) + "%</span>" : '<span class="trend-down">' + T("below_by") + " " + pctNum(Math.abs(idxVal - idxRMed)).toFixed(1) + "%</span>") : T("na")) +
      "</div>"
    ) : "") +
    "</div>" +
    pieHtml + contribPieHtml + subPieHtml +
    '<div class="card"><h3>' + T("history_title") + ' <span class="info-icon" title="' + T("history_info_current") + '">i</span></h3><div class="chart-wrap"><canvas id="chart" height="200"></canvas></div>' +
    '<div class="sub" style="margin-top:6px;">' + T("values_note") + "</div></div>" +
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
            .concat([featuredBucket ? hexToRgba(UNTAPPED_COLOR, 0.25) : UNTAPPED_COLOR]),
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
    borderColor: aClassIsFeatured ? "rgba(20,65,139,0.55)" : "#14418b",
    backgroundColor: aClassIsFeatured ? "rgba(20,65,139,0.55)" : "#14418b",
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
  chartInstance = new Chart(ctx2, {
    type: "line",
    data: { labels: labels, datasets: datasets },
    options: {
      responsive: true,
      // Off, same reasoning as the Change-mode chart -- this one redraws
      // on every ORP click, year-slider move, and Display-dropdown change,
      // and Chart.js's default draw-in animation on each of those read as
      // noise rather than a meaningful transition.
      animation: false,
      scales: { y: { min: niceMin, max: niceMax, ticks: { callback: (v) => v + "%" } } },
      plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 10 } } } },
    },
  });
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

function leaderboardHtml(rows, titleKey, lowKey, highKey, noteKey, scopeLabel, periodLabel) {
  let titleHtml = periodLabel ? T(titleKey).replace("{PERIOD}", periodLabel) : T(titleKey);
  titleHtml += scopeLabel ? " — " + scopeLabel : "";

  if (rows.length < 2) {
    return '<div class="card"><h3>' + titleHtml + ' <span class="info-icon" title="' + T("leaderboard_info") + '">i</span></h3><div class="leaderboard">' +
      '<div class="sub">' + T("region_too_small") + "</div></div></div>";
  }

  // Cap to 5 per side but never let the two halves overlap when the scoped
  // list (e.g. a single kraj) has fewer than 10 ORPs in it.
  const half = Math.min(5, Math.floor(rows.length / 2));
  const worst = rows.slice(0, half);
  const best = rows.slice(rows.length - half).reverse();

  function rowsHtml(list, cls) {
    return list.map((r, i) => (
      "<tr onclick=\"selectFromLeaderboard('" + r.kod + "')\"><td>" + (i + 1) + "</td><td>" + orpName(r.kod) +
      '</td><td class="' + cls + '">' + (r.val >= 0 ? "+" : "") + pctNum(r.val).toFixed(1) + "%</td></tr>"
    )).join("");
  }

  return '<div class="card"><h3>' + titleHtml + ' <span class="info-icon" title="' + T("leaderboard_info") + '">i</span></h3><div class="leaderboard">' +
    '<table><thead><tr><th></th><th>&#9660; ' + T(lowKey) + '</th><th></th></tr></thead><tbody>' + rowsHtml(worst, "val-down") + "</tbody></table>" +
    '<div style="height:8px;"></div>' +
    '<table><thead><tr><th></th><th>&#9650; ' + T(highKey) + '</th><th></th></tr></thead><tbody>' + rowsHtml(best, "val-up") + "</tbody></table>" +
    '<div class="sub" style="margin-top:6px;">' + T(noteKey) + "</div></div></div>";
}

// Change-over-time mode: rank by delta between the two selected years.
// Scoped to the selected ORP's own kraj (VUSC region) once an ORP is picked,
// per client request -- falls back to the full national ranking on the
// national view (no ORP selected yet).
function renderChangeLeaderboard(kod) {
  const key = displayKey === "I" ? "I" : displayKey;
  const scoped = kod && kod !== NATIONAL_KOD;
  const allowed = scoped ? new Set([kod, ...regionPeers(kod)]) : null;
  const rows = Object.keys(ORP_DATA)
    .filter((k) => k !== NATIONAL_KOD)
    .filter((k) => !allowed || allowed.has(k))
    .map((k) => ({ kod: k, val: computeDelta(k, key) }))
    .filter((r) => r.val !== null);
  rows.sort((a, b) => a.val - b.val);
  const scopeLabel = scoped ? regionName(kod) : null;
  return leaderboardHtml(rows, "leaderboard_title", "biggest_decline", "biggest_improvement", "change_note", scopeLabel, fromYear + "→" + toYear);
}

// Current State mode (colleague comment #19): rank by the absolute value
// in the single selected year, not by a delta -- so the user immediately
// sees the best/worst-off ORPs for "right now" without switching modes.
// Scoped to the selected ORP's own kraj (VUSC region) once an ORP is picked.
function renderCurrentLeaderboard(kod) {
  const key = displayKey === "dominant" ? "I" : displayKey;
  const scoped = kod && kod !== NATIONAL_KOD;
  const allowed = scoped ? new Set([kod, ...regionPeers(kod)]) : null;
  const rows = Object.keys(ORP_DATA)
    .filter((k) => k !== NATIONAL_KOD)
    .filter((k) => !allowed || allowed.has(k))
    .map((k) => { const p = orpYear(k, currentYear); return { kod: k, val: p ? p[key] : null }; })
    .filter((r) => r.val !== null);
  rows.sort((a, b) => a.val - b.val);
  const scopeLabel = scoped ? regionName(kod) : null;
  return leaderboardHtml(rows, "ranking_title", "lowest_values", "highest_values", "values_note", scopeLabel);
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
  const closeBtn = isNational ? "" : '<button onclick="closeToNational()" style="float:right;border:none;background:#d4a017;color:#14418b;border-radius:14px;padding:5px 12px 5px 10px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">&larr; ' + T("back_to_national") + "</button>";
  const subLine = isNational ? T("national_sub") : T("orp_code") + ": " + kod + (regionName(kod) ? " · " + regionName(kod) : "");

  const panel = document.getElementById("panel-content");
  panel.innerHTML =
    "<h2>" + closeBtn + name + "</h2>" +
    '<div class="sub">' + subLine + "</div>" +
    '<div class="card"><h3>' + (displayKey === "I" ? T("health_index") : label(displayKey)) + " " + fromYear + "→" + toYear + ' <span class="info-icon" title="' + T("delta_card_info") + '">i</span></h3><div class="stat-box">' +
    trendArrow(delta, 0.01) + "</div></div>" +
    '<div class="card"><h3>' + T("history_title") + ' <span class="info-icon" title="' + T("history_info_change") + '">i</span></h3><div class="chart-wrap"><canvas id="chart" height="200"></canvas></div></div>' +
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
    borderColor: displayKey === "I" ? "#14418b" : BUCKET_COLORS[displayKey],
    backgroundColor: displayKey === "I" ? "#14418b" : BUCKET_COLORS[displayKey],
    borderWidth: 3,
    spanGaps: true,
    tension: 0.25,
    pointRadius: 0,
  }];
  if (trendLine) {
    datasets.push({
      label: T("trend_title"),
      data: trendLine,
      borderColor: "#b23a2e",
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
    options: {
      responsive: true,
      // Off, per client feedback -- this chart redraws every time From/To
      // changes, and Chart.js's default draw-in animation on every one of
      // those redraws read as distracting "popping" noise rather than a
      // meaningful transition.
      animation: false,
      scales: { y: { min: niceMin, max: niceMax, ticks: { callback: (v) => v + "%" } } },
      plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 10 } } } },
    },
  });
}

function showPanel(kod) {
  if (mode === "current") renderCurrentPanel(kod);
  else renderChangePanel(kod);
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
}

document.getElementById("display-select").addEventListener("change", function (e) {
  displayKey = e.target.value;
  renderLayer();
  showPanel(selectedKod);
});

document.getElementById("year-slider").addEventListener("input", function (e) {
  currentYearIdx = parseInt(e.target.value, 10);
  currentYear = YEARS[currentYearIdx];
  document.getElementById("year-label").textContent = currentYear;
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
  clearRaster();
  document.getElementById("mode-current").classList.toggle("active", m === "current");
  document.getElementById("mode-change").classList.toggle("active", m === "change");
  document.getElementById("current-year-group").style.display = m === "current" ? "flex" : "none";
  // range-year-group now lives in the right-hand panel (a .card), not the
  // dark header row, so it toggles as a block, not flex, per client
  // feedback that the year-range control should sit next to what it
  // actually affects (the change-analysis leaderboard/chart) instead of
  // implying it drives the whole dashboard from the header.
  document.getElementById("range-year-group").style.display = m === "change" ? "block" : "none";
  if (m === "change" && displayKey === "dominant") displayKey = "I";
  buildDisplaySelect();
  renderLayer();
  showPanel(selectedKod);
}

// ---------------------------------------------------------------------
// ORP search -- deliberately built as a plain HTML <input list> +
// <datalist> (native browser autocomplete) rather than a custom Leaflet
// control with hand-rolled filtering/dropdown UI. The browser owns the
// matching and the dropdown rendering; our code only has to react once a
// name is actually chosen, which is a much smaller, more robust surface.
const ORP_NAME_TO_KOD = {};
function buildOrpDatalist() {
  const list = document.getElementById("orp-datalist");
  if (!list) return;
  for (const k in ORP_NAME_TO_KOD) delete ORP_NAME_TO_KOD[k];
  const names = Object.keys(ORP_DATA)
    .filter((k) => k !== NATIONAL_KOD)
    .map((k) => ({ kod: k, name: orpName(k) }))
    .sort((a, b) => a.name.localeCompare(b.name, lang === "cz" ? "cs" : "en"));
  list.innerHTML = names.map((r) => '<option value="' + r.name.replace(/"/g, "&quot;") + '"></option>').join("");
  names.forEach((r) => { ORP_NAME_TO_KOD[r.name] = r.kod; });
}

function trySelectOrpByName(rawName) {
  const name = (rawName || "").trim();
  const kod = ORP_NAME_TO_KOD[name];
  if (!kod) return false; // no exact match yet -- user is still typing/browsing suggestions
  selectedKod = kod;
  renderLayer();
  showPanel(selectedKod);
  if (panelCollapsed) togglePanel();
  if (geoLayer) {
    geoLayer.eachLayer(function (layer) {
      if (layer.feature && layer.feature.properties && layer.feature.properties.KOD === kod) {
        try { map.fitBounds(layer.getBounds(), { padding: [60, 60], maxZoom: 12 }); } catch (e) {}
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
  document.getElementById("app-title").textContent = T("title");
  buildDisplaySelect();
  buildRasterSelect();
  buildOrpDatalist();
  renderLayer();
  showPanel(selectedKod);
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
showPanel(selectedKod); // opens on the national aggregate view (selectedKod defaults to NATIONAL_KOD)
