Version Firebase avec preuve de vérification et verrouillage dur après export final.

À publier sur GitHub Pages :
- index.html
- style.css
- style_print.css
- script.js
- droits.html
- assets/
- README.txt
- README_PUBLICATION.txt
- FIRESTORE_RULES_PREUVE_VERIFICATION.txt

À ne jamais publier :
- serviceAccountKey.json
- codes-enseignant.txt
- dossier aa-firebase-codes-debogage-hiver-2026

Fonctions principales :
- validation du code unique via Firebase Firestore ;
- identité verrouillée après validation ;
- preuve de vérification dans le PDF ;
- minuterie et plein écran ;
- incidents uniquement pour sorties du plein écran ;
- export PDF considéré comme remise finale ;
- après export final, reprise interdite même après fermeture, retour arrière, restauration du navigateur ou rechargement ;
- réexport possible seulement de la copie finale verrouillée.
