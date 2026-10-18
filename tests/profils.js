/*
 * tests/profils.js : élèves fictifs utilisés par les tests de non-régression.
 *
 * Chaque profil a la même forme que l'état enregistré par le site (CapStore) :
 * un profil (notes, spécialités…) et des réponses au questionnaire (data/questionnaire.json).
 * Les profils couvrent des situations variées : bons et moyens élèves, spécialités
 * différentes, élèves décidés et indécis, intérêt ou non pour l'étranger, profil vide.
 *
 * Ajouter un profil : l'ajouter ici, puis lancer `node tests/generer-reference.js`.
 * Ne jamais modifier un profil existant sans régénérer volontairement sa référence.
 */
"use strict";

// Une période de bulletin, au format du site
function periode(label, moyenne, notes = {}, extra = {}) {
  const n = {};
  for (const [mat, moy] of Object.entries(notes)) n[mat] = { moy: String(moy) };
  return { id: label, label, moyenneGenerale: String(moyenne), moyenneClasse: extra.classe != null ? String(extra.classe) : "", rang: "", effectif: "",
    notes: n, appreciationGenerale: extra.appreciation || "", mention: extra.mention || "" };
}
function profil(x) {
  return Object.assign({ prenom: "", niveau: "terminale", specialites: [], specialiteAbandonnee: "", optionMaths: "aucune", autresOptions: "",
    anglaisAuto: "", periodes: [], bacFrancais: { ecrit: "", oral: "" }, certifications: [], experiences: [] }, x);
}
const NICE = { nom: "Lycée Masséna (Nice)", lat: 43.6985, lon: 7.2737 };
const LYON = { nom: "Lycée du Parc (Lyon)", lat: 45.7689, lon: 4.8519 };

module.exports = [
  {
    id: "vide",
    description: "Profil vide : rien de renseigné, aucune réponse",
    profil: profil({}),
    reponses: {},
  },
  {
    id: "eco-excellent-decide",
    description: "17 de moyenne, maths + SES, maths expertes, vise une prépa ECG, à l'aise en anglais",
    profil: profil({
      specialites: ["maths", "SES"], specialiteAbandonnee: "HGGSP", optionMaths: "expertes", anglaisAuto: "C1", lycee: NICE,
      periodes: [periode("Première – T3", 16.8, { maths: 17.5, SES: 17 }, { classe: 12.5, mention: "Félicitations" }),
        periode("Terminale – T1", 17.1, { maths: 17.8, maths_expertes: 16.5, SES: 17.2 }, { classe: 12.8, appreciation: "Excellent trimestre, élève brillante et investie." })],
      bacPremiere: { francaisEcrit: "16", francaisOral: "17", maths: "18" },
      certifications: [{ type: "Cambridge", score: "185" }],
      experiences: [{ type: "competition", titre: "Olympiades de maths" }, { type: "responsabilite", titre: "Déléguée de classe" }],
    }),
    reponses: { matieres: ["maths", "ses"], maths_defi: 5, eco_actu: 5, finance: 4, politique: 3, argumenter: 4, regles: 2, entreprendre: 4, data: 4,
      technique: 2, societe: 3, creer: 2, soigner: 1, vivant: 1, secteurs: ["finance", "conseil", "entrepreneuriat"], salaire: 4, concret: 3,
      maths_niv: "3", ecrit_niv: "2", cadre: 5, poly: "ouvert", charge: "tres_forte", ambition: 5, tests: 4, long: 5, etranger: "plutot", anglais: 5,
      pays: ["Royaume-Uni", "Pays-Bas"], budget: "moyen", lieu: ["partout"], mobilite: "partout" },
  },
  {
    id: "eco-moyen",
    description: "11,5 de moyenne, SES + HGGSP, maths complémentaires, intéressé par le commerce, reste près de chez lui",
    profil: profil({
      specialites: ["SES", "HGGSP"], specialiteAbandonnee: "maths", optionMaths: "complementaires", anglaisAuto: "B1", lycee: NICE,
      periodes: [periode("Première – T3", 11.2, { maths: 9.5, SES: 12 }, { classe: 11.8 }),
        periode("Terminale – T1", 11.6, { maths_complementaires: 10.5, SES: 12.3, HGGSP: 11.8 }, { classe: 11.9, appreciation: "Ensemble correct, des efforts à poursuivre." })],
    }),
    reponses: { matieres: ["ses", "hg"], maths_defi: 2, eco_actu: 4, finance: 3, politique: 3, argumenter: 3, regles: 2, entreprendre: 5, data: 2,
      technique: 1, societe: 3, creer: 3, soigner: 2, vivant: 2, secteurs: ["marketing", "entrepreneuriat"], salaire: 4, concret: 5,
      maths_niv: "1", ecrit_niv: "1", cadre: 3, poly: "ouvert", charge: "moyenne", ambition: 3, tests: 2, long: 2, etranger: "non", anglais: 2,
      pays: ["aucun"], budget: "faible", lieu: ["regions"], mobilite: "proche" },
  },
  {
    id: "sciences-ingenieur",
    description: "15 de moyenne, maths + physique-chimie, maths expertes, attiré par l'ingénierie et l'informatique",
    profil: profil({
      specialites: ["maths", "physique_chimie"], specialiteAbandonnee: "NSI", optionMaths: "expertes", anglaisAuto: "B2", lycee: LYON,
      periodes: [periode("Terminale – T1", 15.2, { maths: 15.8, maths_expertes: 15, physique_chimie: 15.5 }, { classe: 12.1, appreciation: "Bon trimestre, travail sérieux." })],
      experiences: [{ type: "projet", titre: "Club robotique" }],
    }),
    reponses: { matieres: ["maths", "pc", "nsi"], maths_defi: 5, eco_actu: 2, finance: 2, politique: 1, argumenter: 2, regles: 3, entreprendre: 3, data: 5,
      technique: 5, societe: 2, creer: 3, soigner: 1, vivant: 2, secteurs: ["ingenierie", "data", "recherche"], salaire: 3, concret: 4,
      maths_niv: "3", ecrit_niv: "1", cadre: 4, poly: "specialiser", charge: "forte", ambition: 4, tests: 3, long: 4, etranger: "echange", anglais: 4,
      pays: ["Allemagne", "Suisse"], budget: "moyen", lieu: ["lyon", "partout"], mobilite: "partout" },
  },
  {
    id: "droit-sciencespo",
    description: "14 de moyenne, HGGSP + HLP, sans maths, veut faire du droit ou de la science politique",
    profil: profil({
      specialites: ["HGGSP", "HLP"], specialiteAbandonnee: "SES", anglaisAuto: "B2", lycee: NICE,
      periodes: [periode("Terminale – T1", 14.1, { HGGSP: 15, HLP: 14.5, philosophie: 13.5 }, { classe: 12, appreciation: "Très bon trimestre, élève motivée et rigoureuse." })],
      bacPremiere: { francaisEcrit: "15", francaisOral: "16", maths: "12" },
      experiences: [{ type: "responsabilite", titre: "Élue au CVL" }],
    }),
    reponses: { matieres: ["hg", "lettres", "langues"], maths_defi: 1, eco_actu: 3, finance: 1, politique: 5, argumenter: 5, regles: 5, entreprendre: 2, data: 1,
      technique: 1, societe: 5, creer: 2, soigner: 2, vivant: 1, secteurs: ["droit", "public"], salaire: 3, concret: 2,
      maths_niv: "0", ecrit_niv: "3", cadre: 3, poly: "ouvert", charge: "forte", ambition: 4, tests: 3, long: 5, etranger: "echange", anglais: 4,
      pays: ["Espagne", "Italie"], budget: "faible", lieu: ["idf", "regions"], mobilite: "partout" },
  },
  {
    id: "sante-svt",
    description: "13 de moyenne, SVT + physique-chimie, veut travailler dans la santé",
    profil: profil({
      specialites: ["SVT", "physique_chimie"], specialiteAbandonnee: "maths", optionMaths: "complementaires", anglaisAuto: "B1", lycee: NICE,
      periodes: [periode("Terminale – T1", 13.2, { SVT: 14, physique_chimie: 12.5, maths_complementaires: 12 }, { classe: 12.4 })],
      experiences: [{ type: "benevolat", titre: "Bénévolat Croix-Rouge" }],
    }),
    reponses: { matieres: ["svt", "pc"], maths_defi: 2, eco_actu: 1, finance: 1, politique: 2, argumenter: 3, regles: 2, entreprendre: 2, data: 2,
      technique: 2, societe: 4, creer: 2, soigner: 5, vivant: 5, secteurs: ["sante", "vivant"], salaire: 3, concret: 5,
      maths_niv: "1", ecrit_niv: "1", cadre: 4, poly: "specialiser", charge: "forte", ambition: 4, tests: 2, long: 5, etranger: "non", anglais: 2,
      pays: ["aucun"], budget: "gratuit", lieu: ["regions"], mobilite: "proche" },
  },
  {
    id: "indecis",
    description: "12,5 de moyenne, SES + SVT, ne sait pas ce qu'il veut : réponses neutres",
    profil: profil({
      specialites: ["SES", "SVT"], specialiteAbandonnee: "LLCER_anglais", anglaisAuto: "B1",
      periodes: [periode("Terminale – T1", 12.5, { SES: 12.8, SVT: 12.2 }, { classe: 12.2 })],
    }),
    reponses: { matieres: ["ses", "svt", "eps"], maths_defi: 3, eco_actu: 3, finance: 3, politique: 3, argumenter: 3, regles: 3, entreprendre: 3, data: 3,
      technique: 3, societe: 3, creer: 3, soigner: 3, vivant: 3, secteurs: ["sport", "culture"], salaire: 3, concret: 3,
      maths_niv: "1", ecrit_niv: "1", cadre: 3, poly: "ouvert", charge: "moyenne", ambition: 3, tests: 3, long: 3, etranger: "plutot", anglais: 3,
      pays: ["autre_europe"], budget: "faible", lieu: ["partout"], mobilite: "partout" },
  },
  {
    id: "fragile",
    description: "9,5 de moyenne, SES + AMC, appréciations négatives : la liste doit rester prudente",
    profil: profil({
      specialites: ["SES", "AMC"], specialiteAbandonnee: "HGGSP", anglaisAuto: "B1", lycee: NICE,
      periodes: [periode("Terminale – T1", 9.5, { SES: 9, AMC: 11, maths: 7 }, { classe: 11.5, appreciation: "Trimestre insuffisant, manque de travail et de sérieux.", mention: "Avertissement travail" })],
    }),
    reponses: { matieres: ["ses", "langues"], maths_defi: 1, eco_actu: 3, finance: 2, politique: 2, argumenter: 2, regles: 2, entreprendre: 4, data: 1,
      technique: 1, societe: 3, creer: 3, soigner: 2, vivant: 2, secteurs: ["marketing", "medias"], salaire: 4, concret: 5,
      maths_niv: "0", ecrit_niv: "1", cadre: 4, poly: "ouvert", charge: "moyenne", ambition: 2, tests: 1, long: 1, etranger: "non", anglais: 3,
      pays: ["aucun"], budget: "gratuit", lieu: ["regions"], mobilite: "domicile" },
  },
  {
    id: "international-langues",
    description: "15,5 de moyenne, LLCER anglais + HGGSP, veut partir étudier à l'étranger",
    profil: profil({
      specialites: ["LLCER_anglais", "HGGSP"], specialiteAbandonnee: "SES", anglaisAuto: "C1",
      periodes: [periode("Terminale – T1", 15.5, { LLCER_anglais: 17, HGGSP: 15 }, { classe: 12.3, appreciation: "Excellent travail, très bonne participation." })],
      certifications: [{ type: "IELTS", score: "7.5" }],
      experiences: [{ type: "autre", titre: "Échange scolaire au Canada" }],
    }),
    reponses: { matieres: ["langues", "hg"], maths_defi: 2, eco_actu: 3, finance: 2, politique: 4, argumenter: 4, regles: 2, entreprendre: 3, data: 2,
      technique: 1, societe: 4, creer: 3, soigner: 1, vivant: 2, secteurs: ["public", "medias", "culture"], salaire: 3, concret: 3,
      maths_niv: "1", ecrit_niv: "2", cadre: 2, poly: "ouvert", charge: "forte", ambition: 4, tests: 4, long: 4, etranger: "oui", anglais: 5,
      pays: ["Royaume-Uni", "Pays-Bas", "Canada", "Espagne"], budget: "eleve", lieu: ["partout"], mobilite: "partout" },
  },
  {
    id: "premiere-arts",
    description: "Élève de première, 13 de moyenne, spécialité arts, veut un parcours créatif",
    profil: profil({
      niveau: "premiere", specialites: ["arts", "HLP", "SES"], anglaisAuto: "B1",
      periodes: [periode("Première – T1", 13, { arts: 16, HLP: 13, SES: 11.5 }, { classe: 12 })],
    }),
    reponses: { matieres: ["arts", "lettres"], maths_defi: 1, eco_actu: 2, finance: 1, politique: 2, argumenter: 3, regles: 1, entreprendre: 3, data: 1,
      technique: 2, societe: 3, creer: 5, soigner: 1, vivant: 2, secteurs: ["arts", "medias", "culture"], salaire: 2, concret: 4,
      maths_niv: "0", ecrit_niv: "2", cadre: 2, poly: "specialiser", charge: "moyenne", ambition: 3, tests: 2, long: 3, etranger: "plutot", anglais: 3,
      pays: ["Italie", "Espagne"], budget: "faible", lieu: ["idf", "lyon"], mobilite: "partout" },
  },
];
