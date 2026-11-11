import { CategoryDefinition, CrateDefinition, SkinDefinition, WeaponClass, RarityId } from '../types/casino';
import ar15Img from '../../skins/ar15.png';
import ar15AnubisImg from '../../skins/ar15...9.png';
import ar15HowlImg from '../../skins/ar15__.png';
import akSerpentImg from '../../skins/AK_.png';
import akGivreImg from '../../skins/ak__givre.png';
import akFadeImg from '../../skins/ak_fade.png';
import awpImg from '../../skins/awp.png';
import awpDragonImg from '../../skins/awp_dragon.png';
import couteauImg from '../../skins/Couteau.png';
import couteauWebImg from '../../skins/Couteau99.png';
import pistoletDragonImg from '../../skins/deagle_____.png';
import akGoldImg from '../../skins/image.png';
import akPharaohImg from '../../skins/image_2.png';
import karambitImg from '../../skins/Karambit.png';
import karambitFadeImg from '../../skins/karambit_fade.png';
import karambitWebImg from '../../skins/Karambit88.png';
import mac10Img from '../../skins/mac_10.png';
import crateOmbreBorealeImg from '../assets/crates/ombre-boreale.jpg';
import crateProtocoleCobaltImg from '../assets/crates/protocole-cobalt.jpg';
import crateMatriceSaphirImg from '../assets/crates/matrice-saphir.jpg';
import crateReacteurPlasmaImg from '../assets/crates/reacteur-plasma.jpg';
import crateEmpireDorImg from '../assets/crates/empire-dor.jpg';
import crateAbyssePrismatiqueImg from '../assets/crates/abysse-prismatique.jpg';
import valoAwpGlitchImg from '../../skins_valo/awp_glitch_valo.webp';
import valoAwpReaverImg from '../../skins_valo/awp_reaver_valo.webp';
import valoAwpDragonImg from '../../skins_valo/awp_valo.webp';
import valoChampKarambitImg from '../../skins_valo/champions_2021_valo-karambit_secret.webp';
import valoChampVandalImg from '../../skins_valo/champions_2021_valo_secret.webp';
import valoChampKnifeImg from '../../skins_valo/champions_knife_valo_secret.webp';
import valoEvoriVandalImg from '../../skins_valo/evori_valo.webp';
import valoKatanaImg from '../../skins_valo/katana_valo_legendary.webp';
import valoKuronamiImg from '../../skins_valo/kuronami_secret.webp';
import valoOniPhantomImg from '../../skins_valo/oni_phantom_valo.webp';
import valoPrimeVandalImg from '../../skins_valo/Prime_valo.webp';
import valoProtocolPhantomImg from '../../skins_valo/protocol_phantom_valo.webp';
import valoRgxVandalImg from '../../skins_valo/rgx_valo.webp';
import valoVctKnifeImg from '../../skins_valo/valo_knife_champ.webp';
import valoBlackMarketVandalImg from '../../skins_valo/vandal_marché-noir_valo.webp';
import valoArcaneDeagleImg from '../assets/skins_valo/deagle_arcane_valo.png';
import valoSnowDeagleImg from '../assets/skins_valo/deagle_neige_valo.png';
import valoReaverDeagleImg from '../assets/skins_valo/reaver_deagle_valo.png';
import valoPreludeVandalImg from '../assets/skins_valo/prelude_vandal_valo.png';
import valoSingularityPhantomImg from '../assets/skins_valo/singularity_phantom_valo.png';
import { GENERATED_SKINS } from './generatedSkins';

export const CASE_CATEGORIES: CategoryDefinition[] = [
  {
    id: 'tactique',
    name: 'Opérations Tactiques',
    badge: 'CATÉGORIE 01 • TERRAIN',
    description:
      'Équipements de reconnaissance arctique, alliages furtifs en titane et protocoles haute pression.',
    accent: '#38BDF8',
  },
  {
    id: 'cyber',
    name: 'Avant-Garde Cyber',
    badge: 'CATÉGORIE 02 • HAUTE TECH',
    description:
      'Armement expérimental issu de laboratoires quantiques, circuits saphir et réacteurs à plasma astral.',
    accent: '#A78BFA',
  },
  {
    id: 'reliques',
    name: 'Panthéon & Reliques',
    badge: 'CATÉGORIE 03 • PRESTIGE',
    description:
      'Pièces de collection sculptées dans l’or impérial, le platine et les cristaux prismatiques rares.',
    accent: '#FBBF24',
  },
];

type RawSkinTuple = [
  name: string,
  weaponName: string,
  weaponClass: WeaponClass,
  rarity: RarityId,
  valueMult: number,
  swatches: [string, string, string],
  tagline: string,
  image?: string,
];

function buildSkins(crateId: string, price: number, rows: RawSkinTuple[]): SkinDefinition[] {
  return rows.map(([name, weaponName, weaponClass, rarity, valueMult, swatches, tagline, image], idx) => {
    const id = `${crateId}_skin_${String(idx + 1).padStart(2, '0')}`;
    return {
      id,
      name,
      weaponName,
      weaponClass,
      rarity,
      baseValue: Math.max(5, Math.round(price * valueMult)),
      swatches,
      tagline,
      image: image ?? GENERATED_SKINS[id],
    };
  });
}

export const CRATES: CrateDefinition[] = [
  // =========================================================================
  // CATÉGORIE 1 : OPÉRATIONS TACTIQUES
  // =========================================================================
  {
    id: 'ombre-boreale',
    categoryId: 'tactique',
    name: 'Ombre Boréale',
    subtitle: 'Reconnaissance Polaire & Furtivité',
    themeTag: 'Série Polaire',
    description:
      'Inspirée des unités d’infiltration en zone arctique : finitions mates gris glacier, optiques saphir et gravures topographiques.',
    price: 120,
    accentColor: '#38BDF8',
    secondaryColor: '#0C4A6E',
    emblemType: 'forest',
    image: crateOmbreBorealeImg,
    skins: buildSkins('ombre-boreale', 120, [
      // 7 Communes
      ['Givre Mat', 'Pistolet Tactique', 'pistolet', 'commune', 0.25, ['#475569', '#1E293B', '#94A3B8'], 'Revêtement polymère gris glacier sans reflet.'],
      ['Flore Sauvage', 'MAC-10', 'pm', 'commune', 0.28, ['#4D7C0F', '#A855F7', '#FBBF24'], 'Pistolet-mitrailleur compact vert mousse strié d’or et orné d’une fleur violette.', mac10Img],
      ['Acier Boréal', 'MAC-10', 'pm', 'commune', 0.30, ['#4B5563', '#1F2937', '#9CA3AF'], 'Canon brossé à patine froide argentée.'],
      ['Brume Polaire', 'AK-47', 'fusil', 'commune', 0.33, ['#3F4E62', '#17202E', '#93C5FD'], 'Texture grainée résistante au gel extrême.'],
      ['Sentier Gelé', 'MAC-10', 'pm', 'commune', 0.36, ['#43536B', '#1C2536', '#BAE6FD'], 'Marquage tactique bleu-gris sobre.'],
      ['Ardoise Sombre', 'Pistolet Tactique', 'pistolet', 'commune', 0.39, ['#374151', '#111827', '#7DD3FC'], 'Poignée nervurée noir et acier bleu.'],
      ['Ligne Topographique', 'AR-15', 'fusil', 'commune', 0.42, ['#3B526B', '#131F2E', '#93C5FD'], 'Courbes de niveau gravées au laser.'],
      // 6 Rares
      ['Optique Saphir', 'AR-15 Silencieux', 'fusil', 'rare', 0.95, ['#38BDF8', '#0C4A6E', '#BAE6FD'], 'Indicateurs lumineux bleu glacier sur la culasse.'],
      ['Éclat de Glace', 'AR-15', 'fusil', 'rare', 1.05, ['#0EA5E9', '#082F49', '#E0F2FE'], 'Facettes entrelacées façon cristal givré.'],
      ['Viseur de Nuit', 'MAC-10', 'pm', 'rare', 1.12, ['#60A5FA', '#172554', '#DBEAFE'], 'Lentille frontale teintée bleu haute netteté.'],
      ['Chasseur Polaire', 'AWP', 'sniper', 'rare', 1.20, ['#38BDF8', '#0F172A', '#A5F3FC'], 'Bande thermique et canon flûté mat.'],
      ['Patrouille Fantôme', 'Pistolet Tactique', 'pistolet', 'rare', 1.28, ['#22D3EE', '#083344', '#CFFAFE'], 'Sérigraphie militaire à haute visibilité.'],
      ['Acier Givré', 'AK-47', 'fusil', 'rare', 1.36, ['#93C5FD', '#1E293B', '#E2E8F0'], 'AK-47 recouvert d’un placage métallique froissé aux reflets bleu glacier.', akGivreImg],
      // 4 Mythiques
      ['Loup de la Toundra', 'AWP', 'sniper', 'mythique', 2.05, ['#A78BFA', '#1E1B4B', '#DDD6FE'], 'Gravure lupine argentée sur châssis cobalt.'],
      ['Écho Radar', 'MAC-10', 'pm', 'mythique', 2.30, ['#818CF8', '#1E1B4B', '#E0E7FF'], 'Ondes sonar lumineuses intégrées au corps.'],
      ['Garde Arctique', 'AR-15 Silencieux', 'fusil', 'mythique', 2.55, ['#8B5CF6', '#2E1065', '#F3E8FF'], 'Placage anodisé indigo et inserts platine.'],
      ['Dague des Glaciers', 'Couteau Baïonnette', 'lame', 'mythique', 2.85, ['#A78BFA', '#172554', '#E0F2FE'], 'Acier feuilleté à reflets bleu-violet profonds.'],
      // 3 Légendaires
      ['Esprit du Nord', 'AWP', 'sniper', 'legendaire', 12.60, ['#FBBF24', '#0F172A', '#FEF3C7'], 'Filigranes dorés sur titane bleu nuit.'],
      ['Prédateur Boréal', 'AK-47', 'fusil', 'legendaire', 14.70, ['#F59E0B', '#1E293B', '#38BDF8'], 'Sculpture relief dorée sur armature carbone.'],
      ['Griffe de Lynx', 'Karambit', 'lame', 'legendaire', 17.40, ['#FBBF24', '#0C4A6E', '#FDE68A'], 'Lame courbe gravée de runes nordiques dorées.'],
      // 2 Secrets
      ['Aurore Interdite', 'AWP', 'sniper', 'secret', 380.0, ['#F472B6', '#38BDF8', '#FDE047'], 'Finition prismatique changeante capturant les aurores.'],
      ['Griffe Polaire', 'Karambit', 'lame', 'secret', 550.0, ['#38BDF8', '#0C4A6E', '#E2E8F0'], 'Lame courbée bleu glacier anodisé au manche camouflage arctique.', karambitImg],
    ]),
  },
  {
    id: 'protocole-cobalt',
    categoryId: 'tactique',
    name: 'Protocole Cobalt',
    subtitle: 'Escouade Tactique & Haute Pression',
    themeTag: 'Cobalt-Tech',
    description:
      'Armes d’intervention blindées en polymère bleu cobalt, joints pressurisés et marquages balistiques épurés.',
    price: 220,
    accentColor: '#60A5FA',
    secondaryColor: '#1E3A8A',
    emblemType: 'venom',
    image: crateProtocoleCobaltImg,
    skins: buildSkins('protocole-cobalt', 220, [
      // 7 Communes
      ['Joint Étanche', 'Pistolet Tactique', 'pistolet', 'commune', 0.25, ['#475569', '#0F172A', '#93C5FD'], 'Polymère gris-bleu de zone pressurisée.'],
      ['Alerte Niveau 1', 'MAC-10', 'pm', 'commune', 0.28, ['#3B4963', '#111827', '#BFDBFE'], 'Bandes de sécurité diagonales sobres.'],
      ['Filtre Carbone', 'MAC-10', 'pm', 'commune', 0.31, ['#334155', '#090E1A', '#94A3B8'], 'Peinture industrielle anti-corrosion.'],
      ['Scellé Cobalt', 'AR-15', 'fusil', 'commune', 0.34, ['#3E5070', '#131C2E', '#60A5FA'], 'Numérotation de série au pochoir fin.'],
      ['Tube Pression', 'MAC-10', 'pm', 'commune', 0.36, ['#4B5563', '#111827', '#7DD3FC'], 'Crosse renforcée à témoins bleutés.'],
      ['Vapeur Froide', 'Pistolet Tactique', 'pistolet', 'commune', 0.39, ['#475569', '#182235', '#E0F2FE'], 'Finition satinée gris titane.'],
      ['Buse Acier', 'AK-47', 'fusil', 'commune', 0.42, ['#334155', '#0F172A', '#38BDF8'], 'Détails cyan discrets sur le garde-main.'],
      // 6 Rares
      ['Décharge Bleue', 'MAC-10', 'pm', 'rare', 0.96, ['#38BDF8', '#0F172A', '#E0F2FE'], 'Éclairs fins bleu électrique sur noir mat.'],
      ['Capsule Réactive', 'AR-15', 'fusil', 'rare', 1.04, ['#0EA5E9', '#082F49', '#BAE6FD'], 'Réservoir latéral rétroéclairé bleu saphir.'],
      ['Impact Double', 'Pistolet Tactique', 'pistolet', 'rare', 1.12, ['#60A5FA', '#172554', '#EFF6FF'], 'Double filet cobalt courant le long du canon.'],
      ['Onde Pressurisée', 'AR-15 Silencieux', 'fusil', 'rare', 1.22, ['#2563EB', '#091534', '#93C5FD'], 'Dégradé fumée bleue sous vernis brillant.'],
      ['Faisceau Lourd', 'AWP', 'sniper', 'rare', 1.29, ['#38BDF8', '#0C1B33', '#BAE6FD'], 'Repères micrométriques gravés sur la lunette.'],
      ['Protocole Z4', 'AR-15 Silencieux', 'fusil', 'rare', 1.38, ['#18181B', '#F8FAFC', '#EF4444'], 'AR-15 furtif noir mat doté d’un silencieux alvéolé et de marquages Z4.', ar15Img],
      // 4 Mythiques
      ['Acier Trempé', 'AK-47', 'fusil', 'mythique', 2.25, ['#38BDF8', '#EAB308', '#78350F'], 'AK-47 à patine bleue et dorée trempée à chaud sur châssis bois classique.', akFadeImg],
      ['Noyau Volt', 'MAC-10', 'pm', 'mythique', 2.32, ['#8B5CF6', '#1E1B4B', '#E0E7FF'], 'Circuit interne à lueur améthyste pulsante.'],
      ['Dard Ionique', 'AWP', 'sniper', 'mythique', 2.60, ['#818CF8', '#0F172A', '#C7D2FE'], 'Fibre optique indigo traversant tout le fût.'],
      ['Scalpel Azur', 'Couteau Baïonnette', 'lame', 'mythique', 2.88, ['#A78BFA', '#0F172A', '#E0F2FE'], 'Tranchant poli miroir à gouttière violette.'],
      // 3 Légendaires
      ['Hydre d’Or', 'AK-47', 'fusil', 'legendaire', 12.90, ['#FBBF24', '#0F172A', '#60A5FA'], 'Têtes d’hydre dorées sur alliage bleu profond.'],
      ['Protocole Oméga', 'AWP', 'sniper', 'legendaire', 15.15, ['#F59E0B', '#172554', '#BAE6FD'], 'Sceau d’or de commandement sur titane.'],
      ['Toile Écarlate', 'Couteau Baïonnette', 'lame', 'legendaire', 17.85, ['#B91C1C', '#18181B', '#EF4444'], 'Couteau tactique rouge sang parcouru d’une toile d’araignée noire sur manche strié.', couteauWebImg],
      // 2 Secrets
      ['Tempête Dorée', 'AR-15 Silencieux', 'fusil', 'secret', 370.0, ['#F472B6', '#38BDF8', '#FBBF24'], 'Alliage vivant à reflets rose nébuleuse, or et saphir.'],
      ['Sceptre Absolu', 'Karambit', 'lame', 'secret', 540.0, ['#EC4899', '#A78BFA', '#BAE6FD'], 'Artefact de laboratoire rarissime à aura prismatique.'],
    ]),
  },

  // =========================================================================
  // CATÉGORIE 2 : AVANT-GARDE CYBER
  // =========================================================================
  {
    id: 'matrice-saphir',
    categoryId: 'cyber',
    name: 'Matrice Saphir',
    subtitle: 'Circuits Quantiques & Fibres Optiques',
    themeTag: 'Cyber-Optique',
    description:
      'Design épuré en céramique blanche et noire, tracés vectoriels bleu cyan et télémétrie holographique.',
    price: 380,
    accentColor: '#22D3EE',
    secondaryColor: '#083344',
    emblemType: 'matrix',
    image: crateMatriceSaphirImg,
    skins: buildSkins('matrice-saphir', 380, [
      // 7 Communes
      ['Trame Grise', 'Pistolet Tactique', 'pistolet', 'commune', 0.25, ['#475569', '#0F172A', '#94A3B8'], 'Grille orthogonale minimaliste sur châssis mat.'],
      ['Bit Zéro', 'MAC-10', 'pm', 'commune', 0.28, ['#334155', '#0B131A', '#7DD3FC'], 'Code binaire discret sur le chargeur.'],
      ['Port Optique', 'MAC-10', 'pm', 'commune', 0.31, ['#3B495E', '#111827', '#BAE6FD'], 'Connecteurs bleutés encastrés en ligne droite.'],
      ['Câble Blindé', 'AR-15', 'fusil', 'commune', 0.34, ['#334155', '#0F172A', '#CBD5E1'], 'Gainage tressé gris et aluminium brossé.'],
      ['Signal Faible', 'MAC-10', 'pm', 'commune', 0.37, ['#475569', '#111827', '#93C5FD'], 'Barres d’onde minimalistes sur la crosse.'],
      ['Diode Glace', 'Pistolet Tactique', 'pistolet', 'commune', 0.39, ['#334155', '#0F172A', '#38BDF8'], 'Ligne LED continue le long du rail inférieur.'],
      ['Vecteur Simple', 'AK-47', 'fusil', 'commune', 0.42, ['#3F4C63', '#0D1320', '#7DD3FC'], 'Géométrie vectorielle propre et anguleuse.'],
      // 6 Rares
      ['Flux Quantique', 'MAC-10', 'pm', 'rare', 0.96, ['#22D3EE', '#083344', '#CFFAFE'], 'Pistes de circuit lumineuses cyan pur.'],
      ['Impulsion Laser', 'Pistolet Tactique', 'pistolet', 'rare', 1.05, ['#38BDF8', '#082F49', '#F0F9FF'], 'Céramique blanche et faisceaux saphir.'],
      ['Surcharge Data', 'AR-15 Silencieux', 'fusil', 'rare', 1.13, ['#0EA5E9', '#0C1B33', '#BAE6FD'], 'Matrices de points animés sur le canon.'],
      ['Terminal V4', 'AR-15', 'fusil', 'rare', 1.22, ['#22D3EE', '#0F172A', '#A5F3FC'], 'Télémétrie digitale projetée sur le boîtier.'],
      ['Fibre Pure', 'AWP', 'sniper', 'rare', 1.29, ['#38BDF8', '#0B172A', '#E0F2FE'], 'Tubes transparents révélant une fibre cyan.'],
      ['Écailles Magenta', 'Pistolet Tactique', 'pistolet', 'rare', 1.36, ['#EC4899', '#18181B', '#F9A8D4'], 'Pistolet noir mat orné d’un dragon écailleux rose vif courant sur la poignée.', pistoletDragonImg],
      // 4 Mythiques
      ['Hologramme Vif', 'AR-15 Silencieux', 'fusil', 'mythique', 2.08, ['#A78BFA', '#1E1B4B', '#E9D5FF'], 'Coque translucide laissant passer des reflets améthyste.'],
      ['Paradoxe Binaire', 'MAC-10', 'pm', 'mythique', 2.34, ['#8B5CF6', '#17153B', '#C4B5FD'], 'Symboles cryptographiques gravés en profondeur.'],
      ['Nébuleuse Chromatique', 'AWP', 'sniper', 'mythique', 2.75, ['#7C3AED', '#2563EB', '#2DD4BF'], 'AWP aux volutes violettes profondes coiffé d’une optique turquoise chromée.', awpImg],
      ['Lame Pixel', 'Couteau Baïonnette', 'lame', 'mythique', 2.90, ['#A78BFA', '#1E1B4B', '#EDE9FE'], 'Tranchant géométrique émettant une lueur violette.'],
      // 3 Légendaires
      ['Architecte d’Or', 'AK-47', 'fusil', 'legendaire', 12.75, ['#FBBF24', '#0F172A', '#38BDF8'], 'Circuits en or 24 carats sur verre noir saphir.'],
      ['Surcharge Royale', 'AWP', 'sniper', 'legendaire', 15.30, ['#F59E0B', '#1E1B4B', '#BAE6FD'], 'Noyau de calcul doré encastré sous la lunette.'],
      ['Sabre Quantique', 'Couteau Baïonnette', 'lame', 'legendaire', 17.85, ['#FBBF24', '#082F49', '#CFFAFE'], 'Lame mono-moléculaire à tracé doré.'],
      // 2 Secrets
      ['Singularité Bleue', 'AWP', 'sniper', 'secret', 390.0, ['#F472B6', '#38BDF8', '#A78BFA'], 'Champ quantique distordant la couleur à chaque angle.'],
      ['Clé Maîtresse', 'Karambit', 'lame', 'secret', 550.0, ['#EC4899', '#22D3EE', '#FDE047'], 'Hologramme solide d’une rareté quasi légendaire.'],
    ]),
  },
  {
    id: 'reacteur-plasma',
    categoryId: 'cyber',
    name: 'Réacteur Plasma',
    subtitle: 'Chambres Cryo & Noyaux Améthyste',
    themeTag: 'Énergie Plasma',
    description:
      'Armes refroidies par liquide plasma violet pressurisées au cœur de chambres de confinement cryogéniques.',
    price: 550,
    accentColor: '#A78BFA',
    secondaryColor: '#3B0764',
    emblemType: 'reactor',
    image: crateReacteurPlasmaImg,
    skins: buildSkins('reacteur-plasma', 550, [
      // 7 Communes
      ['Valve Grise', 'Pistolet Tactique', 'pistolet', 'commune', 0.25, ['#52526B', '#14141F', '#CBD5E1'], 'Soupapes en acier brossé et joint lavande.'],
      ['Givre Léger', 'MAC-10', 'pm', 'commune', 0.28, ['#4A506B', '#151828', '#E2E8F0'], 'Aspect givré gris-indigo très épuré.'],
      ['Cuve Titane', 'MAC-10', 'pm', 'commune', 0.31, ['#47475E', '#12121D', '#C4B5FD'], 'Ailettes de dissipation thermique usinées.'],
      ['Conduit Froid', 'AR-15', 'fusil', 'commune', 0.34, ['#3F425E', '#10121F', '#A5B4FC'], 'Durites apparentes gris opale.'],
      ['Jauge Basse', 'MAC-10', 'pm', 'commune', 0.37, ['#4C4C66', '#151524', '#DDD6FE'], 'Barre de niveau intégrée sur le côté.'],
      ['Piston Argent', 'Pistolet Tactique', 'pistolet', 'commune', 0.40, ['#64748B', '#1E293B', '#F1F5F9'], 'Culasse argentée à rainures fines.'],
      ['Radiateur V1', 'AR-15 Silencieux', 'fusil', 'commune', 0.42, ['#43465E', '#11131F', '#93C5FD'], 'Ouïes de ventilation profilées en ardoise.'],
      // 6 Rares
      ['Plasma Calibré', 'AR-15', 'fusil', 'rare', 0.97, ['#38BDF8', '#0C4A6E', '#E0F2FE'], 'Chambre de fusion luisant d’un bleu glacier pur.'],
      ['Cellule Active', 'MAC-10', 'pm', 'rare', 1.05, ['#0EA5E9', '#082F49', '#BAE6FD'], 'Batterie latérale rétroéclairée saphir.'],
      ['Cryo-Décharge', 'AK-47', 'fusil', 'rare', 1.14, ['#22D3EE', '#083344', '#CFFAFE'], 'Givre cristallisé sur canon en alliage bleu.'],
      ['Flux Turbine', 'Pistolet Tactique', 'pistolet', 'rare', 1.21, ['#60A5FA', '#172554', '#EFF6FF'], 'Motif hélicoïdal inspiré des réacteurs.'],
      ['Faisceau Froid', 'AWP', 'sniper', 'rare', 1.30, ['#38BDF8', '#0F172A', '#BAE6FD'], 'Prismes optiques alignés sur rail cyan.'],
      ['Noyau Stable', 'AR-15 Silencieux', 'fusil', 'rare', 1.37, ['#0284C7', '#082F49', '#A5F3FC'], 'Anneaux concentriques autour du bloc détente.'],
      // 4 Mythiques
      ['Fusion Améthyste', 'AK-47', 'fusil', 'mythique', 2.10, ['#A78BFA', '#2E1065', '#F3E8FF'], 'Cœur lumineux flottant sous verre blindé.'],
      ['Cœur Critique', 'MAC-10', 'pm', 'mythique', 2.35, ['#8B5CF6', '#1E1B4B', '#DDD6FE'], 'Fission simulée avec gradient indigo-violet.'],
      ['Zéro Absolu', 'AWP', 'sniper', 'mythique', 2.62, ['#818CF8', '#0F172A', '#E0E7FF'], 'Cristaux bleutés et améthyste figés dans le métal.'],
      ['Lame Thermique', 'Couteau Baïonnette', 'lame', 'mythique', 2.92, ['#C084FC', '#2E1065', '#FAE8FF'], 'Fil incandescent violet sans aucune bavure.'],
      // 3 Légendaires
      ['Hurlement de Braise', 'AR-15', 'fusil', 'legendaire', 13.50, ['#DC2626', '#F97316', '#18181B'], 'AR-15 noir mat dévoré par des flammes écarlates formant une bête hurlante.', ar15HowlImg],
      ['Noyau Impérial', 'AWP', 'sniper', 'legendaire', 15.45, ['#F59E0B', '#1E1B4B', '#BAE6FD'], 'Mécanisme doré apparent haute horlogerie.'],
      ['Anges Tachyon', 'Couteau Baïonnette', 'lame', 'legendaire', 18.00, ['#B91C1C', '#F8FAFC', '#FBBF24'], 'Couteau tactique collector cramoisi, ivoire et or gravé d’étoiles.', couteauImg],
      // 2 Secrets
      ['Toile Écarlate', 'Karambit', 'lame', 'secret', 440.0, ['#B91C1C', '#18181B', '#EF4444'], 'Lame courbe rouge sang entrelacée d’une toile noire sur anneau écarlate.', karambitWebImg],
      ['Cœur de Réacteur', 'Karambit', 'lame', 'secret', 550.0, ['#EC4899', '#38BDF8', '#F8FAFC'], 'Relique énergétique unique quasi impossible à extraire.'],
    ]),
  },

  // =========================================================================
  // CATÉGORIE 3 : PANTHÉON & RELIQUES
  // =========================================================================
  {
    id: 'empire-dor',
    categoryId: 'reliques',
    name: 'Empire d’Or',
    subtitle: 'Sculptures Impériales & Platine Ciselé',
    themeTag: 'Luxe Ancestral',
    description:
      'Pièces d’apparat taillées dans le marbre noir et le platine, puis serties d’or fin par les maîtres artisans.',
    price: 30000,
    accentColor: '#FBBF24',
    secondaryColor: '#78350F',
    emblemType: 'jade',
    image: crateEmpireDorImg,
    skins: buildSkins('empire-dor', 30000, [
      // 7 Communes
      ['Marbre Poli', 'Pistolet Tactique', 'pistolet', 'commune', 0.25, ['#57534E', '#1C1917', '#D6D3D1'], 'Plaquettes lisses en pierre sombre matte.'],
      ['Bronze Gravé', 'MAC-10', 'pm', 'commune', 0.28, ['#6B5B45', '#1F1A14', '#E7D8C0'], 'Segments stylisés inspirés du bronze antique.'],
      ['Laque Ivoire', 'MAC-10', 'pm', 'commune', 0.31, ['#78716C', '#292524', '#F5F5F4'], 'Vernis céramique gris-ivoire craquelé.'],
      ['Sceau de Pierre', 'AR-15', 'fusil', 'commune', 0.34, ['#57534E', '#18181B', '#D4D4D8'], 'Calligraphie minimaliste sur fût sombre.'],
      ['Anneau Platine', 'MAC-10', 'pm', 'commune', 0.37, ['#64748B', '#1E293B', '#E2E8F0'], 'Bagues d’acier brossé sur corps carbone.'],
      ['Soie Grise', 'Pistolet Tactique', 'pistolet', 'commune', 0.40, ['#52525B', '#18181B', '#E4E4E7'], 'Texture tissée fine gris anthracite.'],
      ['Tuile Royale', 'AK-47', 'fusil', 'commune', 0.42, ['#44403C', '#1C1917', '#D6D3D1'], 'Motifs d’écailles géométriques sobres.'],
      // 6 Rares
      ['Saphir Royal', 'AR-15 Silencieux', 'fusil', 'rare', 0.96, ['#38BDF8', '#0F172A', '#E0F2FE'], 'Incrustations de saphir poli sur marbre noir.'],
      ['Gardien de Bronze', 'AK-47', 'fusil', 'rare', 1.05, ['#60A5FA', '#1C1917', '#FDE68A'], 'Alliance du bronze antique et du bleu roi.'],
      ['Éventail d’Argent', 'MAC-10', 'pm', 'rare', 1.13, ['#0EA5E9', '#090D16', '#BAE6FD'], 'Courbes déployées finement ciselées.'],
      ['Encre & Platine', 'Pistolet Tactique', 'pistolet', 'rare', 1.22, ['#38BDF8', '#09090B', '#F8FAFC'], 'Contrastes purs ivoire, noir et bleu roi.'],
      ['Grue Sacrée', 'AWP', 'sniper', 'rare', 1.30, ['#7DD3FC', '#0F172A', '#F1F5F9'], 'Plumes gravées en argent sur fond nuit.'],
      ['Couronne d’Argent', 'AR-15', 'fusil', 'rare', 1.37, ['#3B82F6', '#090D16', '#DBEAFE'], 'Motif royal entrelacé de filigranes fins.'],
      // 4 Mythiques
      ['Gardien d’Anubis', 'AR-15 Silencieux', 'fusil', 'mythique', 2.20, ['#1E5F74', '#EAB308', '#D6D3D1'], 'AR-15 gravé de hiéroglyphes sur silencieux et chargeur, orné du profil d’Anubis.', ar15AnubisImg],
      ['Tigre d’Obsidienne', 'MAC-10', 'pm', 'mythique', 2.36, ['#8B5CF6', '#18181B', '#DDD6FE'], 'Rayures fluides nacrées sur pierre polie.'],
      ['Phénix Indigo', 'AWP', 'sniper', 'mythique', 2.62, ['#818CF8', '#172554', '#FEF08A'], 'Ailes déployées le long du châssis de précision.'],
      ['Tanto Impérial', 'Couteau Baïonnette', 'lame', 'mythique', 2.90, ['#A78BFA', '#09090B', '#F3E8FF'], 'Lame droite sculptée dans l’acier platine.'],
      // 3 Légendaires
      ['Morsure Dorée', 'AK-47', 'fusil', 'legendaire', 13.80, ['#FACC15', '#1C1917', '#CA8A04'], 'AK-47 noir carbone parcouru de motifs dorés incandescents sur tout le fût.', akGoldImg],
      ['Sceptre du Palais', 'AWP', 'sniper', 'legendaire', 15.45, ['#F59E0B', '#09090B', '#FDE68A'], 'Ornementation royale digne d’un trésor de cour.'],
      ['Lame du Shogun', 'Karambit', 'lame', 'legendaire', 17.94, ['#FBBF24', '#27272A', '#FEF08A'], 'Garde en or ciselé et acier miroir pur.'],
      // 2 Secrets
      ['Souffle du Dragon', 'AWP', 'sniper', 'secret', 480.0, ['#EAB308', '#DC2626', '#3F6212'], 'AWP impérial doré traversé par un dragon cracheur de feu et optique à damier.', awpDragonImg],
      ['Dégradé Impérial', 'Karambit', 'lame', 'secret', 550.0, ['#2563EB', '#DC2626', '#7C3AED'], 'Lame courbe marbrée bleu saphir, pourpre et cramoisi sertie sur poignée carbone.', karambitFadeImg],
    ]),
  },
  {
    id: 'abysse-prismatique',
    categoryId: 'reliques',
    name: 'Abysse Prismatique',
    subtitle: 'Cristaux Vivants & Anomalies Astrales',
    themeTag: 'Prestige Ultime',
    description:
      'Notre coffre le plus prestigieux : gemmes astrales, éclats de quartz rose et finitions multidimensionnelles.',
    price: 35000,
    accentColor: '#F472B6',
    secondaryColor: '#701A75',
    emblemType: 'prism',
    image: crateAbyssePrismatiqueImg,
    skins: buildSkins('abysse-prismatique', 35000, [
      // 7 Communes
      ['Basalte Abyssal', 'Pistolet Tactique', 'pistolet', 'commune', 0.25, ['#475569', '#0B0F19', '#94A3B8'], 'Roche volcanique sombre veinée d’argent.'],
      ['Éclat Brut', 'MAC-10', 'pm', 'commune', 0.28, ['#3F485E', '#0D111C', '#CBD5E1'], 'Facettes mates taillées à la main.'],
      ['Ombre Marine', 'MAC-10', 'pm', 'commune', 0.31, ['#334155', '#090D16', '#93C5FD'], 'Bleu nuit abyssal profond sans reflets.'],
      ['Quartz Fumé', 'AR-15', 'fusil', 'commune', 0.34, ['#525266', '#11111A', '#E2E8F0'], 'Transparence fumée laissant deviner l’acier.'],
      ['Reflet Lunaire', 'MAC-10', 'pm', 'commune', 0.37, ['#4B5563', '#0F172A', '#E5E7EB'], 'Satin argent-ardoise à contraste doux.'],
      ['Veine Souterraine', 'Pistolet Tactique', 'pistolet', 'commune', 0.40, ['#434B61', '#0B0F1A', '#94A3B8'], 'Fines nervures minérales polies.'],
      ['Poussière d’Étoile', 'AR-15 Silencieux', 'fusil', 'commune', 0.42, ['#474B5E', '#0D0F18', '#D8B4FE'], 'Paillettes micro-métalliques argentées.'],
      // 6 Rares
      ['Cristal de Saphir', 'AR-15', 'fusil', 'rare', 0.96, ['#38BDF8', '#082F49', '#F0F9FF'], 'Polyèdres polis renvoyant une lumière pure.'],
      ['Opaline Bleue', 'MAC-10', 'pm', 'rare', 1.05, ['#0EA5E9', '#0C192C', '#BAE6FD'], 'Surface nacrée changeant du bleu au cyan.'],
      ['Corail Lumineux', 'AK-47', 'fusil', 'rare', 1.14, ['#22D3EE', '#083344', '#CFFAFE'], 'Arborescences phosphorescentes des profondeurs.'],
      ['Lueur Sidérale', 'Pistolet Tactique', 'pistolet', 'rare', 1.22, ['#60A5FA', '#0F172A', '#DBEAFE'], 'Constellation gravée en points lumineux.'],
      ['Mirage Glacé', 'AWP', 'sniper', 'rare', 1.30, ['#38BDF8', '#0B1324', '#E0F2FE'], 'Ondes réfractives sur fût en verre trempé.'],
      ['Prisme Boréal', 'AR-15 Silencieux', 'fusil', 'rare', 1.38, ['#0284C7', '#082F49', '#A5F3FC'], 'Arêtes taillées comme un diamant brut.'],
      // 4 Mythiques
      ['Serpent de Jade', 'AK-47', 'fusil', 'mythique', 2.25, ['#2A9D8F', '#5C2E14', '#EAB308'], 'AK-47 classique sculpté d’un serpent mythologique vert jade sur nuées sombres.', akSerpentImg],
      ['Comète Astrale', 'MAC-10', 'pm', 'mythique', 2.38, ['#8B5CF6', '#1E1B4B', '#EDE9FE'], 'Traînée lumineuse traversant tout le corps.'],
      ['Éclipse Totale', 'AWP', 'sniper', 'mythique', 2.65, ['#818CF8', '#020617', '#C7D2FE'], 'Noir abyssal cerclé d’un halo indigo vif.'],
      ['Éclat de Météore', 'Couteau Baïonnette', 'lame', 'mythique', 2.94, ['#C084FC', '#1E1B4B', '#FAE8FF'], 'Métal extraterrestre aux reflets violets.'],
      // 3 Légendaires
      ['Couronne Stellaire', 'AR-15', 'fusil', 'legendaire', 13.20, ['#FBBF24', '#1E1B4B', '#FDE68A'], 'Or stellaire forgé autour d’un cœur de saphir.'],
      ['Titan des Abysses', 'AWP', 'sniper', 'legendaire', 15.60, ['#F59E0B', '#0F172A', '#BAE6FD'], 'Écailles dorées et cristaux profonds incrustés.'],
      ['Faux Dimensionnelle', 'Karambit', 'lame', 'legendaire', 18.00, ['#FBBF24', '#2E1065', '#FEF08A'], 'Lame incurvée bordée d’or solaire pur.'],
      // 2 Secrets
      ['Relique du Pharaon', 'AK-47', 'fusil', 'secret', 480.0, ['#991B1B', '#FBBF24', '#D6D3D1'], 'AK-47 royal cramoisi orné d’un pharaon doré, d’un scarabée sacré et de bandelettes.', akPharaohImg],
      ['Âme Prismatique', 'Karambit', 'lame', 'secret', 580.0, ['#EC4899', '#A78BFA', '#FEF08A'], 'Légende absolue du casino, quasi impossible à obtenir.'],
    ]),
  },
  {
    id: 'protocole-radiant',
    categoryId: 'reliques',
    name: 'Protocole Radiant',
    subtitle: 'Arsenal Spécial • Édition 75K',
    themeTag: 'Radiant 75K',
    description:
      'Coffre haute tension à 10 pièces réunissant Protocole 781-A, Oni, Glitchpop, Pilleur, Katana Onimaru, Kuronami et Prélude au Chaos.',
    price: 75000,
    accentColor: '#F43F5E',
    secondaryColor: '#0F172A',
    emblemType: 'radiant',
    skins: buildSkins('protocole-radiant', 75000, [
      // 3 Communes
      ['Chute de Neige', 'Deagle', 'pistolet', 'commune', 0.28, ['#93C5FD', '#E2E8F0', '#38BDF8'], 'Deagle givré renfermant un village d’hiver lumineux sous verre.', valoSnowDeagleImg],
      ['Marché Noir', 'AK-47', 'fusil', 'commune', 0.35, ['#9A3412', '#1C1917', '#D6D3D1'], 'AK-47 tactique en bois verni et acier sombre sans fioritures.', valoBlackMarketVandalImg],
      ['Protocole 781-A', 'Phantom', 'fusil', 'commune', 0.42, ['#64748B', '#18181B', '#EAB308'], 'Phantom robotisé gris titane doté d’un silencieux intégré et d’inserts dorés.', valoProtocolPhantomImg],
      // 2 Rares
      ['Pilleur Spectral', 'Deagle', 'pistolet', 'rare', 1.08, ['#7C3AED', '#18181B', '#CBD5E1'], 'Deagle forgé d’aciers acérés violets et ornements spectraux.', valoReaverDeagleImg],
      ['Pilleur d’Âmes', 'AWP', 'sniper', 'rare', 1.32, ['#6D28D9', '#09090B', '#E2E8F0'], 'Sniper long canon violet sombre aux lames métalliques ciselées.', valoAwpReaverImg],
      // 2 Mythiques
      ['Oni Masqué', 'Phantom', 'fusil', 'mythique', 2.45, ['#DC2626', '#18181B', '#FBBF24'], 'Phantom silencieux laqué rouge et or arborant le masque d’Oni et cordelette tressée.', valoOniPhantomImg],
      ['Glitchpop Néon', 'AWP', 'sniper', 'mythique', 2.85, ['#22D3EE', '#A855F7', '#FACC15'], 'Sniper cyberpunk bicolore turquoise, magenta et câbles cuivre apparents.', valoAwpGlitchImg],
      // 1 Légendaire
      ['Onimaru Kunitsuna', 'Katana', 'lame', 'legendaire', 18.0, ['#B91C1C', '#1D4ED8', '#FBBF24'], 'Katana légendaire forgé à garde démoniaque dorée accompagné de son fourreau rouge.', valoKatanaImg],
      // 2 Secrets
      ['Kuronami', 'AK-47', 'fusil', 'secret', 460.0, ['#38BDF8', '#0F172A', '#E2E8F0'], 'AK-47 ninja sculpté de lames aiguisées, poignées gainées et noyau bleu azur.', valoKuronamiImg],
      ['Prélude au Chaos', 'AK-47', 'fusil', 'secret', 520.0, ['#A855F7', '#18181B', '#F59E0B'], 'AK-47 chaotique à cœur d’énergie violette incandescente et conduits dorés.', valoPreludeVandalImg],
    ]),
  },
  {
    id: 'pantheon-champions',
    categoryId: 'reliques',
    name: 'Panthéon Champions',
    subtitle: 'Tournoi Suprême • Édition 100K',
    themeTag: 'Champions 100K',
    description:
      'Coffre ultime des finales mondiales réunissant l’ensemble des skins Champions, les reliques cosmiques et l’arsenal d’élite à 100 000 CR.',
    price: 100000,
    accentColor: '#FACC15',
    secondaryColor: '#1E1B4B',
    emblemType: 'champions',
    skins: buildSkins('pantheon-champions', 100000, [
      // 2 Communes
      ['Prime Impérial', 'AK-47', 'fusil', 'commune', 0.30, ['#FACC15', '#18181B', '#7E22CE'], 'AK-47 futuriste blanc nacré, noir carbone et rail d’or géométrique.', valoPrimeVandalImg],
      ['Arcane Hextech', 'Deagle', 'pistolet', 'commune', 0.40, ['#F59E0B', '#334155', '#EC4899'], 'Deagle barillet bronze gravé et tags fluo de l’atelier Hextech.', valoArcaneDeagleImg],
      // 2 Rares
      ['Évori Astral', 'AK-47', 'fusil', 'rare', 1.12, ['#A78BFA', '#F8FAFC', '#FBBF24'], 'AK-47 céleste opalescent bordé de filigranes d’or stellaire.', valoEvoriVandalImg],
      ['RGX 11z Pro', 'AK-47', 'fusil', 'rare', 1.35, ['#84CC16', '#27272A', '#A3E635'], 'AK-47 squelettique transparent vert néon laissant voir les munitions et circuits.', valoRgxVandalImg],
      // 2 Mythiques
      ['Singularité', 'Phantom', 'fusil', 'mythique', 2.50, ['#7C3AED', '#09090B', '#E9D5FF'], 'Phantom à géométrie fractale noire maintenue par un trou noir violet.', valoSingularityPhantomImg],
      ['Flamme Ancienne', 'AWP', 'sniper', 'mythique', 2.90, ['#EA580C', '#1C1917', '#FDE047'], 'Sniper draconique vivant sculpté d’écailles sombres et yeux de braise.', valoAwpDragonImg],
      // 1 Légendaire
      ['Champions VCT', 'Dague', 'lame', 'legendaire', 18.0, ['#E2E8F0', '#18181B', '#D97706'], 'Dague double tranchant d’acier brossé frappée de l’emblème doré VCT.', valoVctKnifeImg],
      // 3 Secrets
      ['Champions 2021', 'AK-47', 'fusil', 'secret', 480.0, ['#FACC15', '#09090B', '#DC2626'], 'AK-47 collector noir et or arborant la signature officielle Champions 2021.', valoChampVandalImg],
      ['Champions 2021', 'Karambit', 'lame', 'secret', 560.0, ['#FACC15', '#18181B', '#DC2626'], 'Karambit mythique Champions 2021 à lame d’or biseautée et anneau rubis.', valoChampKarambitImg],
      ['Champions Pourpre', 'Dague', 'lame', 'secret', 590.0, ['#DC2626', '#18181B', '#E2E8F0'], 'Dague Champions de prestige en acier damas noir et manche cristal rubis.', valoChampKnifeImg],
    ]),
  },
];
