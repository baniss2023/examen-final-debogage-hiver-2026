Examen final débogage hiver 2026 — version Firebase avec preuve de vérification

À publier sur GitHub Pages :
- index.html
- script.js
- style.css
- style_print.css
- droits.html
- assets/

Ne jamais publier :
- serviceAccountKey.json
- codes-enseignant.txt
- le dossier aa-firebase-codes-debogage-hiver-2026

Nouveautés de cette version :
- validation du code à 10 chiffres avec Firebase Firestore ;
- identité verrouillée après validation ;
- code utilisé inscrit dans le formulaire et dans le PDF ;
- heure d’activation inscrite dans le formulaire et dans le PDF ;
- ID de session inscrit dans le formulaire et dans le PDF ;
- empreinte de vérification inscrite dans le formulaire et dans le PDF ;
- trace Firebase dans accessLogs/{sessionId}.

Règles Firestore nécessaires : utiliser la version fournie par ChatGPT avec les champs verificationFingerprint, verificationSource, studentGroup, activationClientIso et activationClientText.


Mise à jour : l’export PDF est maintenant une remise finale. Après confirmation, la copie est verrouillée localement, une heure d’export final et une empreinte de copie finale sont inscrites dans le PDF et une trace est ajoutée dans Firebase accessLogs.
