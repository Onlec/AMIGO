import React from 'react';
import RotaryIndex from './RotaryIndex.jsx';

// Eén echte, werkende tool (de datumprikker) plus een handvol
// voorbeeldkaarten — net als in het AMIGO-artefact zelf, waar ook maar
// één van de twaalf kaarten effectief was uitgewerkt. Dat houdt het wiel
// visueel vol zonder features te verzinnen die er niet zijn.
const TOOLS = [
  {
    letter: 'D',
    title: 'Datumprikker',
    category: 'Planner',
    blurb: 'Prik een datum met je groep: stemmen, bewerken en bevestigen in één overzicht.',
    live: true,
    href: '?page=planner',
  },
  {
    letter: 'B',
    title: 'Btw-calculator',
    category: 'Calculate',
    blurb: 'Netto, btw en totaal in drie tarieven.',
    live: false,
  },
  {
    letter: 'E',
    title: 'Eenhedenomrekenaar',
    category: 'Convert',
    blurb: 'Lengte, gewicht en temperatuur omzetten.',
    live: false,
  },
  {
    letter: 'F',
    title: 'Factuurnummers',
    category: 'Organize',
    blurb: 'Doorlopende, sluitende nummering.',
    live: false,
  },
  {
    letter: 'N',
    title: 'Notities',
    category: 'Organize',
    blurb: 'Korte aantekeningen per project.',
    live: false,
  },
  {
    letter: 'U',
    title: 'Uurtariefberekening',
    category: 'Calculate',
    blurb: 'Een kostendekkend tarief uitrekenen.',
    live: false,
  },
];

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="hr">
          <div className="lab">AMI — vriend · GO — beweging</div>
          <div>
            <h1>Wherever, whenever.</h1>
            <p>Jouw vriend onderweg. Praktische digitale tools voor het dagelijks leven, altijd binnen handbereik.</p>
          </div>
          <div className="row">
            <a className="btn red" href="?page=planner">
              Kies een tool
            </a>
            <span className="lab">Sectie 00 / Introductie</span>
          </div>
        </div>
        <div className="hl">
          <div className="lab cap">
            <span>Fig. 01</span>
            <span>Mechanisme</span>
          </div>
          <svg viewBox="0 0 400 340" role="img" aria-label="Technische tekening van een spoelmechanisme">
            <g fill="none" stroke="#171A19" strokeWidth="1.5">
              <g className="reel" id="rA">
                <circle cx="110" cy="120" r="72" />
                <circle cx="110" cy="120" r="56" strokeDasharray="3 4" />
                <circle cx="110" cy="120" r="12" fill="#171A19" />
                <path d="M110 120V64M110 120L158.5 148M110 120L61.5 148" />
              </g>
              <g className="reel" id="rB">
                <circle cx="290" cy="120" r="72" />
                <circle cx="290" cy="120" r="56" strokeDasharray="3 4" />
                <circle cx="290" cy="120" r="12" fill="#171A19" />
                <path d="M290 120V64M290 120L338.5 148M290 120L241.5 148" />
              </g>
              <path d="M110 192L140 262M260 262L290 192M140 262H260" stroke="#A83232" strokeWidth="3.5" />
              <circle cx="140" cy="262" r="9" fill="#F5F4ED" />
              <circle cx="260" cy="262" r="9" fill="#F5F4ED" />
              <rect x="185" y="250" width="30" height="24" fill="#171A19" />
              <path d="M110 306V318M290 306V318M110 312H290M110 308V316M290 308V316" strokeWidth="1" />
              <path d="M40 120H24M376 120H360M200 20V48" strokeWidth="1" />
            </g>
            <g fontFamily="Inter,sans-serif" fontSize="9.5" fontWeight="600" letterSpacing="1" fill="#171A19">
              <text x="110" y="334" textAnchor="middle">
                NOMINAAL 180 EENHEDEN
              </text>
              <text x="200" y="14" textAnchor="middle">
                ① SPOEL A
              </text>
              <g fill="#A83232">
                <circle cx="50" cy="206" r="9" />
                <circle cx="350" cy="206" r="9" />
                <circle cx="200" cy="292" r="9" />
              </g>
              <g fill="#fff" textAnchor="middle">
                <text x="50" y="209.5">
                  2
                </text>
                <text x="350" y="209.5">
                  3
                </text>
                <text x="200" y="295.5">
                  4
                </text>
              </g>
            </g>
          </svg>
          <div className="lab cap">
            <span>① Spoel · ② Band · ③ Spoel · ④ Kop</span>
            <span>AMG / 01</span>
          </div>
        </div>
      </section>

      <section className="sec" id="merk">
        <div className="wrap">
          <div className="sh">
            <div className="no">01</div>
            <div>
              <h2>Een vriend die altijd meegaat</h2>
              <p>
                AMIGO is een digitaal platform met praktische, toegankelijke tools voor elke dag. De naam combineert
                twee delen en één belofte.
              </p>
            </div>
          </div>
          <div className="three">
            <div>
              <span className="lab">Naam</span>
              <div className="big">AMI + GO</div>
              <p>Ami is Frans voor vriend. Go staat voor beweging en actie.</p>
            </div>
            <div>
              <span className="lab">1.1</span>
              <h3>Toegankelijk</h3>
              <p>Tools zijn makkelijk te vinden en te gebruiken.</p>
            </div>
            <div>
              <span className="lab">1.2</span>
              <h3>Praktisch</h3>
              <p>Elke functie lost een herkenbaar probleem op.</p>
            </div>
            <div>
              <span className="lab">1.3</span>
              <h3>Betrouwbaar</h3>
              <p>Een consistente, degelijke ervaring.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="sec dark" id="index">
        <div className="wrap">
          <div className="sh">
            <div className="no">02</div>
            <div>
              <h2>Rotary Index</h2>
              <p>
                De huidige kaart staat rechtop, de vorige ligt voor je uitgeklapt en de volgende staat erachter. De
                index draait eindeloos rond. Scroll, sleep of gebruik de pijltjestoetsen.
              </p>
            </div>
          </div>
          <RotaryIndex items={TOOLS} />
        </div>
      </section>

      <footer className="foot">
        <div className="wrap">
          <h2>
            Wherever,
            <br />
            whenever
            <em>.</em>
          </h2>
          <div className="row">
            <span className="lab">Your friend on the go. Your tools for everyday life.</span>
            <span className="lab">AMIGO · Design system 3.0</span>
          </div>
        </div>
      </footer>
    </>
  );
}
