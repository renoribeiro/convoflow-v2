/**
 * Ilustração da tela de manutenção.
 *
 * SVG inline, sem dependência nova e sem arquivo de imagem: são ~60 linhas que
 * já viajam no bundle da rota e herdam a cor da marca por `currentColor`, então
 * funcionam no claro e no escuro sem duas versões.
 *
 * A cena é uma janela de aplicativo com duas engrenagens girando devagar —
 * "alguém está mexendo aqui dentro", não "algo quebrou". As engrenagens giram
 * em sentidos opostos, como engrenagens de verdade; giro rápido daria ansiedade
 * e é o oposto do recado. `prefers-reduced-motion` para o giro para quem pediu
 * menos animação — a ilustração continua fazendo sentido parada.
 */
export const MaintenanceIllustration = () => (
  <svg
    viewBox="0 0 200 140"
    className="w-52 h-auto text-brand-primary"
    role="img"
    aria-label="Ilustração de um sistema em manutenção"
  >
    <style>
      {`
        @keyframes cf-gira      { to { transform: rotate(360deg); } }
        @keyframes cf-gira-anti  { to { transform: rotate(-360deg); } }
        .cf-engrenagem-grande {
          transform-box: fill-box;
          transform-origin: center;
          animation: cf-gira 9s linear infinite;
        }
        .cf-engrenagem-pequena {
          transform-box: fill-box;
          transform-origin: center;
          animation: cf-gira-anti 6s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .cf-engrenagem-grande, .cf-engrenagem-pequena { animation: none; }
        }
      `}
    </style>

    {/* Chão: só uma sombra suave para a janela não flutuar no nada. */}
    <ellipse cx="100" cy="126" rx="62" ry="6" fill="currentColor" opacity="0.07" />

    {/* Janela do aplicativo */}
    <rect
      x="26"
      y="20"
      width="148"
      height="96"
      rx="10"
      fill="currentColor"
      opacity="0.06"
    />
    <rect
      x="26"
      y="20"
      width="148"
      height="96"
      rx="10"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      opacity="0.5"
    />
    {/* Barra de título com os três pontinhos */}
    <path
      d="M26 34 h148"
      stroke="currentColor"
      strokeWidth="2.5"
      opacity="0.35"
    />
    <circle cx="38" cy="27" r="2.4" fill="currentColor" opacity="0.4" />
    <circle cx="47" cy="27" r="2.4" fill="currentColor" opacity="0.4" />
    <circle cx="56" cy="27" r="2.4" fill="currentColor" opacity="0.4" />

    {/* Engrenagem grande */}
    <g className="cf-engrenagem-grande">
      <path
        d="M88 60 l4.6-1.2a17 17 0 0 1 2-4.8l-2.4-4.1 5-5 4.1 2.4a17 17 0 0 1 4.8-2L107.3 40h7.1l1.2 4.6a17 17 0 0 1 4.8 2l4.1-2.4 5 5-2.4 4.1a17 17 0 0 1 2 4.8l4.6 1.2v7.1l-4.6 1.2a17 17 0 0 1-2 4.8l2.4 4.1-5 5-4.1-2.4a17 17 0 0 1-4.8 2L114.4 86h-7.1l-1.2-4.6a17 17 0 0 1-4.8-2l-4.1 2.4-5-5 2.4-4.1a17 17 0 0 1-2-4.8L88 67.1z"
        fill="currentColor"
        opacity="0.85"
      />
      <circle cx="110.8" cy="63.5" r="7.4" className="fill-card" />
    </g>

    {/* Engrenagem pequena, encaixada na grande */}
    <g className="cf-engrenagem-pequena">
      <path
        d="M62 82 l3.4-.9a12 12 0 0 1 1.4-3.4l-1.7-3 3.5-3.5 3 1.7a12 12 0 0 1 3.4-1.4l.9-3.4h5l.9 3.4a12 12 0 0 1 3.4 1.4l3-1.7 3.5 3.5-1.7 3a12 12 0 0 1 1.4 3.4l3.4.9v5l-3.4.9a12 12 0 0 1-1.4 3.4l1.7 3-3.5 3.5-3-1.7a12 12 0 0 1-3.4 1.4l-.9 3.4h-5l-.9-3.4a12 12 0 0 1-3.4-1.4l-3 1.7-3.5-3.5 1.7-3a12 12 0 0 1-1.4-3.4L62 87z"
        fill="currentColor"
        opacity="0.55"
      />
      <circle cx="78.9" cy="84.5" r="5" className="fill-card" />
    </g>
  </svg>
);
