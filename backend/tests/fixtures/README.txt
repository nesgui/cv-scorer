Fixtures pour tests manuels / non régression
==========================================

Pour tester l'extraction PDF réelle avec des CV anonymisés :

1. Anonymiser un PDF (noms, contacts, entreprises fictifs).
2. Enregistrer le fichier sous : cv_anon.pdf
3. Lancer : pytest tests/test_extractors.py -k anon (si le test optionnel est présent)

Les tests CI n'exigent pas de PDF binaire : ils utilisent des mocks ou des .txt.
