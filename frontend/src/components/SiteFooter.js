import React from 'react';

export default function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer" role="contentinfo">
      <div className="footer-inner">
        <p className="footer-line">
          <strong>Filtre CV</strong>
          <span className="footer-sep-dot" aria-hidden>
            ·
          </span>
          <span>© {year} Coris Bank International</span>
          <span className="footer-sep-dot" aria-hidden>
            ·
          </span>
          <span className="footer-muted">IA indicative — usage interne</span>
        </p>
        <details className="footer-legal">
          <summary>Données personnelles &amp; conservation</summary>
          <div className="footer-legal-body">
            <p>
              <strong>Finalité.</strong> Traitement des CV pour évaluer l&apos;adéquation à un poste au sein de
              Coris Bank International (RH / managers habilités).
            </p>
            <p>
              <strong>Conservation.</strong> Les fichiers CV ne sont pas conservés sur les serveurs après
              l&apos;analyse : ils sont traités en mémoire puis oubliés. Seuls votre navigateur peut mémoriser un
              historique local si vous utilisez cette fonction.
            </p>
            <p>
              <strong>Accès.</strong> Données visibles par les utilisateurs de l&apos;outil et les systèmes
              d&apos;hébergement conformément à la politique interne. Pour exercer vos droits (accès,
              rectification, etc.), contactez le service RH / DPO interne.
            </p>
          </div>
        </details>
      </div>
    </footer>
  );
}
