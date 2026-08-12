// Villes majeures par pays, utilisées pour l'autocomplétion du champ ville
// (inscription et création d'établissement). L'utilisateur reste libre de
// saisir une ville qui ne figure pas dans la liste.

export const CITIES_BY_COUNTRY: Record<string, string[]> = {
  // --- AFRIQUE DE L'OUEST (UEMOA & ZAO) ---
  "Côte d'Ivoire": [
    "Abidjan", "Bouaké", "Daloa", "Yamoussoukro", "Korhogo", "San-Pédro",
    "Man", "Gagnoa", "Divo", "Abengourou",
  ],
  "Sénégal": [
    "Dakar", "Thiès", "Saint-Louis", "Kaolack", "Ziguinchor", "Mbour", "Touba", "Louga",
  ],
  "Bénin": [
    "Cotonou", "Porto-Novo", "Parakou", "Abomey-Calavi", "Djougou", "Bohicon",
  ],
  "Burkina Faso": [
    "Ouagadougou", "Bobo-Dioulasso", "Koudougou", "Ouahigouya", "Banfora", "Kaya",
  ],
  "Togo": ["Lomé", "Sokodé", "Kara", "Kpalimé", "Atakpamé", "Dapaong"],
  "Mali": ["Bamako", "Sikasso", "Ségou", "Mopti", "Koutiala", "Kayes", "Gao"],
  "Niger": ["Niamey", "Zinder", "Maradi", "Agadez", "Tahoua", "Dosso"],
  "Guinée": ["Conakry", "Nzérékoré", "Kankan", "Kindia", "Labé", "Mamou"],
  "Nigeria": [
    "Lagos", "Abuja", "Kano", "Ibadan", "Port Harcourt", "Enugu", "Kaduna",
    "Benin City", "Calabar",
  ],
  "Ghana": ["Accra", "Kumasi", "Takoradi", "Tamale", "Cape Coast", "Tema"],

  // --- AFRIQUE CENTRALE (CEMAC) ---
  "Cameroun": ["Douala", "Yaoundé", "Garoua", "Bamenda", "Maroua", "Bafoussam", "Ngaoundéré"],
  "Gabon": ["Libreville", "Port-Gentil", "Franceville", "Oyem", "Moanda"],
  "Congo (Brazzaville)": ["Brazzaville", "Pointe-Noire", "Dolisie", "Nkayi"],
  "RDC (Kinshasa)": ["Kinshasa", "Lubumbashi", "Goma", "Bukavu", "Kisangani", "Mbuji-Mayi", "Kananga"],
  "Tchad": ["N'Djamena", "Moundou", "Sarh", "Abéché", "Kélo"],
  "Centrafrique": ["Bangui", "Bimbo", "Berbérati", "Bambari"],

  // --- AFRIQUE DU NORD ---
  "Maroc": ["Casablanca", "Rabat", "Marrakech", "Fès", "Tanger", "Agadir", "Meknès", "Oujda"],
  "Tunisie": ["Tunis", "Sfax", "Sousse", "Kairouan", "Bizerte", "Gabès"],
  "Algérie": ["Alger", "Oran", "Constantine", "Annaba", "Blida", "Sétif"],
  "Égypte": ["Le Caire", "Alexandrie", "Gizeh", "Louxor", "Assouan", "Hurghada", "Charm el-Cheikh"],

  // --- AFRIQUE DE L'EST ---
  "Kenya": ["Nairobi", "Mombasa", "Kisumu", "Nakuru", "Eldoret"],
  "Tanzanie": ["Dar es Salaam", "Dodoma", "Arusha", "Mwanza", "Zanzibar"],
  "Ouganda": ["Kampala", "Gulu", "Mbarara", "Jinja", "Entebbe"],
  "Rwanda": ["Kigali", "Huye", "Gisenyi", "Musanze"],
  "Éthiopie": ["Addis-Abeba", "Dire Dawa", "Mekele", "Gondar", "Bahir Dar"],

  // --- AFRIQUE AUSTRALE & OCÉAN INDIEN ---
  "Afrique du Sud": ["Johannesburg", "Le Cap", "Durban", "Pretoria", "Port Elizabeth"],
  "Madagascar": ["Antananarivo", "Toamasina", "Antsirabe", "Mahajanga"],
  "Maurice": ["Port-Louis", "Beau Bassin-Rose Hill", "Curepipe", "Quatre Bornes"],
  "Angola": ["Luanda", "Huambo", "Lobito", "Benguela", "Cabinda"],
};

export function getCitiesForCountry(country: string): string[] {
  return CITIES_BY_COUNTRY[country] ?? [];
}
