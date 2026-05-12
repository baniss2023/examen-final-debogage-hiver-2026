Examen final débogage hiver 2026 — version GitHub Pages + Firebase Firestore

À publier sur GitHub Pages :
- index.html
- style.css
- style_print.css
- script.js
- droits.html
- assets/

Ne jamais publier sur GitHub :
- serviceAccountKey.json
- generate-codes.js
- import-codes.js
- codes-enseignant.txt
- tout dossier privé contenant les codes ou la clé Firebase Admin

Fonctionnement :
1. L'étudiant entre son nom, son numéro étudiant, son groupe et son code à 10 chiffres.
2. Firebase vérifie le code dans examens/debogage_hiver_2026/codes.
3. Si le code est disponible, il devient utilisé.
4. Le même code ne peut plus ouvrir l'examen sur un autre appareil.
5. Une fois l'accès validé, les réponses restent locales dans le navigateur jusqu'à l'export PDF.

Version identité verrouillée :
- Après validation du code Firebase, le nom, le numéro étudiant, le groupe et le code sont verrouillés dans le formulaire.
- L'export PDF reprend les valeurs validées depuis la session locale, pas depuis une saisie modifiable.
- Le PDF affiche le code, l'heure d'activation et l'ID de session pour comparaison avec les journaux Firebase.
